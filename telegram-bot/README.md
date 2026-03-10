# Finance Bot para Telegram

![Finance Bot Logo](image.jpg)

## Descripción

Finance Bot es un bot de Telegram que procesa extractos bancarios en PDF de trade republic y los convierte a diferentes formatos (Markdown o Excel) para facilitar su análisis y gestión.

## Características

- Procesa PDFs de extractos bancarios
- Ofrece tres formatos de salida:
  - Markdown (visualización directa en Telegram)
  - Excel (con formato mejorado)
- Interfaz sencilla con botones
- Procesamiento automático de transacciones

## Instalación en Unraid

1. Accede a la interfaz web de Unraid (http://IP_DE_UNRAID)
2. Ve a la pestaña "Docker"
3. Haz clic en "Add Container" y completa los siguientes campos:

   - **Name**: finance-bot
   - **Repository**: victorpiella/finance-bot:latest
   - **Network Type**: Bridge

4. Añade la variable de entorno para el token de Telegram:

   - Haz clic en "Add another Variable"
   - **Name**: BOT_TOKEN
   - **Value**: Tu token de Telegram bot (obtenido de BotFather)

5. Configura el volumen para los archivos PDF:

   - Haz clic en "Add another Path, Port, Variable, Label or Device"
   - **Config Type**: Path
   - **Name**: Uploads
   - **Container Path**: /app/uploads
   - **Host Path**: /mnt/user/appdata/finance-bot/uploads

6. Finaliza la configuración haciendo clic en "Apply"

## Uso del bot

1. Inicia una conversación con tu bot en Telegram
2. Envía un comando `/start` para verificar que el bot está funcionando
3. Envía un PDF de extracto bancario
4. Selecciona el formato deseado (Markdown, CSV o Excel)
5. El bot procesará el PDF y te enviará el resultado en el formato elegido

## Solución de problemas

- **El bot no responde**: Verifica que el token sea correcto
- **Error al procesar PDFs**: Asegúrate de que el PDF tenga el formato esperado
- **Problemas con los archivos**: Verifica los permisos del directorio de uploads

## Notas importantes

- El token del bot debe mantenerse en secreto
- Los PDFs se procesan y luego se eliminan automáticamente
- El bot está diseñado para procesar extractos bancarios con un formato específico

---

Desarrollado por Victor Piella © 2025
