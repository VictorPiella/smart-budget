"""
SmartBudget Telegram bot — per-user authentication with JSON session persistence.

Each Telegram user authenticates once via /login with their own SmartBudget
credentials.  Sessions (email + password) are persisted to SESSIONS_FILE so
they survive container restarts.  The JWT is kept only in memory and
re-acquired transparently when the container restarts or the token expires.

Commands:
  /login  — start authentication flow
  /logout — clear session
  /status — show current login state

PDF actions (after login):
  [📥 Import to SmartBudget]  [📋 Markdown]  [📊 Excel]
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from pathlib import Path

import httpx
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from pdf_processor import parse_to_excel, parse_to_markdown, parse_to_transactions

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
BOT_TOKEN    = os.getenv("BOT_TOKEN", "")
SB_BASE_URL  = os.getenv("SMARTBUDGET_URL", "http://127.0.0.1:8000")
SESSIONS_FILE = Path(os.getenv("SESSIONS_FILE", "/data/sessions.json"))

if not BOT_TOKEN:
    logger.warning("BOT_TOKEN not set — exiting.")
    raise SystemExit(0)


# ── Session persistence ───────────────────────────────────────────────────────
# On-disk format: { "<user_id>": {"email": "...", "password": "..."} }
# JWT is never written to disk — re-acquired on first use after a restart.

def _load_sessions() -> dict[int, dict]:
    if SESSIONS_FILE.exists():
        try:
            raw = json.loads(SESSIONS_FILE.read_text())
            sessions = {int(k): v for k, v in raw.items()}
            # Ensure jwt key is present (in-memory only)
            for s in sessions.values():
                s.setdefault("jwt", None)
            logger.info("Loaded %d session(s) from %s", len(sessions), SESSIONS_FILE)
            return sessions
        except Exception:
            logger.exception("Failed to load sessions — starting fresh")
    return {}


def _save_sessions() -> None:
    """Atomically write sessions to disk (email + password only, no JWT)."""
    SESSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = SESSIONS_FILE.with_suffix(".tmp")
    payload = {
        str(uid): {"email": s["email"], "password": s["password"]}
        for uid, s in _user_sessions.items()
    }
    tmp.write_text(json.dumps(payload, indent=2))
    tmp.replace(SESSIONS_FILE)


# user_id → {"email": str, "password": str, "jwt": str | None}
_user_sessions: dict[int, dict] = _load_sessions()

# Login conversation state: user_id → "awaiting_email" | "awaiting_password:<email>"
_login_step: dict[int, str] = {}

# ── In-memory PDF session state ───────────────────────────────────────────────
_file_paths:    dict[str, str]        = {}  # short_id → pdf path
_parsed_cache:  dict[str, list[dict]] = {}  # short_id → parsed transactions
_md_cache:      dict[str, str]        = {}  # short_id → markdown string


# ── Custom exception ──────────────────────────────────────────────────────────
class NotLoggedInError(Exception):
    pass


# ── SmartBudget API helpers ───────────────────────────────────────────────────

async def _get_token_for(user_id: int, client: httpx.AsyncClient) -> str:
    """Return a valid JWT for *user_id*, re-authenticating if needed."""
    session = _user_sessions.get(user_id)
    if not session:
        raise NotLoggedInError("Not logged in")
    if session.get("jwt"):
        return session["jwt"]
    resp = await client.post(
        f"{SB_BASE_URL}/auth/login",
        data={"username": session["email"], "password": session["password"]},
    )
    if resp.status_code == 401:
        raise NotLoggedInError("Bad credentials — please /login again")
    resp.raise_for_status()
    session["jwt"] = resp.json()["access_token"]
    return session["jwt"]


async def _sb_get(user_id: int, path: str) -> dict | list:
    """GET from SmartBudget API, retrying once on 401."""
    async with httpx.AsyncClient(timeout=30) as client:
        for attempt in range(2):
            token = await _get_token_for(user_id, client)
            resp = await client.get(
                f"{SB_BASE_URL}{path}",
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 401 and attempt == 0:
                _user_sessions[user_id]["jwt"] = None
                continue
            resp.raise_for_status()
            return resp.json()
    raise RuntimeError("Auth failed after retry")


async def _sb_import(user_id: int, account_id: str, transactions: list[dict]) -> dict:
    """POST /accounts/{id}/import/auto, retrying once on 401."""
    async with httpx.AsyncClient(timeout=60) as client:
        for attempt in range(2):
            token = await _get_token_for(user_id, client)
            resp = await client.post(
                f"{SB_BASE_URL}/accounts/{account_id}/import/auto",
                json={"transactions": transactions},
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 401 and attempt == 0:
                _user_sessions[user_id]["jwt"] = None
                continue
            resp.raise_for_status()
            return resp.json()
    raise RuntimeError("Auth failed after retry")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _short_id() -> str:
    return uuid.uuid4().hex[:12]


def _main_keyboard(short_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("📥 Import to SmartBudget", callback_data=f"import:{short_id}"),
        InlineKeyboardButton("📋 Markdown",              callback_data=f"md:{short_id}"),
        InlineKeyboardButton("📊 Excel",                 callback_data=f"excel:{short_id}"),
    ]])


def _chunk(text: str, size: int = 4000):
    for i in range(0, len(text), size):
        yield text[i: i + size]


def _is_logged_in(user_id: int) -> bool:
    return user_id in _user_sessions


# ── Commands ──────────────────────────────────────────────────────────────────

async def cmd_login(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    _login_step[user_id] = "awaiting_email"
    await update.message.reply_text(
        "🔐 Let's connect your SmartBudget account.\n\nWhat's your email address?"
    )


async def cmd_logout(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    if user_id in _user_sessions:
        del _user_sessions[user_id]
        _save_sessions()
    _login_step.pop(user_id, None)
    await update.message.reply_text("✅ Logged out successfully.")


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.effective_user.id
    session = _user_sessions.get(user_id)
    if session:
        await update.message.reply_text(
            f"✅ Logged in as *{session['email']}*\n\nSend a Trade Republic PDF to get started.",
            parse_mode="Markdown",
        )
    else:
        await update.message.reply_text(
            "❌ Not logged in. Use /login to connect your SmartBudget account."
        )


# ── Message handler (login flow + PDF) ───────────────────────────────────────

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Routes text messages through the login state machine, or handles PDFs."""
    user_id = update.effective_user.id
    step = _login_step.get(user_id)

    # ── Login flow: waiting for email ─────────────────────────────────────────
    if step == "awaiting_email":
        email = (update.message.text or "").strip()
        if not email or "@" not in email:
            await update.message.reply_text("That doesn't look like a valid email. Try again:")
            return
        _login_step[user_id] = f"awaiting_password:{email}"
        await update.message.reply_text(
            "Got it! Now send your password.\n"
            "_I'll delete your message immediately after reading it._",
            parse_mode="Markdown",
        )
        return

    # ── Login flow: waiting for password ──────────────────────────────────────
    if step and step.startswith("awaiting_password:"):
        email    = step.split(":", 1)[1]
        password = (update.message.text or "").strip()

        # Delete the password message immediately to keep the chat clean
        try:
            await update.message.delete()
        except Exception:
            pass  # May lack delete permission (e.g. in group chats)

        if not password:
            await update.effective_chat.send_message("Password can't be empty. Try again:")
            return

        status_msg = await update.effective_chat.send_message("⏳ Verifying credentials…")
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{SB_BASE_URL}/auth/login",
                    data={"username": email, "password": password},
                )
            if resp.status_code == 401:
                await status_msg.edit_text("❌ Invalid credentials. Send your password again:")
                # Keep step so the next message is treated as another password attempt
                _login_step[user_id] = f"awaiting_password:{email}"
                return
            resp.raise_for_status()
            jwt = resp.json()["access_token"]
        except NotLoggedInError:
            await status_msg.edit_text("❌ Invalid credentials. Send your password again:")
            _login_step[user_id] = f"awaiting_password:{email}"
            return
        except Exception as exc:
            logger.exception("Login request failed")
            await status_msg.edit_text(
                f"❌ Could not reach SmartBudget: `{exc}`\nTry again later.",
                parse_mode="Markdown",
            )
            return

        _user_sessions[user_id] = {"email": email, "password": password, "jwt": jwt}
        _save_sessions()
        del _login_step[user_id]
        await status_msg.edit_text(
            f"✅ *Logged in as {email}*\n\nSend a Trade Republic PDF to import transactions.",
            parse_mode="Markdown",
        )
        return

    # ── PDF document ──────────────────────────────────────────────────────────
    if update.message.document:
        await _handle_document(update, user_id)
        return

    # ── Anything else ─────────────────────────────────────────────────────────
    if not _is_logged_in(user_id):
        await update.message.reply_text(
            "👋 Welcome! Use /login to connect your SmartBudget account."
        )
    else:
        await update.message.reply_text(
            "Send a Trade Republic PDF to get started, or /status to check your account."
        )


async def _handle_document(update: Update, user_id: int) -> None:
    if not _is_logged_in(user_id):
        await update.message.reply_text("❌ Not logged in. Use /login first.")
        return

    doc = update.message.document
    if not doc.file_name.lower().endswith(".pdf"):
        await update.message.reply_text("Please send a PDF file.")
        return

    await update.message.reply_text("⏳ Downloading PDF…")
    tg_file  = await doc.get_file()
    short_id = _short_id()
    pdf_path = f"/tmp/tr_{short_id}.pdf"
    await tg_file.download_to_drive(pdf_path)
    _file_paths[short_id] = pdf_path

    await update.message.reply_text(
        f"✅ PDF received: *{doc.file_name}*\n\nWhat would you like to do?",
        parse_mode="Markdown",
        reply_markup=_main_keyboard(short_id),
    )


# ── Button router ─────────────────────────────────────────────────────────────

async def handle_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query   = update.callback_query
    await query.answer()
    data    = query.data
    user_id = update.effective_user.id

    if data.startswith("import_to:"):
        parts = data.split(":", 2)           # maxsplit=2 — account_id contains hyphens
        await _handle_import_to(query, user_id, parts[1], parts[2])
    elif data.startswith("import:"):
        await _handle_import(query, user_id, data.split(":", 1)[1])
    elif data.startswith("md:"):
        await _handle_markdown(query, data.split(":", 1)[1])
    elif data.startswith("excel:"):
        await _handle_excel(query, data.split(":", 1)[1])
    elif data.startswith("cancel:"):
        await _handle_cancel(query, data.split(":", 1)[1])
    else:
        await query.edit_message_text("Unknown action.")


# ── Sub-handlers ──────────────────────────────────────────────────────────────

async def _handle_markdown(query, short_id: str) -> None:
    pdf_path = _file_paths.get(short_id)
    if not pdf_path:
        await query.edit_message_text("⚠️ Session expired — please re-send the PDF.")
        return

    await query.edit_message_text("⏳ Parsing PDF…", reply_markup=None)

    if short_id not in _md_cache:
        loop = asyncio.get_running_loop()
        _md_cache[short_id] = await loop.run_in_executor(None, parse_to_markdown, pdf_path)

    for chunk in _chunk(f"```\n{_md_cache[short_id]}\n```"):
        await query.message.reply_text(chunk, parse_mode="Markdown")

    await query.message.reply_text("Choose another action:", reply_markup=_main_keyboard(short_id))


async def _handle_excel(query, short_id: str) -> None:
    pdf_path = _file_paths.get(short_id)
    if not pdf_path:
        await query.edit_message_text("⚠️ Session expired — please re-send the PDF.")
        return

    await query.edit_message_text("⏳ Generating Excel file…", reply_markup=None)

    loop      = asyncio.get_running_loop()
    xlsx_path = await loop.run_in_executor(None, parse_to_excel, pdf_path)
    try:
        with open(xlsx_path, "rb") as f:
            await query.message.reply_document(
                document=f,
                filename="trade_republic_statement.xlsx",
                caption="📊 Here is your Excel export.",
            )
    finally:
        try:
            os.remove(xlsx_path)
        except OSError:
            pass

    await query.message.reply_text("Choose another action:", reply_markup=_main_keyboard(short_id))


async def _handle_import(query, user_id: int, short_id: str) -> None:
    if not _file_paths.get(short_id):
        await query.edit_message_text("⚠️ Session expired — please re-send the PDF.")
        return
    if not _is_logged_in(user_id):
        await query.edit_message_text("❌ Not logged in. Use /login first.")
        return

    await query.edit_message_text("⏳ Fetching accounts…", reply_markup=None)
    try:
        accounts = await _sb_get(user_id, "/accounts")
    except NotLoggedInError:
        await query.edit_message_text("❌ Session expired. Use /login to reconnect.")
        return
    except Exception as exc:
        logger.exception("Failed to fetch accounts")
        await query.edit_message_text(
            f"❌ Could not reach SmartBudget:\n`{exc}`", parse_mode="Markdown"
        )
        return

    if not accounts:
        await query.edit_message_text("⚠️ No accounts found in SmartBudget.")
        return

    buttons = [
        [InlineKeyboardButton(acc["name"], callback_data=f"import_to:{short_id}:{acc['id']}")]
        for acc in accounts
    ]
    buttons.append([InlineKeyboardButton("❌ Cancel", callback_data=f"cancel:{short_id}")])
    await query.edit_message_text(
        "📂 Choose the account to import into:",
        reply_markup=InlineKeyboardMarkup(buttons),
    )


async def _handle_import_to(query, user_id: int, short_id: str, account_id: str) -> None:
    if not _file_paths.get(short_id):
        await query.edit_message_text("⚠️ Session expired — please re-send the PDF.")
        return

    await query.edit_message_text("⏳ Parsing PDF and importing…", reply_markup=None)

    if short_id not in _parsed_cache:
        loop = asyncio.get_running_loop()
        _parsed_cache[short_id] = await loop.run_in_executor(
            None, parse_to_transactions, _file_paths[short_id]
        )

    transactions = _parsed_cache[short_id]
    if not transactions:
        await query.edit_message_text(
            "⚠️ No transactions found in the PDF.",
            reply_markup=_main_keyboard(short_id),
        )
        return

    try:
        result = await _sb_import(user_id, account_id, transactions)
    except NotLoggedInError:
        await query.edit_message_text("❌ Session expired. Use /login to reconnect.")
        return
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        msg = "❌ Account not found (deleted?)." if status == 404 else f"❌ Import failed (HTTP {status})."
        await query.edit_message_text(msg, reply_markup=_main_keyboard(short_id))
        return
    except Exception as exc:
        logger.exception("Import failed")
        await query.edit_message_text(
            f"❌ Import error:\n`{exc}`",
            parse_mode="Markdown",
            reply_markup=_main_keyboard(short_id),
        )
        return

    imported = result.get("imported", "?")
    skipped  = result.get("skipped_duplicates", 0)
    total    = result.get("total_rows", "?")
    await query.edit_message_text(
        f"✅ *Import complete!*\n\n"
        f"• Rows processed: {total}\n"
        f"• Imported: {imported}\n"
        f"• Skipped (duplicates): {skipped}",
        parse_mode="Markdown",
        reply_markup=_main_keyboard(short_id),
    )


async def _handle_cancel(query, short_id: str) -> None:
    if not _file_paths.get(short_id):
        await query.edit_message_text("⚠️ Session expired — please re-send the PDF.")
        return
    await query.edit_message_text(
        "Cancelled. Choose another action:",
        reply_markup=_main_keyboard(short_id),
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("login",  cmd_login))
    app.add_handler(CommandHandler("logout", cmd_logout))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CallbackQueryHandler(handle_button))
    # Catches text + documents — everything except slash commands
    app.add_handler(MessageHandler(filters.ALL & ~filters.COMMAND, handle_message))

    logger.info("SmartBudget Telegram bot starting…")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
