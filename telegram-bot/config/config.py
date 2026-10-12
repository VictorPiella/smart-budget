import os

BOT_TOKEN         = os.environ.get('BOT_TOKEN', '')
PDF_UPLOAD_FOLDER = os.environ.get('PDF_UPLOAD_FOLDER', '/uploads')
SB_BASE_URL       = os.environ.get('SMARTBUDGET_URL', 'http://127.0.0.1:8000')

# Comma-separated Telegram user IDs allowed to use the bot (ask @userinfobot for yours).
# Empty = anyone may /login, but only logged-in users can upload PDFs.
ALLOWED_TELEGRAM_USERS = {
    int(uid) for uid in os.environ.get('ALLOWED_TELEGRAM_USERS', '').replace(' ', '').split(',') if uid
}
