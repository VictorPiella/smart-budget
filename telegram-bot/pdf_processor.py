"""
Unified Trade Republic (Spanish) PDF processor.

Three public functions:
  parse_to_markdown(pdf_path)      -> str
  parse_to_excel(pdf_path)         -> str  (path to temp .xlsx file — caller must delete)
  parse_to_transactions(pdf_path)  -> list[dict]  (for SmartBudget /import/auto)
"""
from __future__ import annotations

import logging
import re
import tempfile
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

import pandas as pd
from docling.document_converter import DocumentConverter

logger = logging.getLogger(__name__)

# ── Spanish month map ─────────────────────────────────────────────────────────
_MONTH_ES: dict[str, int] = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4,
    "may": 5, "jun": 6, "jul": 7, "ago": 8,
    "sep": 9, "oct": 10, "nov": 11, "dic": 12,
}

# ── Row regex — matches one data row from the docling markdown table ──────────
# Columns: FECHA | TIPO | DESCRIPCIÓN | ENTRADA | SALIDA | BALANCE
_ROW_RE = re.compile(
    r'\|\s*(\d{1,2}\s+\w{3}(?:\s+\d{4})?)\s*\|'  # 1: date
    r'\s*([^|]*?)\s*\|'                             # 2: tipo
    r'\s*([^|]*?)\s*\|'                             # 3: descripción
    r'\s*([^|]*?)\s*\|'                             # 4: entrada (income)
    r'\s*([^|]*?)\s*\|'                             # 5: salida (expense)
    r'\s*([^|]*?)\s*\|',                            # 6: balance
    re.IGNORECASE,
)

# Header detection — marks where the table starts
_HEADER_RE = re.compile(
    r'\|\s*FECHA\s*\|\s*TIPO\s*\|\s*DESCRIPCI[OÓ]N',
    re.IGNORECASE,
)

# Lines to skip regardless of content
_SKIP_RES = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r'trade\s+republic',
        r'creado\s+en',
        r'directores',
        r'^\|\s*-+\s*\|',          # separator rows |---|---|
        r'^\|\s*FECHA\s*\|',       # header row itself
    ]
]


# ── Internal helpers ──────────────────────────────────────────────────────────

def _to_markdown_raw(pdf_path: str) -> str:
    """Run docling on the PDF and return raw markdown. Cached by caller."""
    converter = DocumentConverter()
    result = converter.convert(pdf_path)
    return result.document.export_to_markdown()


def _extract_matches(raw_md: str) -> list[re.Match]:
    """Return all table-row regex matches, skipping header / meta lines."""
    in_table = False
    matches: list[re.Match] = []
    for line in raw_md.splitlines():
        if _HEADER_RE.search(line):
            in_table = True
            continue
        if not in_table:
            continue
        if any(p.search(line) for p in _SKIP_RES):
            continue
        m = _ROW_RE.match(line)
        if m:
            matches.append(m)
    return matches


def _parse_date(date_str: str) -> Optional[str]:
    """
    'dd mon' or 'dd mon yyyy' → 'YYYY-MM-DD'.
    Missing year defaults to the current year (dynamic, not hardcoded).
    """
    parts = date_str.strip().lower().split()
    if len(parts) < 2:
        return None
    try:
        day = int(parts[0])
        month = _MONTH_ES.get(parts[1][:3])
        if not month:
            return None
        year = int(parts[2]) if len(parts) >= 3 else datetime.now().year
        return f"{year:04d}-{month:02d}-{day:02d}"
    except (ValueError, IndexError):
        return None


def _parse_amount(cell: str) -> Optional[Decimal]:
    """
    '1.234,56 €' → Decimal('1234.56').  Returns None if cell is empty.
    European format: '.' = thousands sep, ',' = decimal sep.
    """
    cell = cell.strip().replace("€", "").strip()
    if not cell or cell == "-":
        return None
    cell = cell.replace(".", "").replace(",", ".")
    try:
        return Decimal(cell)
    except InvalidOperation:
        return None


def _fix_date_display(date_str: str) -> str:
    """
    For the markdown/excel display: add current year to dates that lack one.
    e.g. '15 mar' → '15 mar 2025'
    """
    parts = date_str.strip().split()
    if len(parts) == 2:  # no year
        return f"{date_str} {datetime.now().year}"
    return date_str


# ── Public API ────────────────────────────────────────────────────────────────

def parse_to_markdown(pdf_path: str) -> str:
    """
    Parse a Trade Republic (Spanish) PDF and return a formatted markdown table.
    Replicates original pdf_processor_to_markdown.py behaviour.
    """
    raw_md = _to_markdown_raw(pdf_path)
    matches = _extract_matches(raw_md)

    lines = [
        "| FECHA | TIPO | DESCRIPCIÓN | ENTRADA DE DINERO | SALIDA DE DINERO | BALANCE |",
        "|-------|------|-------------|-------------------|-----------------|---------|",
    ]
    for m in matches:
        cols = [m.group(i).strip() for i in range(1, 7)]
        cols[0] = _fix_date_display(cols[0])
        lines.append("| " + " | ".join(cols) + " |")

    return "\n".join(lines)


def parse_to_excel(pdf_path: str) -> str:
    """
    Parse a Trade Republic (Spanish) PDF and write an .xlsx file.
    Returns the path to the temp file — the caller is responsible for deletion.
    Replicates original pdf_processor_to_excel.py behaviour.
    """
    raw_md = _to_markdown_raw(pdf_path)
    matches = _extract_matches(raw_md)

    records = []
    for m in matches:
        fecha       = _fix_date_display(m.group(1).strip())
        descripcion = m.group(3).strip()
        entrada_raw = m.group(4).strip()
        salida_raw  = m.group(5).strip()

        # Determine monetary value (all goes into SALIDA DE DINERO, negated if expense)
        if entrada_raw and "€" in entrada_raw:
            valor = entrada_raw          # income — keep as-is
        elif salida_raw and "€" in salida_raw:
            num = salida_raw.replace("€", "").strip()
            valor = f"-{num} €"          # expense — negate
        else:
            valor = ""

        records.append({
            "FECHA":             fecha,
            "TIPO":              "",
            "DESCRIPCIÓN":       descripcion,
            "ENTRADA DE DINERO": "",
            "SALIDA DE DINERO":  valor,
            "BALANCE":           "",
        })

    df = pd.DataFrame(records, columns=[
        "FECHA", "TIPO", "DESCRIPCIÓN",
        "ENTRADA DE DINERO", "SALIDA DE DINERO", "BALANCE",
    ])

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
    Parse a Trade Republic (Spanish) PDF and return a list of dicts
    compatible with the SmartBudget /import/auto API:

      [{"date": "2025-03-15", "description": "NETFLIX", "amount": -10.99}, ...]

    - Entrada column → positive amount (income)
    - Salida  column → negative amount (expense)
    - Rows with unparseable dates or missing amounts are skipped with a warning
    """
    raw_md = _to_markdown_raw(pdf_path)
    matches = _extract_matches(raw_md)

    transactions: list[dict] = []
    for m in matches:
        date_iso = _parse_date(m.group(1))
        if not date_iso:
            logger.warning("Skipping row — unparseable date: %r", m.group(1))
            continue

        description = m.group(3).strip()
        if not description:
            continue

        entrada = _parse_amount(m.group(4))
        salida  = _parse_amount(m.group(5))

        if entrada is not None:
            amount = float(entrada)        # positive — income
        elif salida is not None:
            amount = -float(salida)        # negative — expense
        else:
            logger.warning("Skipping row — no amount: date=%s desc=%s", date_iso, description)
            continue

        transactions.append({
            "date":        date_iso,
            "description": description,
            "amount":      amount,
        })

    return transactions
