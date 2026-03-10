FROM python:3.10-slim

WORKDIR /app

# Instalar dependencias
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar archivos del proyecto
COPY . .

# Crear directorio para PDFs
RUN mkdir -p /app/uploads

# Variables de entorno (valores por defecto que se pueden sobrescribir)
ENV PDF_UPLOAD_FOLDER=/app/uploads

# Ejecutar el bot
CMD ["python", "main.py"]