"""
SmartBudget Telegram bot.

Accepts Trade Republic (Spanish) PDF statements and offers three actions:
  [📥 Import to SmartBudget]  [📋 Markdown]  [📊 Excel]

On import, the bot first asks which account to import to (always), then
calls the SmartBudget /import/auto API running on the same container.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from functools import partial
from typing import Optional

import httpx
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
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
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
SB_BASE_URL = os.getenv("SMARTBUDGET_URL", "http://127.0.0.1:8000")
SB_EMAIL = os.getenv("SMARTBUDGET_EMAIL", "")
SB_PASSWORD = os.getenv("SMARTBUDGET_PASSWORD", "")

if not BOT_TOKEN:
    logger.warning("BOT_TOKEN not set — exiting.")
    raise SystemExit(0)

# ── In-memory session state ───────────────────────────────────────────────────
# Maps a short random ID to the path of the uploaded PDF.
_file_paths: dict[str, str] = {}

# Cached parse results so re-pressing a button doesn't re-run docling.
_parsed_cache: dict[str, list[dict]] = {}   # short_id → transactions
_md_cache: dict[str, str] = {}              # short_id → markdown string

# ── JWT token cache ───────────────────────────────────────────────────────────
_jwt_token: Optional[str] = None


async def _get_token(client: httpx.AsyncClient) -> str:
    """Return cached JWT or re-authenticate."""
    global _jwt_token
    if _jwt_token:
        return _jwt_token
    resp = await client.post(
        f"{SB_BASE_URL}/api/auth/login",
        data={"username": SB_EMAIL, "password": SB_PASSWORD},
    )
    resp.raise_for_status()
    _jwt_token = resp.json()["access_token"]
    return _jwt_token


async def _sb_get(path: str) -> dict | list:
    """GET from SmartBudget API, retrying once on 401."""
    global _jwt_token
    async with httpx.AsyncClient(timeout=30) as client:
        for attempt in range(2):
            token = await _get_token(client)
            resp = await client.get(
                f"{SB_BASE_URL}{path}",
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 401 and attempt == 0:
                _jwt_token = None
                continue
            resp.raise_for_status()
            return resp.json()
    raise RuntimeError("Auth failed after retry")


async def _sb_import(account_id: str, transactions: list[dict]) -> dict:
    """POST /accounts/{id}/import/auto, retrying once on 401."""
    global _jwt_token
    async with httpx.AsyncClient(timeout=60) as client:
        for attempt in range(2):
            token = await _get_token(client)
            resp = await client.post(
                f"{SB_BASE_URL}/api/accounts/{account_id}/import/auto",
                json={"transactions": transactions},
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 401 and attempt == 0:
                _jwt_token = None
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
    """Yield successive chunks of *text* no longer than *size* chars."""
    for i in range(0, len(text), size):
        yield text[i: i + size]


# ── Handlers ──────────────────────────────────────────────────────────────────

async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Receive a PDF file from the user and show the action keyboard."""
    doc = update.message.document
    if not doc.file_name.lower().endswith(".pdf"):
        await update.message.reply_text("Please send a PDF file.")
        return

    await update.message.reply_text("⏳ Downloading PDF…")

    tg_file = await doc.get_file()
    short_id = _short_id()
    pdf_path = f"/tmp/tr_{short_id}.pdf"
    await tg_file.download_to_drive(pdf_path)

    _file_paths[short_id] = pdf_path

    await update.message.reply_text(
        f"✅ PDF received: *{doc.file_name}*\n\nWhat would you like to do?",
        parse_mode="Markdown",
        reply_markup=_main_keyboard(short_id),
    )


async def handle_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Route inline-keyboard button presses."""
    query = update.callback_query
    await query.answer()
    data: str = query.data

    # ── import_to:{short_id}:{account_id} ────────────────────────────────────
    if data.startswith("import_to:"):
        parts = data.split(":", 2)          # maxsplit=2 — account_id may contain hyphens
        short_id = parts[1]
        account_id = parts[2]
        await _handle_import_to(query, short_id, account_id)
        return

    # ── import:{short_id} ─────────────────────────────────────────────────────
    if data.startswith("import:"):
        short_id = data.split(":", 1)[1]
        await _handle_import(query, short_id)
        return

    # ── md:{short_id} ─────────────────────────────────────────────────────────
    if data.startswith("md:"):
        short_id = data.split(":", 1)[1]
        await _handle_markdown(query, short_id)
        return

    # ── excel:{short_id} ──────────────────────────────────────────────────────
    if data.startswith("excel:"):
        short_id = data.split(":", 1)[1]
        await _handle_excel(query, short_id)
        return

    await query.edit_message_text("Unknown action.")


# ── Sub-handlers ──────────────────────────────────────────────────────────────

async def _handle_markdown(query, short_id: str) -> None:
    pdf_path = _file_paths.get(short_id)
    if not pdf_path:
        await query.edit_message_text("⚠️ Session expired — please re-send the PDF.")
        return

    await query.edit_message_text("⏳ Parsing PDF…", reply_markup=None)

    if short_id in _md_cache:
        md = _md_cache[short_id]
    else:
        loop = asyncio.get_event_loop()
        md = await loop.run_in_executor(None, parse_to_markdown, pdf_path)
        _md_cache[short_id] = md

    # Restore buttons after sending result
    chunks = list(_chunk(f"```\n{md}\n```"))
    for chunk in chunks:
        await query.message.reply_text(chunk, parse_mode="Markdown")

    await query.message.reply_text(
        "Choose another action:",
        reply_markup=_main_keyboard(short_id),
    )


async def _handle_excel(query, short_id: str) -> None:
    pdf_path = _file_paths.get(short_id)
    if not pdf_path:
        await query.edit_message_text("⚠️ Session expired — please re-send the PDF.")
        return

    await query.edit_message_text("⏳ Generating Excel file…", reply_markup=None)

    loop = asyncio.get_event_loop()
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

    await query.message.reply_text(
        "Choose another action:",
        reply_markup=_main_keyboard(short_id),
    )


async def _handle_import(query, short_id: str) -> None:
    """Fetch accounts from SmartBudget and show one button per account."""
    pdf_path = _file_paths.get(short_id)
    if not pdf_path:
        await query.edit_message_text("⚠️ Session expired — please re-send the PDF.")
        return

    if not SB_EMAIL or not SB_PASSWORD:
        await query.edit_message_text(
            "⚠️ SMARTBUDGET_EMAIL / SMARTBUDGET_PASSWORD not configured."
        )
        return

    await query.edit_message_text("⏳ Fetching accounts…", reply_markup=None)

    try:
        accounts = await _sb_get("/api/accounts")
    except Exception as exc:
        logger.exception("Failed to fetch accounts")
        await query.edit_message_text(f"❌ Could not reach SmartBudget:\n`{exc}`",
                                      parse_mode="Markdown")
        return

    if not accounts:
        await query.edit_message_text("⚠️ No accounts found in SmartBudget.")
        return

    buttons = [
        [InlineKeyboardButton(
            acc["name"],
            callback_data=f"import_to:{short_id}:{acc['id']}",
        )]
        for acc in accounts
    ]
    buttons.append([InlineKeyboardButton("❌ Cancel", callback_data=f"cancel:{short_id}")])

    await query.edit_message_text(
        "📂 Choose the account to import into:",
        reply_markup=InlineKeyboardMarkup(buttons),
    )


async def _handle_import_to(query, short_id: str, account_id: str) -> None:
    """Parse the PDF and push transactions to the chosen SmartBudget account."""
    pdf_path = _file_paths.get(short_id)
    if not pdf_path:
        await query.edit_message_text("⚠️ Session expired — please re-send the PDF.")
        return

    await query.edit_message_text("⏳ Parsing PDF and importing…", reply_markup=None)

    # Parse (use cache if already done)
    if short_id in _parsed_cache:
        transactions = _parsed_cache[short_id]
    else:
        loop = asyncio.get_event_loop()
        transactions = await loop.run_in_executor(
            None, parse_to_transactions, pdf_path
        )
        _parsed_cache[short_id] = transactions

    if not transactions:
        await query.edit_message_text(
            "⚠️ No transactions found in the PDF.",
            reply_markup=_main_keyboard(short_id),
        )
        return

    # Import
    try:
        result = await _sb_import(account_id, transactions)
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status == 404:
            await query.edit_message_text(
                f"❌ Account not found (404). It may have been deleted.",
                reply_markup=_main_keyboard(short_id),
            )
        else:
            await query.edit_message_text(
                f"❌ Import failed (HTTP {status}).",
                reply_markup=_main_keyboard(short_id),
            )
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
    skipped = result.get("skipped_duplicates", 0)
    total = result.get("total_rows", "?")

    summary = (
        f"✅ *Import complete!*\n\n"
        f"• Rows processed: {total}\n"
        f"• Imported: {imported}\n"
        f"• Skipped (duplicates): {skipped}"
    )
    await query.edit_message_text(
        summary,
        parse_mode="Markdown",
        reply_markup=_main_keyboard(short_id),
    )


# ── Cancel handler (account selection screen) ─────────────────────────────────

async def _handle_cancel(query, short_id: str) -> None:
    pdf_path = _file_paths.get(short_id)
    if not pdf_path:
        await query.edit_message_text("⚠️ Session expired — please re-send the PDF.")
        return
    await query.edit_message_text(
        "Cancelled. Choose another action:",
        reply_markup=_main_keyboard(short_id),
    )


# Patch handle_button to route cancel too
_orig_handle_button = handle_button


async def handle_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:  # type: ignore[no-redef]
    query = update.callback_query
    await query.answer()
    data: str = query.data

    if data.startswith("import_to:"):
        parts = data.split(":", 2)
        await _handle_import_to(query, parts[1], parts[2])
    elif data.startswith("import:"):
        await _handle_import(query, data.split(":", 1)[1])
    elif data.startswith("md:"):
        await _handle_markdown(query, data.split(":", 1)[1])
    elif data.startswith("excel:"):
        await _handle_excel(query, data.split(":", 1)[1])
    elif data.startswith("cancel:"):
        await _handle_cancel(query, data.split(":", 1)[1])
    else:
        await query.edit_message_text("Unknown action.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(MessageHandler(filters.Document.ALL, handle_document))
    app.add_handler(CallbackQueryHandler(handle_button))

    logger.info("SmartBudget Telegram bot starting…")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
