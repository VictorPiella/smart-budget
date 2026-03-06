# Project Context: SmartBudget Tracker (Multi-User & Multi-Account)

## Project Overview
A dockerized full-stack application for multi-user financial tracking. A single user can manage multiple "Accounts" (e.g., Personal, Business, Savings) independently. The core engine maps raw bank descriptions to custom categories using flexible matching rules.

## Tech Stack
- **Environment:** Docker (Docker Compose)
- **Database:** PostgreSQL (Relational integrity for Users/Accounts/Transactions)
- **Backend:** Python (FastAPI) or Node.js (Next.js)
- **Frontend:** React/Tailwind CSS

---

## Core Data Models

### 1. User
- `id`: UUID
- `email`: String (Unique)
- `password_hash`: String

### 2. Account (The "Wallet")
- `id`: UUID
- `user_id`: FK to User
- `name`: String (e.g., "Personal Chase", "Business LLC")
- `currency`: String (Default: EUR/USD)
- `balance`: Decimal (Calculated or Manual)

### 3. Transaction
- `id`: UUID
- `account_id`: FK to Account (Inherits user_id context)
- `date`: Date
- `raw_description`: Full string from bank (concept + observations)
- `amount`: Decimal
- `category_id`: FK to Category (Nullable)
- `checksum`: String (Hash of date+amount+description to prevent duplicates on re-import)

### 4. Mapping Rule
- `id`: UUID
- `user_id`: FK to User (Rules can apply globally to all user accounts)
- `category_id`: FK to Category
- `pattern`: String
- `match_type`: Enum (Exact, Starts With, Contains)

---

## Page Requirements & Features

### 1. Account Dashboard (Multi-Account Support)
- **Switching:** A global selector to filter views by a specific account or "All Accounts".
- **Isolation:** Transactions and rules should be scoped to the user, but transactions must belong to a specific account.

### 2. Smart Import Page
- **Account Selection:** User must pick which account they are importing into.
- **Methods:** File upload, Paste, or API.
- **Deduplication Logic:** Before saving, the system checks the `checksum`. If a transaction with the same date, amount, and description exists in that account, it is skipped.

### 3. Rules & Categories Page
- User-defined categories (e.g., "Software SaaS", "Groceries").
- **Mapping Logic:**
    - `Exact`: `pattern == raw_description`
    - `Starts With`: `raw_description.startsWith(pattern)`
    - `Contains`: `pattern in raw_description`

### 4. Monthly & Yearly Review
- **Monthly:** List of transactions. Highlight "Unmapped" items. Toggle between months/years.
- **Yearly:** Pivot table showing categories vs. months. 
- **Analytics:** Line charts for spending trends per account.

### 5. Unmapped "Inbox"
- A "clean-up" view showing all transactions without a category across all accounts.
- Quick-action UI to create a rule directly from a transaction's description.

---

## Business Logic Flow
1. **User Login:** Accesses their private workspace.
2. **Account Setup:** Creates "Personal" and "Business" accounts.
3. **Import:** Uploads a CSV to "Business". The system skips duplicates and auto-categorizes based on existing rules.
4. **Refine:** User goes to "Unmapped", sees a new SaaS charge, creates a "Contains" rule for "Subscriptions", and the system retroactively updates all matching transactions.