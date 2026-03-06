# SmartBudget — Roadmap & Improvement Ideas

This file tracks known issues, planned features, and longer-term ideas.
Items are loosely prioritised: **🔴 High** → **🟡 Medium** → **🟢 Nice-to-have**.

---

## 🐛 Known Issues / Tech Debt

### Backend
- **No Alembic migrations** — schema changes run as raw `ALTER TABLE IF NOT EXISTS` on startup. Fine for a personal project but fragile if two instances start simultaneously or if a column needs to be renamed/dropped.
- **`is_manual` and `account_id` on older rows** — the startup back-fill assigns legacy rules and categories to the user's *earliest* account. If a user had data before multi-account support was added, they should verify assignments are correct.
- **No pagination on transactions** — `GET /accounts/{id}/transactions` returns all rows. On large datasets this will be slow and could OOM the frontend.
- **`alembic` is in requirements.txt but not used** — either add proper migrations or remove the dependency.
- **Password stored with bcrypt but no minimum length enforced** on registration.
- **SECRET_KEY has a weak dev default** (`dev-secret-change-in-production`) — fine locally but easy to accidentally deploy without changing.

### Frontend
- **No loading skeletons** — most pages show nothing until the API responds; a skeleton/spinner would improve perceived performance.
- **Error handling is minimal** — API errors surface as browser console logs or a generic alert, not user-friendly toasts.
- **ReviewPage re-fetches all transactions on every navigation** (year/month arrow clicks). Should cache or memoize data within a session.
- **RulesPage fetches categories and rules independently** on every load; could be combined into a single request.
- **No confirmation dialogs** on destructive actions (delete account, delete category, delete rule). Easy to fat-finger.
- **`recharts` is installed but not visibly used** in the current pages — was it planned for the Dashboard?

### Infrastructure
- **Single-container PostgreSQL** — no replication or backup strategy. For a personal project that's fine, but worth noting.
- **nginx in dev compose exposes port 80 globally** — on shared machines this can conflict with other services.
- **No health checks** in `docker-compose.yml` — the backend starts before PostgreSQL is fully ready; currently masked by SQLAlchemy retry logic but could cause hard failures on slow machines.

---

## 🔴 High Priority Improvements

### 1. Pagination / Virtual List for Transactions
The monthly transaction list can be large (hundreds of rows for active accounts). Add server-side pagination (`?page=&per_page=`) and lazy-load rows in the frontend.

### 2. Proper Error Toasts
Replace `alert()` / console errors with a lightweight toast library (e.g. `react-hot-toast` or a simple hand-rolled component). Show success and error feedback consistently across all pages.

### 3. Delete Confirmation Modals
Before deleting an account, category, or rule — show a confirmation modal listing what will be affected (e.g. "Deleting this account will remove 342 transactions permanently").

### 4. Docker Health Checks
Add `healthcheck` to the `db` service and `depends_on: condition: service_healthy` to `backend` so the app only starts once PostgreSQL is accepting connections.

```yaml
# In docker-compose.yml
db:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-user}"]
    interval: 5s
    timeout: 5s
    retries: 5
backend:
  depends_on:
    db:
      condition: service_healthy
```

### 5. Database Backups
Add a simple `pg_dump` cron job (or a Docker sidecar) to export backups to a local volume or S3 bucket. One corrupted volume and all data is gone.

---

## 🟡 Medium Priority Features

### 6. Charts / Analytics Dashboard
`recharts` is already installed. Add a few visualisations:
- **Spending over time** — line chart of monthly totals (income vs expenses) for the last 12 months.
- **Category breakdown** — pie/donut chart of category percentages for the selected month/year.
- **Balance trend** — running balance over time (requires ordered transaction processing).

### 7. CSV Export
Allow exporting transactions (current view or full account) as a CSV. Useful for tax preparation or importing into spreadsheet tools.

### 8. Rule Priority UI
Currently rules have a numeric `priority` field set manually. A drag-and-drop reorder UI in RulesPage would be much friendlier than typing numbers.

### 9. Multi-column Matching Rules
The current rule engine matches against `raw_description` only. Useful additions:
- Match on **amount range** (e.g. "any expense between -€5 and -€15 → Coffee")
- Match on **day of week / recurring** (e.g. "1st of month + contains 'NETFLIX'")

### 10. Inline Balance / Running Total in Monthly View
Show a running balance column in the monthly transaction table — useful for reconciling against bank statements.

### 11. Bulk Actions in Inbox
Currently "assign category" in the Inbox is one-at-a-time. Add checkboxes and a bulk-assign action for efficiently processing many unmapped transactions.

### 12. Account Archiving
Instead of deleting an account (which permanently removes all transactions), allow archiving — hiding it from the active account selector while preserving history.

---

## 🟢 Nice-to-Have / Future Ideas

### 13. Budget / Spending Goals
Set a monthly budget per category (e.g. "Groceries: €400/month"). Show progress bars and over-budget warnings on the Dashboard and ReviewPage.

### 14. Recurring Transaction Detection
Automatically flag transactions that appear regularly (same description, similar amount, ~30 day cadence) and group them as "subscriptions". Useful for spotting forgotten recurring charges.

### 15. Multi-Currency Support with FX Conversion
Accounts already have a `currency` field. Add FX rate lookup (e.g. via a free API like exchangerate.host) so the Dashboard can show a unified "total" in a chosen base currency.

### 16. Proper Alembic Migrations
Replace the startup `ALTER TABLE` hack with proper Alembic version-controlled migrations. This would make schema changes safer, reversible, and auditable.

### 17. Split Transactions
Allow splitting a single bank transaction across multiple categories (e.g. a supermarket receipt split between "Groceries" and "Household").

### 18. Tags / Labels
In addition to the single-category assignment, allow free-form tags on transactions (e.g. `#vacation`, `#client-reimbursable`). Useful for cross-category queries.

### 19. Dark Mode
The Tailwind setup supports `class`-based dark mode. Add a toggle in the Layout header and persist the preference in localStorage.

### 20. Mobile / PWA Support
The current layout is desktop-first. A responsive mobile layout + a `manifest.json` would let you add it to your phone's home screen for quick expense lookup.

### 21. HTTPS / Caddy Reverse Proxy
Replace the plain nginx with [Caddy](https://caddyserver.com/) to get automatic TLS via Let's Encrypt. Caddy handles cert renewal automatically with a one-liner config.

### 22. OAuth / Passkeys
Replace username/password auth with GitHub OAuth or WebAuthn passkeys. Fewer passwords to manage, and passkeys are phishing-resistant.

---

## Architecture Decisions Log

| Decision | Why | Trade-off |
|----------|-----|-----------|
| Startup migrations instead of Alembic | Zero ceremony for a personal project | No rollback path; risky for production schema changes |
| Balance computed at read time | No drift from manual DB edits | Slightly slower read; needs index on `transactions.account_id` |
| SHA-256 checksum deduplication | Re-import is safe and idempotent | Checksum collision (SHA-256) is astronomically unlikely but theoretically possible |
| `is_manual` flag on transactions | Preserves deliberate categorisation across remaps | User must explicitly clear the flag to let auto-mapping resume |
| All categories/rules account-scoped | Clean isolation between accounts | No way to share a rule across accounts (yet) |
| Single `main.py` for all routes | Fast to iterate in a personal project | Will get unwieldy as the app grows; should split into routers |

---

## Ideas Backlog (Unordered)

- Notification / email alert when a new transaction matches "interesting" categories (large expenses, unknown payees)
- Import from OFX/QIF format (common bank export formats in addition to CSV)
- Shareable read-only account link (for accountants / partners)
- Two-factor authentication
- Transaction search / full-text filter bar
- Audit log of category/rule changes
- API key authentication (alternative to JWT) for bot integrations
- Scheduled auto-import via a cron-triggered bot container in the compose stack
