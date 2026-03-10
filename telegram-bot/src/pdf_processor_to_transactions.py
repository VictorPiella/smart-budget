"""
Extracts structured transactions from a Trade Republic (Spanish) PDF.

Uses the exact same docling + regex logic as pdf_processor_to_markdown.py
so the row detection is identical to the working markdown output.

Returns a list of dicts compatible with SmartBudget /import/auto:
  [{"date": "YYYY-MM-DD", "description": str, "amount": float}, ...]
"""
from docling.document_converter import DocumentConverter
from datetime import datetime
import re

_MONTH_ES = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4,
    "may": 5, "jun": 6, "jul": 7, "ago": 8,
    "sep": 9, "oct": 10, "nov": 11, "dic": 12,
}


def process_pdf_to_transactions(pdf_path: str) -> list:
    converter = DocumentConverter()
    result    = converter.convert(pdf_path)
    markdown  = result.document.export_to_markdown()
    return _extract_transactions(markdown)


def _extract_transactions(markdown_content: str) -> list:
    # Same pattern as pdf_processor_to_markdown.py
    table_pattern = r'\| FECHA\s+\| TIPO\s+\| DESCRIPCIÓN.*?\n((?:\|.*?\n)+)'
    tables = re.finditer(table_pattern, markdown_content, re.MULTILINE)

    current_year = datetime.now().year
    transactions = []

    for table_match in tables:
        rows = table_match.group(1).split('\n')
        for row in rows:
            if not row.strip() or '|' not in row:
                continue
            if re.match(r'\|[\s\-|]+\|', row):
                continue

            row   = re.sub(r'\n+', ' ', row)
            cells = [c.strip() for c in row.split('|')]
            if len(cells) < 7:
                continue

            fecha_str   = cells[1]
            descripcion = cells[3]
            entrada_str = cells[4]
            salida_str  = cells[5]

            # Skip metadata / header rows
            combined = (fecha_str + descripcion).lower()
            if any(x in combined for x in ['trade republic', 'creado en', 'directores', 'fecha']):
                continue

            if not descripcion or not fecha_str:
                continue

            date_iso = _parse_date(fecha_str, current_year)
            if not date_iso:
                continue

            amount = _parse_amount(entrada_str, salida_str)
            if amount is None:
                continue

            transactions.append({
                "date":        date_iso,
                "description": descripcion,
                "amount":      amount,
            })

    return transactions


def _parse_date(date_str: str, current_year: int):
    parts = date_str.lower().split()
    if len(parts) < 2:
        return None
    try:
        day   = int(parts[0])
        month = _MONTH_ES.get(parts[1][:3])
        if not month:
            return None
        year = int(parts[2]) if len(parts) >= 3 else current_year
        return f"{year:04d}-{month:02d}-{day:02d}"
    except (ValueError, IndexError):
        return None


def _parse_amount(entrada: str, salida: str):
    def to_float(s: str):
        s = s.replace('€', '').replace('.', '').replace(',', '.').strip()
        if not s or s == '-':
            return None
        try:
            return float(s)
        except ValueError:
            return None

    v_in  = to_float(entrada)
    v_out = to_float(salida)

    if v_in is not None:
        return v_in    # income  → positive
    if v_out is not None:
        return -v_out  # expense → negative
    return None
