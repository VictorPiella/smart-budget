"""
Extracts structured transactions from a Trade Republic markdown table.

Uses the same per-row regex as pdf_processor_to_excel.py (proven working):
matches individual rows by the Spanish date pattern (dd Mon [yyyy]) without
needing to hunt for the table header, so it works on both raw docling markdown
and the cleaned output returned by process_pdf_to_markdown.

Public API:
  extract_transactions_from_markdown(markdown_content) → list of dicts
  [{"date": "YYYY-MM-DD", "description": str, "amount": float}, ...]
"""
from datetime import datetime
import re

_MONTH_ES = {
    "ene": 1, "feb": 2, "mar": 3, "abr": 4,
    "may": 5, "jun": 6, "jul": 7, "ago": 8,
    "sep": 9, "oct": 10, "nov": 11, "dic": 12,
}

# Same pattern as pdf_processor_to_excel.py — matches a full table row whose
# first cell looks like a Spanish date (e.g. "15 ene" or "15 ene 2025").
_ROW_PATTERN = re.compile(
    r'\|\s*(\d{1,2}\s+\w{3}(?:\s+\d{4})?)\s*'   # col 1: date
    r'\|\s*([^|]*)'                                # col 2: tipo   (ignored)
    r'\|\s*([^|]*)'                                # col 3: description
    r'\|\s*([^|]*)'                                # col 4: entrada (income)
    r'\|\s*([^|]*)'                                # col 5: salida  (expense)
    r'\|\s*([^|]*)\|'                              # col 6: balance (ignored)
)


def extract_transactions_from_markdown(markdown_content: str) -> list:
    current_year = datetime.now().year
    transactions = []

    for m in _ROW_PATTERN.finditer(markdown_content):
        fecha_str   = m.group(1).strip()
        descripcion = m.group(3).strip()
        entrada_str = m.group(4).strip()
        salida_str  = m.group(5).strip()

        if not fecha_str or not descripcion:
            continue

        # Skip metadata / header rows that leaked through
        combined = (fecha_str + descripcion).lower()
        if any(x in combined for x in ['trade republic', 'creado en', 'directores']):
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


# ── helpers ───────────────────────────────────────────────────────────────────

def _parse_date(date_str: str, current_year: int):
    """'15 ene' → '2026-01-15',  '15 ene 2025' → '2025-01-15'"""
    parts = date_str.lower().split()
    if len(parts) < 2:
        return None
    try:
        day   = int(parts[0])
        month = _MONTH_ES.get(parts[1][:3])
        if not month:
            return None
        year  = int(parts[2]) if len(parts) >= 3 else current_year
        return f"{year:04d}-{month:02d}-{day:02d}"
    except (ValueError, IndexError):
        return None


def _parse_amount(entrada: str, salida: str):
    """European format: '1.234,56 €' → 1234.56.  Expense → negative."""
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

    if v_in  is not None:
        return  v_in   # income  → positive
    if v_out is not None:
        return -v_out  # expense → negative
    return None
