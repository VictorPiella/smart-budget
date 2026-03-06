# SmartBudget Tracker

A self-hosted, multi-account personal finance tracker. Import bank CSVs, build auto-categorisation rules, and review your spending in a yearly/monthly pivot view — all running locally in Docker.

![Stack](https://img.shields.io/badge/stack-FastAPI%20%7C%20React%20%7C%20PostgreSQL%20%7C%20Docker-blue)
![CI](https://github.com/VictorPiella/smart-budget/actions/workflows/docker-publish.yml/badge.svg)

---

## Features

| Area | What you get |
|------|-------------|
| **Multi-account** | Create unlimited accounts (e.g. "Personal", "Business"). All data is fully isolated per account. |
| **CSV Import** | 2-step import: auto-detect columns → confirm → import. Supports file upload or paste. Deduplication via SHA-256 checksum. |
| **Mapping Rules** | Define `Exact`, `Starts With`, or `Contains` rules per account. Rules fire on every import and can be retroactively applied via **Remap**. |
| **Inbox** | Zero-category triage view. Assign a category inline or create a rule directly from a transaction description. |
| **Review** | Yearly pivot table (categories × months). Click any month to drill into the monthly transaction list with inline editing. |
| **Manual overrides** | Manually assign a category via the Dashboard or Review page. Manual assignments are protected from remap (marked with an **M** badge). |
| **Bot-friendly API** | JSON endpoint for external scripts (e.g. a PDF-to-transactions bot) to push transactions programmatically. |
| **Auth** | JWT-based, per-user data isolation, password change from the UI. |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.12, FastAPI 0.111, SQLAlchemy 2.0, Pydantic v2 |
| Database | PostgreSQL 15 |
| Frontend | React 18, React Router 6, Tailwind CSS 3, Recharts, Axios |
| Reverse proxy | Nginx (Alpine) |
| Container | Docker + Docker Compose |
| CI/CD | GitHub Actions → Docker Hub |

---

## Project Structure

```
smart-budget/
├── backend/
│   ├── app/
│   │   ├── main.py          # All FastAPI routes + startup migrations
│   │   └── models.py        # SQLAlchemy models
│   ├── Dockerfile           # Dev image (hot-reload)
│   ├── Dockerfile.prod      # Production image (uvicorn, 2 workers)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api.js           # Axios instance (baseURL=/api, Bearer token)
│   │   ├── context/
│   │   │   ├── AccountContext.js   # Global account state + localStorage
│   │   │   └── AuthContext.js      # JWT auth state
│   │   ├── components/
│   │   │   └── Layout.js    # Shell, account selector, change-password modal
│   │   └── pages/
│   │       ├── DashboardPage.js    # Account list, balances, inline tx editing
│   │       ├── ImportPage.js       # 2-step CSV import
│   │       ├── InboxPage.js        # Unmapped transaction triage
│   │       ├── ReviewPage.js       # Yearly/monthly pivot + inline editing
│   │       ├── RulesPage.js        # Category & rule management
│   │       ├── LoginPage.js
│   │       └── RegisterPage.js
│   ├── Dockerfile
│   └── Dockerfile.prod      # Multi-stage: React build → nginx
├── nginx/
│   ├── nginx.conf           # Dev proxy config
│   └── nginx.prod.conf      # Production SPA config (serves static + proxies /api/)
├── .github/workflows/
│   └── docker-publish.yml   # CI: build & push to Docker Hub on push to master
├── docker-compose.yml       # Development stack
├── docker-compose.prod.yml  # Production stack (pulls images from Docker Hub)
└── .env.example             # Environment variable template
```

---

## Quick Start (Development)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- Git

### 1. Clone the repo

```bash
git clone https://github.com/VictorPiella/smart-budget.git
cd smart-budget
```

### 2. (Optional) Create a `.env` file

The dev compose has sensible defaults so `.env` is optional locally:

```bash
cp .env.example .env
# Edit .env with your preferred values if you want
```

### 3. Start the stack

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| App (via Nginx) | http://localhost |
| Frontend direct | http://localhost:3001 |
| Backend API | http://localhost:8000 |
| PostgreSQL | localhost:5432 |

### 4. Register an account

Open http://localhost and click **Register**. Create an account, then start adding your first wallet.

> **Hot-reload:** Both the backend (uvicorn `--reload`) and frontend (CRA dev server) support hot-reload. Edit files locally — changes reflect immediately without restarting containers.

---

## Deployment (Production)

### Prerequisites
- A Linux server with Docker + Docker Compose installed
- A [Docker Hub](https://hub.docker.com/) account
- This repo pushed to GitHub with two repository secrets set:

| Secret | Value |
|--------|-------|
| `DOCKER_USER` | Your Docker Hub username |
| `DOCKER_TOKEN` | A Docker Hub **Personal Access Token** (Read, Write, Delete) |

> Create a PAT at Docker Hub → Account Settings → Security → New Access Token.

### CI/CD Flow

Every push to `master` triggers the GitHub Actions workflow (`.github/workflows/docker-publish.yml`):

1. Builds `backend` image from `./backend/Dockerfile.prod`
2. Builds `frontend` image from `./frontend/Dockerfile.prod` (multi-stage: React → nginx)
3. Pushes both as `{DOCKER_USER}/smart-budget-backend:latest` and `{DOCKER_USER}/smart-budget-frontend:latest`
4. Also tags each image with the commit SHA for rollbacks

### Deploy on your server

```bash
# 1. Copy docker-compose.prod.yml and .env.example to your server
scp docker-compose.prod.yml .env.example user@your-server:~/smartbudget/

# 2. SSH into your server
ssh user@your-server
cd ~/smartbudget

# 3. Create and fill in your .env
cp .env.example .env
nano .env   # Fill in all values — no defaults here!

# 4. Pull and start
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

The app will be available on **port 80** of your server.

### `.env` variables

| Variable | Description |
|----------|-------------|
| `DOCKER_USER` | Docker Hub username (used to pull images) |
| `POSTGRES_USER` | Database username |
| `POSTGRES_PASSWORD` | Database password — use a strong value |
| `POSTGRES_DB` | Database name |
| `SECRET_KEY` | JWT signing key — generate with `openssl rand -hex 32` |

---

## API Reference

All endpoints are prefixed with `/api/`. Authentication uses `Authorization: Bearer <token>`.

### Auth

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `POST` | `/api/auth/register` | `{ email, password }` | `{ access_token }` |
| `POST` | `/api/auth/login` | form: `username=&password=` | `{ access_token }` |
| `POST` | `/api/auth/change-password` | `{ current_password, new_password }` | `200 OK` |

### Accounts

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/accounts` | Balance computed from transaction SUM |
| `POST` | `/api/accounts` | `{ name, currency }` |
| `PATCH` | `/api/accounts/{id}` | `{ name?, currency? }` |
| `DELETE` | `/api/accounts/{id}` | Cascades to all account data |

### Transactions (account-scoped)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/accounts/{id}/transactions` | `?year=&month=&unmapped_only=true` |
| `PATCH` | `/api/accounts/{id}/transactions/{txn_id}` | `{ date?, raw_description?, amount?, category_id?, is_manual? }` |

### Categories & Rules

```
GET/POST   /api/accounts/{id}/categories
PATCH/DELETE /api/accounts/{id}/categories/{cat_id}

GET/POST   /api/accounts/{id}/rules
PATCH/DELETE /api/accounts/{id}/rules/{rule_id}

POST /api/accounts/{id}/remap   # Re-run mapping engine on all transactions
```

### Import

```
POST /api/accounts/{id}/import/preview   # Detect columns from CSV
POST /api/accounts/{id}/import           # Full CSV import (multipart)
POST /api/accounts/{id}/import/auto      # Bot-friendly JSON import (see below)
```

---

## Bot / Auto-Import API

For external scripts (PDF parsers, bank scrapers, etc.) that push transactions programmatically.

### 1. Get a token

```bash
curl -X POST http://your-server/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=you@example.com&password=yourpassword"
# → { "access_token": "eyJ..." }
```

### 2. Find your account ID

```bash
curl http://your-server/api/accounts \
  -H "Authorization: Bearer eyJ..."
# → [{ "id": "uuid-here", "name": "My Bank", ... }]
```

### 3. Push transactions

```bash
curl -X POST http://your-server/api/accounts/{account_id}/import/auto \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{
    "transactions": [
      { "date": "2024-01-15", "description": "NETFLIX.COM 123", "amount": -10.99 },
      { "date": "2024-01-20", "description": "SALARY ACME CORP", "amount": 3500.00 }
    ]
  }'
# → { "total_rows": 2, "imported": 2, "skipped_duplicates": 0 }
```

**Rules:**
- `date` — ISO format `YYYY-MM-DD`
- `amount` — negative = expense, positive = income
- Re-sending the same data is safe — duplicates are silently skipped
- Mapping rules fire automatically on every import

---

## Architecture Notes

### Database Migrations
There is no Alembic migration runner. Instead, `main.py` runs idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements at every container start. This keeps things simple for a personal project — just start the container and the schema is always up to date.

### Balance Calculation
`Account.balance` is a stored column but its value is ignored. The balance shown in the UI is always computed live as `SUM(transactions.amount)` for the account. This avoids drift from out-of-band edits.

### Deduplication
Each transaction gets a SHA-256 checksum of `date|amount|description` (lowercase, stripped). On re-import the checksum is looked up first; matches are skipped. The checksum is only recomputed on `PATCH` if date/description/amount fields change — category-only edits do not reset it.

### Manual Assignments
When you manually assign a category (via Dashboard, ReviewPage, or InboxPage), the transaction is flagged `is_manual = true`. The remap engine skips these transactions, so your manual choices are never overwritten. You can reset a transaction back to auto-mapping by sending `PATCH { "is_manual": false }`.

### Mapping Engine
Rules are evaluated in **descending priority order**; the first match wins. Matching is always case-insensitive.

---

## Screenshots

> *(Add screenshots here once the app is deployed)*

---

## License

MIT — use freely, modify as you like.
