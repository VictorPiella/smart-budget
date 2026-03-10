import os

BOT_TOKEN         = os.environ.get('BOT_TOKEN', '')
PDF_UPLOAD_FOLDER = os.environ.get('PDF_UPLOAD_FOLDER', '/uploads')
SB_BASE_URL       = os.environ.get('SMARTBUDGET_URL', 'http://127.0.0.1:8000')
