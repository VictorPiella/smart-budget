"""
Unified Trade Republic (Spanish) PDF processor.

Ported directly from the working original financeBotTelegram implementation.
Only changes vs original:
  - Excel uses tempfile instead of pdf_path.replace('.pdf', '.xlsx')
  - Added parse_to_transactions() built on top of the working markdown output
  - Dynamic year (datetime.now().year) instead of hardcoded 2025

Three public functions:
  parse_to_markdown(pdf_path)      -> str
  parse_to_excel(pdf_path)         -> str  (path to temp .xlsx — caller must delete)
  parse_to_transactions(pdf_path)  -> list[dict]  (SmartBudget /import/auto format)
"""
from __future__ import annotations

import logging
import re
import tempfile
from datetime import datetime

import pandas as pd
from docling.document_converter import DocumentConverter

logger = logging.getLogger(__name__)

_CURRENT_YEAR = datetime.now().year

# ── Spanish month abbreviation → number ───────────────────────────────────────
_MONTH_ES: dict[str, int] = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4,
    "may": 5, "jun": 6, "jul": 7, "ago": 8,
    "sep": 9, "oct": 10, "nov": 11, "dic": 12,
}


# ── Core: convert PDF → raw markdown (shared by all three functions) ──────────

def _to_markdown_raw(pdf_path: str) -> str:
    converter = DocumentConverter()
    result = converter.convert(pdf_path)
    return result.document.export_to_markdown()


# ── Core: clean raw markdown → single tidy table (ported from original) ──────

def _clean_transactions_table(markdown_content: str) -> str:
    """
    Ported verbatim from original pdf_processor_to_markdown.py / pdf_processor_to_csv.py.
    Finds all table blocks starting with FECHA | TIPO | DESCRIPCIÓN header and
    combines their rows into one clean table, skipping separators and metadata.
    Year is added dynamically when missing (was hardcoded to 2025 in original).
    """
    table_pattern = r'\| FECHA\s+\| TIPO\s+\| DESCRIPCIÓN.*?\n((?:\|.*?\n)+)'
    tables = re.finditer(table_pattern, markdown_content, re.MULTILINE)

    clean_rows: list[str] = []
    header = (
        "| FECHA | TIPO | DESCRIPCIÓN | ENTRADA DE DINERO | SALIDA DE DINERO | BALANCE |\n"
        "|--------|------|-------------|------------------|-----------------|----------|"
    )

    for table_match in tables:
        rows = table_match.group(1).split('\n')
        for row in rows:
            if not row.strip() or '|' not in row:
                continue
            # Skip separator rows
            if re.match(r'\|[\s\-|]+\|', row):
                continue
            # Normalise internal newlines
            row = re.sub(r'\n+', ' ', row)
            cells = [cell.strip() for cell in row.split('|')]
            if len(cells) < 7:
                continue
            clean_row = f"| {' | '.join(cells[1:7])} |"
            # Skip metadata rows
            if any(x in clean_row.lower() for x in ['trade republic', 'creado en', 'directores']):
                continue
            # Add year when missing (was hardcoded 'mar 2025' in original)
            date_cell = cells[1].strip() if len(cells) > 1 else ""
            if date_cell and len(date_cell.split()) == 2:
                clean_row = clean_row.replace(
                    f'| {date_cell} |',
                    f'| {date_cell} {_CURRENT_YEAR} |',
                    1,
                )
            clean_rows.append(clean_row)

    return header + '\n' + '\n'.join(clean_rows)


# ── Public API ────────────────────────────────────────────────────────────────

def parse_to_markdown(pdf_path: str) -> str:
    """Return a cleaned markdown table from a Trade Republic PDF."""
    raw_md = _to_markdown_raw(pdf_path)
    return _clean_transactions_table(raw_md)


def parse_to_excel(pdf_path: str) -> str:
    """
    Parse PDF and write an .xlsx file.
    Returns the temp file path — caller must delete it.
    Logic ported from original pdf_processor_to_excel.py.
    """
    converter = DocumentConverter()
    result = converter.convert(pdf_path)
    markdown_content = result.document.export_to_markdown()

    df = pd.DataFrame(columns=[
        "FECHA", "TIPO", "DESCRIPCIÓN",
        "ENTRADA DE DINERO", "SALIDA DE DINERO", "BALANCE",
    ])

    pattern = r'\|\s*(\d{2}\s+\w{3}(?:\s+\d{4})?)\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|'
    matches = re.findall(pattern, markdown_content)

    for match in matches:
        if len(match) < 6:
            continue
        fecha       = match[0].strip()
        descripcion = match[2].strip()
        entrada     = match[3].strip()
        salida      = match[4].strip()

        # Add year when missing
        if str(_CURRENT_YEAR) not in fecha and str(_CURRENT_YEAR - 1) not in fecha:
            fecha += f' {_CURRENT_YEAR}'

        # Remove nested table artefacts
        descripcion = re.sub(r'\|.*\|', '', descripcion).strip()

        # Determine monetary value — all goes into SALIDA column, negated if expense
        valor_monetario = ""
        if entrada and '€' in entrada:
            valor_monetario = entrada
        elif salida and '€' in salida:
            num_part = salida.replace('€', '').strip()
            valor_monetario = f'-{num_part} €'
        elif '€' in descripcion:
            valor_match = re.search(r'(\d+,\d{2}\s*€)', descripcion)
            if valor_match:
                valor_monetario = valor_match.group(1)

        row = {
            "FECHA":             fecha,
            "TIPO":              "",
            "DESCRIPCIÓN":       descripcion,
            "ENTRADA DE DINERO": "",
            "SALIDA DE DINERO":  valor_monetario,
            "BALANCE":           "",
        }
        df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)

    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", prefix="tr_stmt_", delete=False)
    tmp.close()

    col_widths = {
        "FECHA": 15, "TIPO": 10, "DESCRIPCIÓN": 40,
        "ENTRADA DE DINERO": 20, "SALIDA DE DINERO": 20, "BALANCE": 15,
    }
    with pd.ExcelWriter(tmp.name, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Transacciones")
        ws = writer.sheets["Transacciones"]
        for i, col in enumerate(df.columns):
            ws.column_dimensions[chr(65 + i)].width = col_widths.get(col, 15)

    return tmp.name


def parse_to_transactions(pdf_path: str) -> list[dict]:
    """
    Parse PDF and return a list of dicts for SmartBudget /import/auto:
      [{"date": "2025-03-15", "description": "NETFLIX", "amount": -10.99}, ...]

    Built on top of the working _clean_transactions_table() output so the
    row extraction is identical to what parse_to_markdown() produces.
    """
    raw_md = _to_markdown_raw(pdf_path)
    clean_table = _clean_transactions_table(raw_md)

    transactions: list[dict] = []

    for line in clean_table.splitlines():
        # Skip header and separator lines
        if not line.startswith('|') or 'FECHA' in line or re.match(r'\|[\s\-|]+\|', line):
            continue

        cells = [c.strip() for c in line.split('|')]
        # cells[0] is empty (before first |), then: fecha, tipo, desc, entrada, salida, balance
        if len(cells) < 7:
            continue

        fecha_str   = cells[1]
        descripcion = cells[3]
        entrada_str = cells[4]
        salida_str  = cells[5]

        # Parse date: "15 mar 2025" → "2025-03-15"
        date_iso = _parse_date_str(fecha_str)
        if not date_iso:
            logger.warning("Skipping — unparseable date: %r", fecha_str)
            continue

        if not descripcion:
            continue

        # Parse amount
        amount = _parse_amount_str(entrada_str, salida_str)
        if amount is None:
            logger.warning("Skipping — no amount: date=%s desc=%s", date_iso, descripcion)
            continue

        transactions.append({
            "date":        date_iso,
            "description": descripcion,
            "amount":      amount,
        })

    return transactions


# ── Date / amount helpers (used only by parse_to_transactions) ────────────────

def _parse_date_str(date_str: str) -> str | None:
    """'dd mon yyyy' → 'YYYY-MM-DD'. Returns None on failure."""
    parts = date_str.strip().lower().split()
    if len(parts) < 3:
        return None
    try:
        day   = int(parts[0])
        month = _MONTH_ES.get(parts[1][:3])
        year  = int(parts[2])
        if not month:
            return None
        return f"{year:04d}-{month:02d}-{day:02d}"
    except (ValueError, IndexError):
        return None


def _parse_amount_str(entrada: str, salida: str) -> float | None:
    """
    entrada / salida are raw cell strings like '1.234,56 €' or ''.
    Returns positive float for income, negative for expense, None if both empty.
    """
    def _to_float(cell: str) -> float | None:
        cell = cell.replace('€', '').replace('.', '').replace(',', '.').strip()
        if not cell or cell == '-':
            return None
        try:
            return float(cell)
        except ValueError:
            return None

    v_in  = _to_float(entrada)
    v_out = _to_float(salida)

    if v_in is not None:
        return v_in           # income → positive
    if v_out is not None:
        return -v_out         # expense → negative
    return None
