from docling.document_converter import DocumentConverter
import re
import os
import pandas as pd

def process_pdf_to_excel(pdf_path):
    try:
        # Obtener texto del PDF
        converter = DocumentConverter()
        result = converter.convert(pdf_path)
        markdown_content = result.document.export_to_markdown()

        # Crear DataFrame con estructura fija
        df = pd.DataFrame(columns=[
            "FECHA",
            "TIPO",
            "DESCRIPCIÓN",
            "ENTRADA DE DINERO",
            "SALIDA DE DINERO",
            "BALANCE"
        ])

        # Extraer líneas que contienen transacciones
        pattern = r'\|\s*(\d{2}\s+\w{3}(?:\s+\d{4})?)\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|'
        matches = re.findall(pattern, markdown_content)

        for match in matches:
            if len(match) >= 6:
                fecha = match[0].strip()
                # Ignoramos el tipo (match[1])
                descripcion = match[2].strip()
                entrada = match[3].strip()
                salida = match[4].strip()
                # Ignoramos el balance (match[5])

                # Añadir año 2025 si falta
                if '2025' not in fecha and '2024' not in fecha:
                    fecha += ' 2025'

                # Limpiar descripción (quitar posibles tablas anidadas)
                descripcion = re.sub(r'\|.*\|', '', descripcion).strip()

                # Determinar valor monetario para SALIDA DE DINERO
                valor_monetario = ""
                es_salida = False

                # Primero verificar si hay valor en entrada
                if entrada and '€' in entrada:
                    valor_monetario = entrada
                    es_salida = False  # Es una entrada (mantener positivo)
                # Luego verificar si hay valor en salida
                elif salida and '€' in salida:
                    valor_monetario = salida
                    es_salida = True  # Es una salida (convertir a negativo)
                # Si no, buscar en la descripción
                elif '€' in descripcion:
                    valor_match = re.search(r'(\d+,\d{2}\s*€)', descripcion)
                    if valor_match:
                        valor_monetario = valor_match.group(1)
                        # Por defecto asumimos que es una entrada
                        es_salida = False

                # Convertir a negativo si es salida
                if es_salida and valor_monetario:
                    # Quitar el símbolo € para manipular el número
                    num_part = valor_monetario.replace('€', '').strip()
                    # Añadir signo negativo
                    valor_monetario = '-' + num_part + ' €'

                # Crear fila y añadirla al DataFrame
                row = {
                    "FECHA": fecha,
                    "TIPO": "",  # Vacío como solicitaste
                    "DESCRIPCIÓN": descripcion,
                    "ENTRADA DE DINERO": "",  # Siempre vacío
                    "SALIDA DE DINERO": valor_monetario,  # Todos los valores aquí (positivos o negativos)
                    "BALANCE": ""  # Vacío como solicitaste
                }

                df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)

        # Guardar como Excel
        excel_path = pdf_path.replace('.pdf', '.xlsx')

        with pd.ExcelWriter(excel_path, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Transacciones')

            # Formatear
            workbook = writer.book
            worksheet = writer.sheets['Transacciones']

            # Ajustar anchos
            widths = {
                "FECHA": 15,
                "TIPO": 10,
                "DESCRIPCIÓN": 40,
                "ENTRADA DE DINERO": 20,
                "SALIDA DE DINERO": 20,
                "BALANCE": 15
            }

            for i, col in enumerate(df.columns):
                worksheet.column_dimensions[chr(65 + i)].width = widths.get(col, 15)

        return excel_path

    except Exception as e:
        raise Exception(f"Error procesando el PDF: {str(e)}")