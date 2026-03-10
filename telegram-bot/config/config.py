import os

# Obtener token desde variable de entorno
BOT_TOKEN = os.environ.get('BOT_TOKEN', '')

# Obtener ruta de uploads desde variable de entorno o usar valor predeterminado
PDF_UPLOAD_FOLDER = os.environ.get('PDF_UPLOAD_FOLDER', '/app/uploads')