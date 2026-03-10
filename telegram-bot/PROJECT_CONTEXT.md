# financeBotTelegram — Project Context for Fusion

> Use this file to give Claude full context about this project when merging/fusing it with another project.

---

## What this project does

A Telegram bot that accepts bank transaction PDF files and returns the data either as:
- A formatted **Markdown table** (sent directly in Telegram)
- An **Excel (.xlsx) file** (sent as a document attachment)

The PDFs are from **Trade Republic** bank statements. The bot is designed to be self-hosted via Docker on Unraid.

---

## Architecture Overview

```
financeBotTelegram/
├── main.py                          # Entry point — instantiates and runs FinanceBot
├── config/
│   └── config.py                    # Reads BOT_TOKEN and PDF_UPLOAD_FOLDER from env vars
├── src/
│   ├── bot.py                       # Core bot class (FinanceBot) — all Telegram logic
│   ├── pdf_processor_to_markdown.py # PDF → Markdown table string
│   └── pdf_processor_to_excel.py    # PDF → .xlsx file
├── Dockerfile                       # python:3.10-slim, WORKDIR /app, runs main.py
├── docker-compose.yml               # Single service "finance-bot", mounts ./uploads
├── requirements.txt                 # Dependencies (see below)
└── .github/workflows/deploy.yml     # CI: build & push to Docker Hub on push to main
```

---

## Key Components

### `config/config.py`
```python
BOT_TOKEN = os.environ.get('BOT_TOKEN', '')
PDF_UPLOAD_FOLDER = os.environ.get('PDF_UPLOAD_FOLDER', '/app/uploads')
```
- All secrets via environment variables
- No `.env` file — secrets injected at runtime (Docker env / Unraid template)

---

### `src/bot.py` — `FinanceBot` class

**Handlers registered:**
| Handler | Trigger | Method |
|---|---|---|
| `/start` | Command | `start()` |
| `/help` | Command | `help()` |
| PDF document | `filters.Document.PDF` | `handle_pdf()` |
| Inline button press | `CallbackQueryHandler` | `handle_button()` |

**Flow:**
1. User sends PDF → `handle_pdf()` downloads it to `PDF_UPLOAD_FOLDER/{short_id}.pdf`
2. Bot replies with inline keyboard: `[Markdown]` / `[Excel]`
3. `handle_button()` reads `callback_data` format `"format_type:short_id"` (e.g. `"md:abc12345"` or `"excel:abc12345"`)
4. Calls the appropriate processor, sends result, **deletes both PDF and output files** after use
5. `file_paths` dict maps `short_id → pdf_path` in memory (not persisted)

**Error handling:** All async methods wrapped in try/except; errors sent back to user as messages.

---

### `src/pdf_processor_to_markdown.py`

**Library:** `docling` (`DocumentConverter`)

**Logic:**
1. `DocumentConverter().convert(pdf_path)` → exports to raw markdown string
2. `clean_transactions_table()` applies regex to:
   - Find tables with header pattern `| FECHA | TIPO | DESCRIPCIÓN ...`
   - Skip separator rows (`|---|---|`)
   - Skip rows containing `trade republic`, `creado en`, `directores`
   - Normalize rows to 6 columns
   - Auto-append `2025` to dates missing a year (e.g. `"15 mar"` → `"15 mar 2025"`)
3. Returns a single combined markdown table string

**Output columns:** `FECHA | TIPO | DESCRIPCIÓN | ENTRADA DE DINERO | SALIDA DE DINERO | BALANCE`

---

### `src/pdf_processor_to_excel.py`

**Libraries:** `docling`, `pandas`, `openpyxl`

**Logic:**
1. Same docling conversion → raw markdown
2. Regex extracts transaction rows: `r'\|\s*(\d{2}\s+\w{3}(?:\s+\d{4})?)\s*\|...'`
3. For each match:
   - Adds year `2025` if missing from date
   - Detects if amount is entrada (income, `€` in col 3) or salida (expense, `€` in col 4)
   - **All amounts go into `SALIDA DE DINERO` column** — negated if expense
   - `TIPO`, `ENTRADA DE DINERO`, `BALANCE` columns left **empty** by design
4. Saves `.xlsx` next to the `.pdf` (`pdf_path.replace('.pdf', '.xlsx')`)
5. Column widths hardcoded: FECHA=15, TIPO=10, DESCRIPCIÓN=40, ENTRADA/SALIDA=20, BALANCE=15

---

## Dependencies (`requirements.txt`)
```
python-telegram-bot>=20.0
pandas>=1.3.0
openpyxl>=3.0.0
docling
```

- `python-telegram-bot` v20+ uses async/await (PTB v20 API)
- `docling` = IBM's document conversion library (handles PDF → markdown with table detection)

---

## Docker / Deployment

**Dockerfile:**
```dockerfile
FROM python:3.10-slim
WORKDIR /app
RUN pip install -r requirements.txt
COPY . .
RUN mkdir -p /app/uploads
ENV PDF_UPLOAD_FOLDER=/app/uploads
CMD ["python", "main.py"]
```

**docker-compose.yml:**
- Service name: `finance-bot`
- `restart: unless-stopped`
- Volume: `./uploads:/app/uploads`
- Env: `TZ=Europe/Madrid`
- Label: `com.unraid.appdata=/app/uploads`

**GitHub Actions (`.github/workflows/deploy.yml`):**
- Trigger: push to `main` or manual dispatch
- Builds and pushes to Docker Hub: `victorpiella/finance-bot:latest`
- Secrets needed: `DOCKER_HUB_USERNAME`, `DOCKER_HUB_TOKEN`

**Runtime secret needed:**
- `BOT_TOKEN` — must be injected via environment variable (not in code or image)

---

## Design Decisions & Constraints

| Decision | Reason |
|---|---|
| PDF deleted after processing | Avoid storage buildup; privacy |
| `short_id` (UUID8) as file key | Avoids collisions, keeps paths short |
| All monetary values in one column | User's explicit preference |
| `docling` for PDF parsing | Handles complex table structures in bank PDFs |
| In-memory `file_paths` dict | Simple; no DB needed; bot restarts are acceptable |
| Spanish language in messages | Bot owner is Spanish-speaking |
| Dates defaulted to 2025 | Trade Republic PDFs sometimes omit year in transaction rows |

---

## What is NOT in this project

- No database
- No user authentication / whitelist (any Telegram user can use the bot)
- No CSV output (processor file exists in `__pycache__` artifacts but not in source)
- No web interface
- No scheduler or polling jobs
- No logging framework (print statements only)

---

## Entry Point Summary

```python
# main.py
from src.bot import FinanceBot
bot = FinanceBot()
bot.run()  # calls application.run_polling()
```

Everything starts and stays in `run_polling()` — long-polling mode, no webhooks.
