from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, CallbackQueryHandler
import os
import sys
import uuid
from pathlib import Path

# Añadir el directorio raíz al path
sys.path.append(str(Path(__file__).parent.parent))

from config.config import BOT_TOKEN, PDF_UPLOAD_FOLDER
from src.pdf_processor_to_markdown import process_pdf_to_markdown
from src.pdf_processor_to_excel import process_pdf_to_excel


class FinanceBot:
    def __init__(self):
        self.application = Application.builder().token(BOT_TOKEN).build()
        self.file_paths = {}
        self._setup_handlers()

    def _setup_handlers(self):
        self.application.add_handler(CommandHandler("start", self.start))
        self.application.add_handler(CommandHandler("help", self.help))
        self.application.add_handler(MessageHandler(filters.Document.PDF, self.handle_pdf))
        self.application.add_handler(CallbackQueryHandler(self.handle_button))

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(
            "¡Hola! Envíame un PDF de transacciones y te ayudaré a procesarlo."
        )

    async def help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text(
            "Simplemente envíame un PDF de transacciones y te devolveré una tabla formateada.\n\n"
            "Puedes elegir entre estos formatos:\n"
            "- Markdown: Para ver directamente en Telegram\n"
            "- Excel: Archivo .xlsx con formato mejorado"
        )

    async def handle_pdf(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        try:
            # Descargar el PDF
            file = await context.bot.get_file(update.message.document)
            short_id = str(uuid.uuid4())[:8]

            os.makedirs(PDF_UPLOAD_FOLDER, exist_ok=True)
            pdf_path = os.path.join(PDF_UPLOAD_FOLDER, f"{short_id}.pdf")
            await file.download_to_drive(pdf_path)

            # Guardar la ruta del archivo en el diccionario
            self.file_paths[short_id] = pdf_path

            # Crear botones - ahora con Excel
            keyboard = [
                [InlineKeyboardButton("Markdown", callback_data=f"md:{short_id}")],
                [InlineKeyboardButton("Excel", callback_data=f"excel:{short_id}")]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)

            # Enviar mensaje con botones
            await update.message.reply_text(
                "¿En qué formato quieres la respuesta?",
                reply_markup=reply_markup
            )

        except Exception as e:
            await update.message.reply_text(f"Error al procesar el PDF: {str(e)}")

    async def handle_button(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query

        try:
            # Intentar responder al callback
            try:
                await query.answer()
            except Exception:
                pass  # Ignoramos errores de callback expirado

            # Obtener el tipo de formato y el ID
            format_type, short_id = query.data.split(":")

            # Mostrar mensaje de procesamiento
            await query.edit_message_text(f"Procesando el PDF, por favor espera...")

            # Verificar que el archivo existe
            if short_id not in self.file_paths:
                await query.edit_message_text("No se pudo encontrar el archivo. Inténtalo de nuevo.")
                return

            pdf_path = self.file_paths[short_id]
            if not os.path.exists(pdf_path):
                await query.edit_message_text("El archivo ya no existe. Por favor, vuelve a enviar el PDF.")
                return

            # Procesar según el formato seleccionado
            if format_type == "md":
                # Código para Markdown
                try:
                    result = process_pdf_to_markdown(pdf_path)
                    await query.edit_message_text(f"Aquí está tu resultado en Markdown:\n\n{result}")
                except Exception as e:
                    await query.edit_message_text(f"Error al procesar a Markdown: {str(e)}")

            elif format_type == "excel":
                # Código para Excel
                try:
                    excel_path = process_pdf_to_excel(pdf_path)
                    if not os.path.exists(excel_path):
                        await query.edit_message_text("Error: No se pudo generar el archivo Excel.")
                        return

                    await query.edit_message_text("Enviando archivo Excel...")
                    await context.bot.send_document(
                        chat_id=query.message.chat_id,
                        document=open(excel_path, 'rb'),
                        filename="resultados.xlsx"
                    )
                    await query.edit_message_text("¡Excel enviado correctamente!")
                    try:
                        os.remove(excel_path)
                    except Exception:
                        pass
                except Exception as e:
                    await query.edit_message_text(f"Error al procesar a Excel: {str(e)}")

            # Limpiar el archivo PDF y eliminarlo del diccionario
            try:
                os.remove(pdf_path)
                del self.file_paths[short_id]
            except Exception:
                pass

        except Exception as e:
            try:
                await query.edit_message_text(f"Error al procesar la solicitud: {str(e)}")
            except Exception:
                pass

    def run(self):
        self.application.run_polling()