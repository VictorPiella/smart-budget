from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, CallbackQueryHandler
import asyncio
import httpx
import json
import logging
import os
import sys
import uuid
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent))

from config.config import BOT_TOKEN, PDF_UPLOAD_FOLDER, SB_BASE_URL
from src.pdf_processor_to_markdown import process_pdf_to_markdown
from src.pdf_processor_to_excel import process_pdf_to_excel
from src.pdf_processor_to_transactions import extract_transactions_from_markdown

logger = logging.getLogger(__name__)

SESSIONS_FILE = Path(PDF_UPLOAD_FOLDER) / 'sessions.json'


class FinanceBot:
    def __init__(self):
        self.application = Application.builder().token(BOT_TOKEN).build()
        self.file_paths = {}
        self._md_cache  = {}   # short_id → markdown string (avoid re-running docling)
        self._user_sessions = self._load_sessions()
        self._login_step = {}
        self._setup_handlers()

    # ── Session persistence ───────────────────────────────────────────────────

    def _load_sessions(self) -> dict:
        if SESSIONS_FILE.exists():
            try:
                raw = json.loads(SESSIONS_FILE.read_text())
                sessions = {int(k): v for k, v in raw.items()}
                for s in sessions.values():
                    s.setdefault('jwt', None)
                logger.info("Loaded %d session(s) from %s", len(sessions), SESSIONS_FILE)
                return sessions
            except Exception:
                logger.exception("Failed to load sessions — starting fresh")
        return {}

    def _save_sessions(self) -> None:
        SESSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = SESSIONS_FILE.with_suffix('.tmp')
        tmp.write_text(json.dumps({
            str(uid): {'email': s['email'], 'password': s['password']}
            for uid, s in self._user_sessions.items()
        }, indent=2))
        tmp.replace(SESSIONS_FILE)

    def _is_logged_in(self, user_id: int) -> bool:
        return user_id in self._user_sessions

    # ── SmartBudget API helpers ───────────────────────────────────────────────

    async def _get_sb_token(self, user_id: int, client: httpx.AsyncClient) -> str:
        session = self._user_sessions.get(user_id)
        if not session:
            raise Exception("Not logged in")
        if session.get('jwt'):
            return session['jwt']
        resp = await client.post(
            f"{SB_BASE_URL}/auth/login",
            data={"username": session['email'], "password": session['password']},
        )
        if resp.status_code == 401:
            raise Exception("Credenciales incorrectas — usa /login de nuevo")
        resp.raise_for_status()
        session['jwt'] = resp.json()['access_token']
        return session['jwt']

    async def _sb_get_accounts(self, user_id: int) -> list:
        async with httpx.AsyncClient(timeout=30) as client:
            for attempt in range(2):
                token = await self._get_sb_token(user_id, client)
                resp = await client.get(
                    f"{SB_BASE_URL}/accounts",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if resp.status_code == 401 and attempt == 0:
                    self._user_sessions[user_id]['jwt'] = None
                    continue
                resp.raise_for_status()
                return resp.json()
        raise Exception("Auth failed")

    async def _sb_import(self, user_id: int, account_id: str, transactions: list) -> dict:
        async with httpx.AsyncClient(timeout=60) as client:
            for attempt in range(2):
                token = await self._get_sb_token(user_id, client)
                resp = await client.post(
                    f"{SB_BASE_URL}/accounts/{account_id}/import/auto",
                    json={"transactions": transactions},
                    headers={"Authorization": f"Bearer {token}"},
                )
                if resp.status_code == 401 and attempt == 0:
                    self._user_sessions[user_id]['jwt'] = None
                    continue
                resp.raise_for_status()
                return resp.json()
        raise Exception("Auth failed")

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

    # ── Commands ──────────────────────────────────────────────────────────────

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(
            "¡Hola! Envíame un PDF de Trade Republic y te ayudaré a procesarlo.\n\n"
            "Usa /login para conectar tu cuenta de SmartBudget e importar transacciones."
        )

    async def help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
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
        user_id = update.effective_user.id
        self._login_step[user_id] = "awaiting_email"
        await update.message.reply_text(
            "🔐 Vamos a conectar tu cuenta SmartBudget.\n\n¿Cuál es tu email?"
        )

    async def cmd_logout(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_id = update.effective_user.id
        if user_id in self._user_sessions:
            del self._user_sessions[user_id]
            self._save_sessions()
        self._login_step.pop(user_id, None)
        await update.message.reply_text("✅ Sesión cerrada correctamente.")

    async def cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        user_id = update.effective_user.id
        session = self._user_sessions.get(user_id)
        if session:
            await update.message.reply_text(
                f"✅ Conectado como *{session['email']}*",
                parse_mode="Markdown",
            )
        else:
            await update.message.reply_text(
                "❌ No conectado. Usa /login para conectar tu cuenta SmartBudget."
            )

    # ── Text handler (login flow) ─────────────────────────────────────────────

    async def handle_text(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
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
                "_La borraré inmediatamente._",
                parse_mode="Markdown",
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
                    resp = await client.post(
                        f"{SB_BASE_URL}/auth/login",
                        data={"username": email, "password": password},
                    )
                if resp.status_code == 401:
                    self._login_step[user_id] = f"awaiting_password:{email}"
                    await status_msg.edit_text("❌ Credenciales incorrectas. Envía tu contraseña de nuevo:")
                    return
                resp.raise_for_status()
                jwt = resp.json()['access_token']
            except Exception as exc:
                await status_msg.edit_text(f"❌ No se pudo conectar con SmartBudget: {exc}")
                return

            self._user_sessions[user_id] = {"email": email, "password": password, "jwt": jwt}
            self._save_sessions()
            del self._login_step[user_id]
            await status_msg.edit_text(
                f"✅ *Conectado como {email}*\n\nEnvíame un PDF de Trade Republic.",
                parse_mode="Markdown",
            )
            return

        # Default
        await update.message.reply_text(
            "Envíame un PDF de Trade Republic. Usa /help para más opciones."
        )

    # ── PDF handler ───────────────────────────────────────────────────────────

    async def handle_pdf(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        try:
            user_id = update.effective_user.id
            file     = await context.bot.get_file(update.message.document)
            short_id = str(uuid.uuid4())[:8]

            os.makedirs(PDF_UPLOAD_FOLDER, exist_ok=True)
            pdf_path = os.path.join(PDF_UPLOAD_FOLDER, f"{short_id}.pdf")
            await file.download_to_drive(pdf_path)
            self.file_paths[short_id] = pdf_path

            await update.message.reply_text(
                "¿Qué quieres hacer con este PDF?",
                reply_markup=self._make_keyboard(short_id, user_id),
            )
        except Exception as e:
            await update.message.reply_text(f"Error al procesar el PDF: {str(e)}")

    # ── Button handler ────────────────────────────────────────────────────────

    async def handle_button(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        query   = update.callback_query
        user_id = update.effective_user.id

        try:
            await query.answer()
        except Exception:
            pass

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

        if short_id not in self.file_paths:
            await query.edit_message_text("No se pudo encontrar el archivo. Envíalo de nuevo.")
            return

        pdf_path = self.file_paths[short_id]
        if not os.path.exists(pdf_path):
            await query.edit_message_text("El archivo ya no existe. Por favor, vuelve a enviar el PDF.")
            return

        await query.edit_message_text("Procesando el PDF, por favor espera...")

        if format_type == "md":
            try:
                loop   = asyncio.get_running_loop()
                result = await loop.run_in_executor(None, process_pdf_to_markdown, pdf_path)
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
                loop       = asyncio.get_running_loop()
                excel_path = await loop.run_in_executor(None, process_pdf_to_excel, pdf_path)
                if not os.path.exists(excel_path):
                    await query.edit_message_text("Error: No se pudo generar el archivo Excel.")
                    return
                await query.edit_message_text("Enviando archivo Excel...")
                await context.bot.send_document(
                    chat_id=query.message.chat_id,
                    document=open(excel_path, 'rb'),
                    filename="transacciones.xlsx",
                )
                try:
                    os.remove(excel_path)
                except Exception:
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
        pdf_path = self.file_paths.get(short_id)
        if not pdf_path or not os.path.exists(pdf_path):
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
                loop     = asyncio.get_running_loop()
                markdown = await loop.run_in_executor(None, process_pdf_to_markdown, pdf_path)
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
        except Exception as exc:
            await query.edit_message_text(
                f"❌ Error al importar: {exc}",
                reply_markup=self._make_keyboard(short_id, user_id),
            )
            return

        imported = result.get("imported", "?")
        skipped  = result.get("skipped_duplicates", 0)
        total    = result.get("total_rows", "?")

        await query.edit_message_text(
            f"✅ *¡Importación completada!*\n\n"
            f"• Filas procesadas: {total}\n"
            f"• Importadas: {imported}\n"
            f"• Omitidas (duplicados): {skipped}",
            parse_mode="Markdown",
            reply_markup=self._make_keyboard(short_id, user_id),
        )

    def run(self):
        self.application.run_polling()
