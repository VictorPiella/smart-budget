from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, CallbackQueryHandler
import asyncio
import html
import httpx
import json
import logging
import os
import sys
import time
import uuid
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from config.config import ALLOWED_TELEGRAM_USERS, BOT_TOKEN, PDF_UPLOAD_FOLDER, SB_BASE_URL
from src.pdf_processor_to_markdown import process_pdf_to_markdown
from src.pdf_processor_to_excel import process_pdf_to_excel
from src.pdf_processor_to_transactions import extract_transactions_from_markdown

logger = logging.getLogger(__name__)

SESSIONS_FILE = Path(PDF_UPLOAD_FOLDER) / 'sessions.json'

MAX_PDF_BYTES   = 20 * 1024 * 1024   # Telegram bots can't download >20 MB anyway
UPLOAD_TTL_SECS = 60 * 60            # uploaded statements are deleted after 1 h


class AuthExpired(Exception):
    """The stored API token was revoked or is no longer valid."""


class FinanceBot:
    def __init__(self):
        self.application = Application.builder().token(BOT_TOKEN).build()
        # short_id → {"user_id", "path", "created"}; uploads are bound to their owner
        self.file_paths = {}
        self._md_cache  = {}   # short_id → markdown string (avoid re-running docling)
        # docling is CPU/RAM heavy: process one PDF at a time
        self._pdf_semaphore = asyncio.Semaphore(1)
        # Passwords from sessions.json written by older bot versions. Kept in
        # memory only, until they're exchanged for an API token.
        self._legacy_passwords = {}
        self._user_sessions = self._load_sessions()
        self._login_step = {}
        self._purge_orphan_uploads()
        self._setup_handlers()

    # ── Session persistence ───────────────────────────────────────────────────
    # sessions.json stores {telegram_user_id: {email, api_token, api_token_id}}.
    # The SmartBudget password is never written to disk: /login exchanges it
    # for a revocable API token (POST /auth/api-tokens).

    def _load_sessions(self) -> dict:
        if not SESSIONS_FILE.exists():
            return {}
        try:
            raw = json.loads(SESSIONS_FILE.read_text())
        except Exception:
            logger.exception("Failed to load sessions — starting fresh")
            return {}
        sessions = {}
        for k, v in raw.items():
            uid = int(k)
            if v.get('api_token'):
                sessions[uid] = {
                    'email':        v['email'],
                    'api_token':    v['api_token'],
                    'api_token_id': v.get('api_token_id'),
                }
            elif v.get('password'):
                sessions[uid] = {'email': v['email'], 'api_token': None, 'api_token_id': None}
                self._legacy_passwords[uid] = v['password']
        logger.info("Loaded %d session(s) from %s", len(sessions), SESSIONS_FILE)
        if self._legacy_passwords:
            logger.warning("Removing %d plaintext password(s) from %s", len(self._legacy_passwords), SESSIONS_FILE)
        self._save_sessions(sessions)
        return sessions

    def _save_sessions(self, sessions: dict = None) -> None:
        sessions = self._user_sessions if sessions is None else sessions
        SESSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = SESSIONS_FILE.with_suffix('.tmp')
        persisted = {
            str(uid): {'email': s['email'], 'api_token': s['api_token'], 'api_token_id': s['api_token_id']}
            for uid, s in sessions.items()
            if s.get('api_token')
        }
        # Create with 0600 so the tokens are readable only by the bot's user
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as f:
            json.dump(persisted, f, indent=2)
        tmp.replace(SESSIONS_FILE)

    def _is_logged_in(self, user_id: int) -> bool:
        return user_id in self._user_sessions

    def _is_allowed(self, user_id: int) -> bool:
        return not ALLOWED_TELEGRAM_USERS or user_id in ALLOWED_TELEGRAM_USERS

    def _drop_session(self, user_id: int) -> None:
        self._user_sessions.pop(user_id, None)
        self._legacy_passwords.pop(user_id, None)
        self._save_sessions()

    # ── Upload housekeeping ───────────────────────────────────────────────────

    def _purge_orphan_uploads(self) -> None:
        """PDFs left behind by a previous run can no longer be referenced — delete them."""
        folder = Path(PDF_UPLOAD_FOLDER)
        if not folder.is_dir():
            return
        for pdf in folder.glob('*.pdf'):
            try:
                pdf.unlink()
            except OSError:
                logger.warning("Could not delete orphan upload %s", pdf)

    def _purge_expired_uploads(self) -> None:
        now = time.time()
        for short_id, entry in list(self.file_paths.items()):
            if now - entry['created'] > UPLOAD_TTL_SECS:
                self._forget_upload(short_id)

    def _forget_upload(self, short_id: str) -> None:
        entry = self.file_paths.pop(short_id, None)
        self._md_cache.pop(short_id, None)
        if entry:
            try:
                os.remove(entry['path'])
            except OSError:
                pass

    def _get_upload(self, short_id: str, user_id: int):
        """Return the PDF path for this upload if it exists and belongs to user_id."""
        entry = self.file_paths.get(short_id)
        if not entry or entry['user_id'] != user_id or not os.path.exists(entry['path']):
            return None
        return entry['path']

    # ── SmartBudget API helpers ───────────────────────────────────────────────

    async def _create_api_token(self, client: httpx.AsyncClient, email: str, password: str, user_id: int) -> dict:
        """Exchange email/password for a long-lived API token. Raises PermissionError on bad credentials."""
        resp = await client.post(f"{SB_BASE_URL}/auth/login", data={"username": email, "password": password})
        if resp.status_code in (401, 403):
            raise PermissionError(resp.json().get("detail", "Credenciales incorrectas"))
        resp.raise_for_status()
        jwt = resp.json()['access_token']
        resp = await client.post(
            f"{SB_BASE_URL}/auth/api-tokens",
            json={"name": f"Telegram bot ({user_id})"},
            headers={"Authorization": f"Bearer {jwt}"},
        )
        resp.raise_for_status()
        return resp.json()

    async def _get_sb_token(self, user_id: int, client: httpx.AsyncClient) -> str:
        session = self._user_sessions.get(user_id)
        if not session:
            raise AuthExpired()
        if session.get('api_token'):
            return session['api_token']
        # Legacy session: migrate the in-memory password to an API token once
        password = self._legacy_passwords.pop(user_id, None)
        if not password:
            self._drop_session(user_id)
            raise AuthExpired()
        try:
            created = await self._create_api_token(client, session['email'], password, user_id)
        except PermissionError:
            self._drop_session(user_id)
            raise AuthExpired()
        session['api_token']    = created['token']
        session['api_token_id'] = created['id']
        self._save_sessions()
        return session['api_token']

    async def _sb_request(self, user_id: int, method: str, path: str, timeout: int = 30, **kwargs):
        async with httpx.AsyncClient(timeout=timeout) as client:
            token = await self._get_sb_token(user_id, client)
            resp = await client.request(
                method, f"{SB_BASE_URL}{path}",
                headers={"Authorization": f"Bearer {token}"},
                **kwargs,
            )
        if resp.status_code == 401:
            self._drop_session(user_id)
            raise AuthExpired()
        resp.raise_for_status()
        return resp.json() if resp.content else None

    async def _sb_get_accounts(self, user_id: int) -> list:
        return await self._sb_request(user_id, "GET", "/accounts")

    async def _sb_import(self, user_id: int, account_id: str, transactions: list) -> dict:
        return await self._sb_request(
            user_id, "POST", f"/accounts/{account_id}/import/auto",
            timeout=60, json={"transactions": transactions},
        )

    # ── Handler setup ─────────────────────────────────────────────────────────

    def _setup_handlers(self):
        self.application.add_handler(CommandHandler("start",  self.start))
        self.application.add_handler(CommandHandler("help",   self.help))
        self.application.add_handler(CommandHandler("login",  self.cmd_login))
        self.application.add_handler(CommandHandler("logout", self.cmd_logout))
        self.application.add_handler(CommandHandler("status", self.cmd_status))
        self.application.add_handler(MessageHandler(filters.Document.PDF, self.handle_pdf))
        self.application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_text))
        self.application.add_handler(CallbackQueryHandler(self.handle_button))

    async def _reject_if_not_allowed(self, update: Update) -> bool:
        if self._is_allowed(update.effective_user.id):
            return False
        logger.info("Rejected Telegram user %s (not in ALLOWED_TELEGRAM_USERS)", update.effective_user.id)
        if update.callback_query:
            await update.callback_query.answer("No autorizado.")
        elif update.message:
            await update.message.reply_text("⛔ Este bot es privado.")
        return True

    # ── Commands ──────────────────────────────────────────────────────────────

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if await self._reject_if_not_allowed(update):
            return
        await update.message.reply_text(
            "¡Hola! Envíame un PDF de Trade Republic y te ayudaré a procesarlo.\n\n"
            "Usa /login para conectar tu cuenta de SmartBudget e importar transacciones."
        )

    async def help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if await self._reject_if_not_allowed(update):
            return
        await update.message.reply_text(
            "Envíame un PDF de Trade Republic y podrás:\n\n"
            "📋 Markdown — ver tabla directamente en Telegram\n"
            "📊 Excel — descargar archivo .xlsx\n"
            "📥 Import to SmartBudget — importar transacciones\n\n"
            "Comandos:\n"
            "/login  — conectar cuenta SmartBudget\n"
            "/logout — desconectar cuenta\n"
            "/status — ver cuenta conectada"
        )

    async def cmd_login(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if await self._reject_if_not_allowed(update):
            return
        user_id = update.effective_user.id
        self._login_step[user_id] = "awaiting_email"
        await update.message.reply_text(
            "🔐 Vamos a conectar tu cuenta SmartBudget.\n\n¿Cuál es tu email?"
        )

    async def cmd_logout(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_id = update.effective_user.id
        session = self._user_sessions.get(user_id)
        if session and session.get('api_token_id'):
            # Best effort: revoke the token server-side so it stops working everywhere
            try:
                await self._sb_request(user_id, "DELETE", f"/auth/api-tokens/{session['api_token_id']}")
            except Exception:
                logger.warning("Could not revoke API token for Telegram user %s", user_id)
        if user_id in self._user_sessions:
            self._drop_session(user_id)
        self._login_step.pop(user_id, None)
        await update.message.reply_text("✅ Sesión cerrada correctamente.")

    async def cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if await self._reject_if_not_allowed(update):
            return
        session = self._user_sessions.get(update.effective_user.id)
        if session:
            await update.message.reply_text(
                f"✅ Conectado como <b>{html.escape(session['email'])}</b>",
                parse_mode="HTML",
            )
        else:
            await update.message.reply_text(
                "❌ No conectado. Usa /login para conectar tu cuenta SmartBudget."
            )

    # ── Text handler (login flow) ─────────────────────────────────────────────

    async def handle_text(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if await self._reject_if_not_allowed(update):
            return
        user_id = update.effective_user.id
        step = self._login_step.get(user_id)

        # Waiting for email
        if step == "awaiting_email":
            email = (update.message.text or "").strip()
            if not email or "@" not in email:
                await update.message.reply_text("Eso no parece un email válido. Inténtalo de nuevo:")
                return
            self._login_step[user_id] = f"awaiting_password:{email}"
            await update.message.reply_text(
                "¡Perfecto! Ahora envía tu contraseña.\n"
                "<i>Borraré el mensaje y no la guardaré: solo se usa para obtener un token de acceso "
                "que puedes revocar con /logout.</i>",
                parse_mode="HTML",
            )
            return

        # Waiting for password
        if step and step.startswith("awaiting_password:"):
            email    = step.split(":", 1)[1]
            password = (update.message.text or "").strip()

            # Delete password message immediately
            try:
                await update.message.delete()
            except Exception:
                pass

            if not password:
                await update.effective_chat.send_message("La contraseña no puede estar vacía. Inténtalo de nuevo:")
                return

            status_msg = await update.effective_chat.send_message("⏳ Verificando credenciales…")
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    created = await self._create_api_token(client, email, password, user_id)
            except PermissionError as exc:
                await status_msg.edit_text(f"❌ {exc} Envía tu contraseña de nuevo:")
                return
            except Exception as exc:
                logger.exception("Login against SmartBudget failed")
                self._login_step.pop(user_id, None)
                await status_msg.edit_text(f"❌ No se pudo conectar con SmartBudget: {exc}")
                return
            finally:
                del password

            self._legacy_passwords.pop(user_id, None)
            self._user_sessions[user_id] = {
                "email": email, "api_token": created['token'], "api_token_id": created['id'],
            }
            self._save_sessions()
            self._login_step.pop(user_id, None)
            await status_msg.edit_text(
                f"✅ <b>Conectado como {html.escape(email)}</b>\n\nEnvíame un PDF de Trade Republic.",
                parse_mode="HTML",
            )
            return

        # Default
        await update.message.reply_text(
            "Envíame un PDF de Trade Republic. Usa /help para más opciones."
        )

    # ── PDF handler ───────────────────────────────────────────────────────────

    async def handle_pdf(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if await self._reject_if_not_allowed(update):
            return
        user_id = update.effective_user.id
        # Without an explicit allowlist, only users with a SmartBudget account
        # may make the server run docling.
        if not ALLOWED_TELEGRAM_USERS and not self._is_logged_in(user_id):
            await update.message.reply_text("🔐 Primero conecta tu cuenta con /login y vuelve a enviar el PDF.")
            return
        document = update.message.document
        if document.file_size and document.file_size > MAX_PDF_BYTES:
            await update.message.reply_text("El PDF es demasiado grande (máximo 20 MB).")
            return

        self._purge_expired_uploads()
        try:
            file     = await context.bot.get_file(document)
            short_id = uuid.uuid4().hex[:12]

            os.makedirs(PDF_UPLOAD_FOLDER, exist_ok=True)
            pdf_path = os.path.join(PDF_UPLOAD_FOLDER, f"{short_id}.pdf")
            await file.download_to_drive(pdf_path)
            self.file_paths[short_id] = {"user_id": user_id, "path": pdf_path, "created": time.time()}

            await update.message.reply_text(
                "¿Qué quieres hacer con este PDF?",
                reply_markup=self._make_keyboard(short_id, user_id),
            )
        except Exception as e:
            logger.exception("PDF upload failed")
            await update.message.reply_text(f"Error al procesar el PDF: {str(e)}")

    async def _run_docling(self, func, pdf_path):
        async with self._pdf_semaphore:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, func, pdf_path)

    # ── Button handler ────────────────────────────────────────────────────────

    async def handle_button(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if await self._reject_if_not_allowed(update):
            return
        query   = update.callback_query
        user_id = update.effective_user.id

        try:
            await query.answer()
        except Exception:
            pass

        self._purge_expired_uploads()
        data = query.data

        # import_to:{short_id}:{account_id} — maxsplit=2 because account_id contains hyphens
        if data.startswith("import_to:"):
            parts = data.split(":", 2)
            await self._do_import(query, user_id, parts[1], parts[2], context)
            return

        # cancel:{short_id}
        if data.startswith("cancel:"):
            short_id = data.split(":", 1)[1]
            await query.edit_message_text(
                "Cancelado. ¿Qué más quieres hacer?",
                reply_markup=self._make_keyboard(short_id, user_id),
            )
            return

        # md:{short_id} / excel:{short_id} / import:{short_id}
        format_type, short_id = data.split(":", 1)

        pdf_path = self._get_upload(short_id, user_id)
        if not pdf_path:
            await query.edit_message_text("El archivo ya no está disponible. Por favor, vuelve a enviar el PDF.")
            return

        await query.edit_message_text("Procesando el PDF, por favor espera...")

        if format_type == "md":
            try:
                result = await self._run_docling(process_pdf_to_markdown, pdf_path)
                self._md_cache[short_id] = result   # cache for import button
                if len(result) > 3900:
                    result = result[:3900] + "\n... (truncado)"
                await query.edit_message_text(f"📋 Resultado:\n\n{result}")
            except Exception as e:
                await query.edit_message_text(f"Error al procesar a Markdown: {str(e)}")
            await query.message.reply_text(
                "¿Qué más quieres hacer?",
                reply_markup=self._make_keyboard(short_id, user_id),
            )

        elif format_type == "excel":
            try:
                excel_path = await self._run_docling(process_pdf_to_excel, pdf_path)
                if not excel_path or not os.path.exists(excel_path):
                    await query.edit_message_text("Error: No se pudo generar el archivo Excel.")
                    return
                await query.edit_message_text("Enviando archivo Excel...")
                try:
                    with open(excel_path, 'rb') as fh:
                        await context.bot.send_document(
                            chat_id=query.message.chat_id,
                            document=fh,
                            filename="transacciones.xlsx",
                        )
                finally:
                    try:
                        os.remove(excel_path)
                    except OSError:
                        pass
            except Exception as e:
                await query.edit_message_text(f"Error al procesar a Excel: {str(e)}")
            await query.message.reply_text(
                "¿Qué más quieres hacer?",
                reply_markup=self._make_keyboard(short_id, user_id),
            )

        elif format_type == "import":
            if not self._is_logged_in(user_id):
                await query.edit_message_text(
                    "❌ No conectado. Usa /login para conectar tu cuenta SmartBudget."
                )
                return
            await self._show_accounts(query, user_id, short_id)

    # ── Keyboard helper ───────────────────────────────────────────────────────

    def _make_keyboard(self, short_id: str, user_id: int) -> InlineKeyboardMarkup:
        keyboard = [[
            InlineKeyboardButton("📋 Markdown", callback_data=f"md:{short_id}"),
            InlineKeyboardButton("📊 Excel",    callback_data=f"excel:{short_id}"),
        ]]
        if self._is_logged_in(user_id):
            keyboard.append([
                InlineKeyboardButton("📥 Import to SmartBudget", callback_data=f"import:{short_id}"),
            ])
        return InlineKeyboardMarkup(keyboard)

    # ── Account selection ─────────────────────────────────────────────────────

    async def _show_accounts(self, query, user_id: int, short_id: str):
        await query.edit_message_text("⏳ Obteniendo cuentas…")
        try:
            accounts = await self._sb_get_accounts(user_id)
        except AuthExpired:
            await query.edit_message_text("🔐 Tu sesión ha caducado. Usa /login de nuevo.")
            return
        except Exception as exc:
            await query.edit_message_text(f"❌ Error al obtener cuentas: {exc}")
            return

        if not accounts:
            await query.edit_message_text("⚠️ No tienes cuentas en SmartBudget.")
            return

        buttons = [
            [InlineKeyboardButton(acc['name'], callback_data=f"import_to:{short_id}:{acc['id']}")]
            for acc in accounts
        ]
        buttons.append([InlineKeyboardButton("❌ Cancelar", callback_data=f"cancel:{short_id}")])
        await query.edit_message_text(
            "📂 ¿A qué cuenta quieres importar?",
            reply_markup=InlineKeyboardMarkup(buttons),
        )

    # ── Import execution ──────────────────────────────────────────────────────

    async def _do_import(self, query, user_id: int, short_id: str, account_id: str, context):
        pdf_path = self._get_upload(short_id, user_id)
        if not pdf_path:
            await query.edit_message_text("⚠️ Archivo no encontrado. Vuelve a enviar el PDF.")
            return

        # Reuse cached markdown if the Markdown button was already pressed;
        # otherwise run process_pdf_to_markdown (same docling call that already works).
        if short_id in self._md_cache:
            await query.edit_message_text("⏳ Importando…")
            markdown = self._md_cache[short_id]
        else:
            await query.edit_message_text("⏳ Procesando PDF e importando…")
            try:
                markdown = await self._run_docling(process_pdf_to_markdown, pdf_path)
                self._md_cache[short_id] = markdown
            except Exception as exc:
                await query.edit_message_text(f"❌ Error al procesar el PDF: {exc}")
                return

        try:
            transactions = extract_transactions_from_markdown(markdown)
        except Exception as exc:
            await query.edit_message_text(f"❌ Error al extraer transacciones: {exc}")
            return

        if not transactions:
            await query.edit_message_text(
                "⚠️ No se encontraron transacciones en el PDF.",
                reply_markup=self._make_keyboard(short_id, user_id),
            )
            return

        try:
            result = await self._sb_import(user_id, account_id, transactions)
        except AuthExpired:
            await query.edit_message_text("🔐 Tu sesión ha caducado. Usa /login de nuevo.")
            return
        except Exception as exc:
            await query.edit_message_text(
                f"❌ Error al importar: {exc}",
                reply_markup=self._make_keyboard(short_id, user_id),
            )
            return

        imported = result.get("imported", "?")
        skipped  = result.get("skipped_duplicates", 0)
        total    = result.get("total_rows", "?")

        # Imported: the statement is no longer needed on the server
        self._forget_upload(short_id)

        await query.edit_message_text(
            f"✅ <b>¡Importación completada!</b>\n\n"
            f"• Filas procesadas: {total}\n"
            f"• Importadas: {imported}\n"
            f"• Omitidas (duplicados): {skipped}\n\n"
            f"<i>El PDF se ha borrado del servidor.</i>",
            parse_mode="HTML",
        )

    def run(self):
        self.application.run_polling()
