from docling.document_converter import DocumentConverter
import re
import os
import csv

def process_pdf_to_csv(pdf_path):
    try:
        converter = DocumentConverter()
        result = converter.convert(pdf_path)
        markdown_content = result.document.export_to_markdown()

        # Obtener el contenido como texto Markdown
        markdown_table = clean_transactions_table(markdown_content)

        # Crear archivo CSV a partir del contenido Markdown
        csv_path = pdf_path.replace('.pdf', '.csv')
        markdown_to_csv(markdown_table, csv_path)

        # Devolver la ruta del archivo CSV
        return csv_path
    except Exception as e:
        raise Exception(f"Error procesando el PDF: {str(e)}")

def markdown_to_csv(markdown_table, csv_path):
    # Dividir la tabla por líneas
    rows = markdown_table.strip().split('\n')

    # Crear el archivo CSV
    with open(csv_path, 'w', newline='', encoding='utf-8') as csvfile:
        csv_writer = csv.writer(csvfile)

        # Procesar cada fila de la tabla Markdown
        for i, row in enumerate(rows):
            # Saltar la línea de separación (segunda línea)
            if i == 1 and '---' in row:
                continue

            # Extraer celdas de la fila
            cells = [cell.strip() for cell in row.split('|')]
            # Eliminar elementos vacíos que aparecen al principio y final
            cells = [cell for cell in cells if cell]

            # Escribir la fila en el CSV
            if cells:
                csv_writer.writerow(cells)

def clean_transactions_table(markdown_content):
    # El código de clean_transactions_table permanece igual
    # Encontrar todas las tablas que empiezan con el encabezado de fecha, tipo, etc.
    table_pattern = r'\| FECHA\s+\| TIPO\s+\| DESCRIPCIÓN.*?\n((?:\|.*?\n)+)'
    tables = re.finditer(table_pattern, markdown_content, re.MULTILINE)

    # Combinar todas las filas de las tablas encontradas
    clean_rows = []
    header = "| FECHA | TIPO | DESCRIPCIÓN | ENTRADA DE DINERO | SALIDA DE DINERO | BALANCE |\n|--------|------|-------------|------------------|-----------------|----------|"

    for table_match in tables:
        rows = table_match.group(1).split('\n')
        for row in rows:
            if row.strip() and '|' in row:
                # Ignorar líneas que son solo separadores
                if not re.match(r'\|[\s\-|]+\|', row):
                    # Limpiar y normalizar la fila
                    row = re.sub(r'\n+', ' ', row)
                    # Asegurarse de que la fila tiene el formato correcto
                    cells = [cell.strip() for cell in row.split('|')]
                    if len(cells) >= 7:  # Asegurarse de que tiene todas las columnas
                        clean_row = f"| {' | '.join(cells[1:7])} |"
                        if not any(x in clean_row.lower() for x in ['trade republic', 'creado en', 'directores']):
                            # Corregir fechas incompletas
                            if '2025' not in clean_row:
                                clean_row = clean_row.replace('mar |', 'mar 2025 |')
                            clean_rows.append(clean_row)

    # Combinar todo en una única tabla
    return header + '\n' + '\n'.join(clean_rows)