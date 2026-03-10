from docling.document_converter import DocumentConverter
import re

def process_pdf_to_markdown(pdf_path):
    try:
        converter = DocumentConverter()
        result = converter.convert(pdf_path)
        markdown_content = result.document.export_to_markdown()
        return clean_transactions_table(markdown_content)
    except Exception as e:
        return f"Error procesando el PDF: {str(e)}"

def clean_transactions_table(markdown_content):
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