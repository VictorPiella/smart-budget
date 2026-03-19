import csv
import io
import math
import os
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
import json
from typing import Any, Dict, List, Optional

from fastapi import (
    BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile, status
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import create_engine, extract, func, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, sessionmaker

from .models import (
    Base, Account, Category, InvestmentSnapshot, MappingRule, MatchType, Transaction, User,
    compute_checksum,
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL                = os.getenv("DATABASE_URL") or (
    "postgresql://{user}:{password}@{host}:{port}/{db}".format(
        user     = os.getenv("POSTGRES_USER",     "budget_user"),
        password = os.getenv("POSTGRES_PASSWORD", "password"),
        host     = os.getenv("DB_HOST",           "localhost"),
        port     = os.getenv("DB_PORT",           "5432"),
        db       = os.getenv("POSTGRES_DB",       "budget_db"),
    )
)
SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY environment variable is required. "
        "Generate a strong value with: openssl rand -hex 32"
    )
ALGORITHM                   = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 8)))  # 8 h default

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB — enforced on all file uploads

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

engine       = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

with engine.connect() as _conn:
    _conn.execute(text("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE"))
    _conn.execute(text("ALTER TABLE categories ADD COLUMN IF NOT EXISTS color VARCHAR(7) NOT NULL DEFAULT '#6366f1'"))
    _conn.execute(text("ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_income BOOLEAN NOT NULL DEFAULT FALSE"))
    _conn.execute(text("ALTER TABLE categories ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE"))
    _conn.execute(text("ALTER TABLE mapping_rules ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE"))
    # Back-fill account_id on legacy rows (assign to user's earliest account)
    _conn.execute(text("""
        UPDATE categories c
        SET account_id = (SELECT a.id FROM accounts a WHERE a.user_id = c.user_id ORDER BY a.created_at LIMIT 1)
        WHERE c.account_id IS NULL
    """))
    _conn.execute(text("""
        UPDATE mapping_rules r
        SET account_id = (SELECT a.id FROM accounts a WHERE a.user_id = r.user_id ORDER BY a.created_at LIMIT 1)
        WHERE r.account_id IS NULL
    """))
    # Migrate unique constraint from user-scoped to account-scoped
    _conn.execute(text("ALTER TABLE categories DROP CONSTRAINT IF EXISTS uq_user_category_name"))
    _conn.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_account_category_name') THEN
                ALTER TABLE categories ADD CONSTRAINT uq_account_category_name UNIQUE (account_id, name);
            END IF;
        END $$
    """))
    # ── Performance indexes ──────────────────────────────────────────────────
    _conn.execute(text("CREATE INDEX IF NOT EXISTS idx_txn_account_id   ON transactions(account_id)"))
    _conn.execute(text("CREATE INDEX IF NOT EXISTS idx_txn_account_date ON transactions(account_id, date)"))
    _conn.execute(text("CREATE INDEX IF NOT EXISTS idx_txn_checksum     ON transactions(checksum)"))
    _conn.execute(text("CREATE INDEX IF NOT EXISTS idx_txn_account_cat  ON transactions(account_id, category_id)"))
    _conn.execute(text("CREATE INDEX IF NOT EXISTS idx_rules_account_id ON mapping_rules(account_id)"))
    _conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cats_account_id  ON categories(account_id)"))
    # ── Investment tracker columns ────────────────────────────────────────────
    _conn.execute(text("ALTER TABLE categories ADD COLUMN IF NOT EXISTS investment_value NUMERIC(14,2) DEFAULT NULL"))
    _conn.execute(text("ALTER TABLE categories ADD COLUMN IF NOT EXISTS investment_value_updated_at TIMESTAMP DEFAULT NULL"))
    _conn.commit()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def _verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            raise exc
    except JWTError:
        raise exc

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise exc
    return user

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(title="SmartBudget API", version="1.0.0")

# Rate limiter — keyed by client IP
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost", "http://127.0.0.1"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    expose_headers=["X-Total-Count", "X-Total-Pages", "X-Page", "X-Per-Page"],
)

# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------
# Alias to prevent field-name/type-name collision in Pydantic v2:
# a field named 'date' with type Optional[date] causes Python to resolve
# 'date' to the field's default (None) instead of datetime.date.
_Date = date

class UserCreate(BaseModel):
    email:    EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v

class PasswordChange(BaseModel):
    current_password: str
    new_password:     str

    @field_validator("new_password")
    @classmethod
    def new_password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("New password must be at least 8 characters.")
        return v

class UserOut(BaseModel):
    id:    uuid.UUID
    email: str
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type:   str

class AccountCreate(BaseModel):
    name:     str
    currency: str = "USD"

class AccountUpdate(BaseModel):
    name:     Optional[str] = None
    currency: Optional[str] = None

class AccountOut(BaseModel):
    id:       uuid.UUID
    name:     str
    currency: str
    balance:  Decimal
    class Config:
        from_attributes = True

class CategoryCreate(BaseModel):
    name:      str
    color:     str = "#6366f1"
    is_income: bool = False

class CategoryOut(BaseModel):
    id:                          uuid.UUID
    name:                        str
    color:                       str
    is_income:                   bool
    investment_value:            Optional[float]    = None
    investment_value_updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class CategoryUpdate(BaseModel):
    name:             Optional[str]   = None
    color:            Optional[str]   = None
    is_income:        Optional[bool]  = None
    investment_value: Optional[float] = None

class MappingRuleCreate(BaseModel):
    category_id: uuid.UUID
    pattern:     str
    match_type:  MatchType
    priority:    int = 0

class MappingRuleOut(BaseModel):
    id:          uuid.UUID
    category_id: uuid.UUID
    pattern:     str
    match_type:  MatchType
    priority:    int
    class Config:
        from_attributes = True

class MappingRuleUpdate(BaseModel):
    category_id: Optional[uuid.UUID] = None
    pattern:     Optional[str]       = None
    match_type:  Optional[MatchType] = None
    priority:    Optional[int]       = None

class TransactionOut(BaseModel):
    id:              uuid.UUID
    date:            date
    raw_description: str
    amount:          Decimal
    category_id:     Optional[uuid.UUID]
    checksum:        str
    is_manual:       bool
    class Config:
        from_attributes = True

class TransactionUpdate(BaseModel):
    date:            Optional[_Date]     = None
    raw_description: Optional[str]       = None
    amount:          Optional[Decimal]   = None
    category_id:     Optional[uuid.UUID] = None
    is_manual:       Optional[bool]      = None

class ImportPreview(BaseModel):
    headers:             List[str]
    sample_rows:         List[Dict[str, Any]]
    detected_date_col:   Optional[str]
    detected_desc_col:   Optional[str]
    detected_amount_col: Optional[str]

class ImportResult(BaseModel):
    total_rows:         int
    imported:           int
    skipped_duplicates: int
    transactions:       List[TransactionOut]

class AutoImportRow(BaseModel):
    date:        date
    description: str
    amount:      Decimal

class AutoImportRequest(BaseModel):
    transactions: List[AutoImportRow]

# ---------------------------------------------------------------------------
# Mapping Engine
# ---------------------------------------------------------------------------

def apply_mapping_rules(
    description: str,
    rules: List[MappingRule],
) -> Optional[uuid.UUID]:
    """
    Evaluate rules in descending priority order; return the category_id of
    the first rule that matches, or None if no rule fires.

    Match semantics (all comparisons are case-insensitive):
      - exact      : description == pattern
      - starts_with: description starts with pattern
      - contains   : pattern is a substring of description
    """
    desc = description.strip()

    for rule in rules:
        pattern = rule.pattern.strip()

        if rule.match_type == MatchType.exact:
            matched = desc.lower() == pattern.lower()

        elif rule.match_type == MatchType.starts_with:
            matched = desc.lower().startswith(pattern.lower())

        elif rule.match_type == MatchType.contains:
            matched = pattern.lower() in desc.lower()

        else:
            matched = False

        if matched:
            return rule.category_id

    return None

# ---------------------------------------------------------------------------
# CSV Parser
# ---------------------------------------------------------------------------

_DATE_ALIASES = {"date", "transaction date", "trans date", "value date", "fecha", "f.valor"}
_DESC_ALIASES = {"description", "raw_description", "details", "memo",
                 "narrative", "concept", "concepto", "reference", "movimiento"}
_AMT_ALIASES  = {"amount", "value", "debit/credit", "sum", "importe", "impt"}

_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y%m%d")

_SECONDARY_DESC_ALIASES = {"concepto", "concept", "movimiento", "memo", "narrative", "details", "reference"}


def _detect_delimiter(content: str) -> str:
    first_line = content.strip().splitlines()[0] if content.strip() else ""
    tab_count   = first_line.count("\t")
    comma_count = first_line.count(",")
    semi_count  = first_line.count(";")
    if tab_count >= comma_count and tab_count >= semi_count:
        return "\t"
    if semi_count > comma_count:
        return ";"
    return ","


def _resolve_column(fieldnames: List[str], aliases: set) -> Optional[str]:
    for f in fieldnames:
        if f.strip().lower() in aliases:
            return f
    return None


def _parse_date(raw: str) -> Optional[date]:
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw.strip(), fmt).date()
        except ValueError:
            continue
    return None


def _parse_amount(raw: str) -> Optional[Decimal]:
    clean = raw.strip().replace(" ", "")
    if clean.count(",") == 1 and clean.count(".") == 0:
        clean = clean.replace(",", ".")
    elif clean.count(",") >= 1 and clean.count(".") >= 1:
        if clean.rindex(".") > clean.rindex(","):
            clean = clean.replace(",", "")
        else:
            clean = clean.replace(".", "").replace(",", ".")
    else:
        clean = clean.replace(",", "")
    clean = "".join(c for c in clean if c.isdigit() or c in ".-")
    try:
        return Decimal(clean)
    except InvalidOperation:
        return None


def _read_csv(content: str):
    """Return (reader, delimiter) with headers already consumed."""
    delimiter = _detect_delimiter(content)
    reader = csv.DictReader(io.StringIO(content.strip()), delimiter=delimiter)
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV appears to be empty or has no header row.")
    return reader, delimiter


def preview_csv(content: str) -> dict:
    """
    Return headers, up to 5 raw sample rows, and auto-detected column guesses.
    Does NOT raise on detection failure — missing detections are returned as None.
    """
    reader, _ = _read_csv(content)
    headers = [f.strip() for f in reader.fieldnames]

    sample_rows = []
    for row in reader:
        if len(sample_rows) >= 5:
            break
        sample_rows.append({k.strip(): v for k, v in row.items()})

    date_col   = _resolve_column(reader.fieldnames, _DATE_ALIASES)
    desc_col   = _resolve_column(reader.fieldnames, _DESC_ALIASES)
    amount_col = _resolve_column(reader.fieldnames, _AMT_ALIASES)

    return {
        "headers":             headers,
        "sample_rows":         sample_rows,
        "detected_date_col":   date_col.strip()   if date_col   else None,
        "detected_desc_col":   desc_col.strip()   if desc_col   else None,
        "detected_amount_col": amount_col.strip() if amount_col else None,
    }


def parse_csv_content(
    content: str,
    date_col:        Optional[str]       = None,
    desc_col:        Optional[str]       = None,
    amount_col:      Optional[str]       = None,
    extra_desc_cols: Optional[List[str]] = None,
) -> List[dict]:
    """
    Parse a raw CSV/TSV string into a list of {'date', 'description', 'amount'} dicts.

    When date_col/desc_col/amount_col are provided they are used directly (explicit
    column mapping from the UI).  When omitted the function falls back to
    auto-detection via header-name aliases.

    extra_desc_cols: additional columns whose values are appended to the description.
    """
    reader, _ = _read_csv(content)

    # Normalise header names: strip leading/trailing whitespace so that column
    # lookups are consistent with the stripped names returned by preview_csv().
    # Without this, row.get("Date") fails when the raw header is " Date ".
    reader.fieldnames = [f.strip() for f in reader.fieldnames]

    # --- column resolution ---------------------------------------------------
    if date_col and desc_col and amount_col:
        # Validate provided column names exist in the file (both already stripped)
        header_set = set(reader.fieldnames)
        missing = [c for c in [date_col, desc_col, amount_col] if c not in header_set]
        if missing:
            raise HTTPException(status_code=400, detail=f"Column(s) not found in file: {missing}")
        resolved_date   = date_col
        resolved_desc   = desc_col
        resolved_amount = amount_col
    else:
        resolved_date   = _resolve_column(reader.fieldnames, _DATE_ALIASES)
        resolved_desc   = _resolve_column(reader.fieldnames, _DESC_ALIASES)
        resolved_amount = _resolve_column(reader.fieldnames, _AMT_ALIASES)

        if not all([resolved_date, resolved_desc, resolved_amount]):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Could not identify required columns (date, description, amount). "
                    f"Detected headers: {list(reader.fieldnames)}. "
                    f"Use the column mapper to assign them manually."
                ),
            )

    # Strip extra col names too (defensive — frontend sends stripped names but
    # guard against any future caller passing raw header strings)
    extra = [
        c.strip() for c in (extra_desc_cols or [])
        if c and c.strip() and c.strip() != resolved_desc
    ]

    rows = []
    for row in reader:
        # DictReader sets missing cells to None (when a row is shorter than the
        # header), so we coerce with `or ""` rather than relying on the default
        # argument of .get() — .get(key, "") only fires when the key is absent,
        # not when it's present but None.
        raw_date = (row.get(resolved_date) or "")
        raw_desc = (row.get(resolved_desc) or "")
        raw_amt  = (row.get(resolved_amount) or "")

        if not raw_date.strip() or not raw_amt.strip():
            continue

        # Merge extra description columns
        for col in extra:
            extra_val = (row.get(col) or "").strip()
            if extra_val and extra_val.lower() != raw_desc.strip().lower():
                raw_desc = f"{raw_desc.strip()} | {extra_val}" if raw_desc.strip() else extra_val

        if not raw_desc.strip():
            continue

        parsed_date   = _parse_date(raw_date)
        parsed_amount = _parse_amount(raw_amt)

        if parsed_date is None or parsed_amount is None:
            continue

        rows.append({
            "date":        parsed_date,
            "description": raw_desc.strip(),
            "amount":      parsed_amount,
        })

    return rows

# ---------------------------------------------------------------------------
# Public Stats
# ---------------------------------------------------------------------------

@app.get("/stats", tags=["Stats"])
def get_stats(db: Session = Depends(get_db)):
    """Public endpoint — returns aggregate platform statistics."""
    user_count = db.query(func.count(User.id)).scalar() or 0
    return {"user_count": user_count}


# ---------------------------------------------------------------------------
# Auth Routes
# ---------------------------------------------------------------------------

@app.post(
    "/auth/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    tags=["Auth"],
)
@limiter.limit("5/minute")
def register(request: Request, payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Email already registered.")
    user = User(email=payload.email, password_hash=_hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=Token, tags=["Auth"])
@limiter.limit("10/minute")
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db:   Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not _verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {
        "access_token": _create_access_token(str(user.id)),
        "token_type":   "bearer",
    }


@app.post("/auth/change-password", status_code=204, tags=["Auth"])
def change_password(
    payload:      PasswordChange,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    if not _verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    current_user.password_hash = _hash_password(payload.new_password)
    db.commit()


# ---------------------------------------------------------------------------
# Account Routes
# ---------------------------------------------------------------------------

@app.post("/accounts", response_model=AccountOut, status_code=201, tags=["Accounts"])
def create_account(
    payload:      AccountCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    if db.query(Account).filter(
        Account.user_id == current_user.id,
        Account.name    == payload.name,
    ).first():
        raise HTTPException(status_code=409, detail="An account with this name already exists.")
    account = Account(user_id=current_user.id, name=payload.name, currency=payload.currency.upper())
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


def _compute_balance(db: Session, account_id: uuid.UUID) -> Decimal:
    result = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(
        Transaction.account_id == account_id,
    ).scalar()
    return Decimal(str(result))


@app.get("/accounts", response_model=List[AccountOut], tags=["Accounts"])
def list_accounts(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()
    for acc in accounts:
        acc.balance = _compute_balance(db, acc.id)
    return accounts


@app.get("/accounts/{account_id}", response_model=AccountOut, tags=["Accounts"])
def get_account(
    account_id:   uuid.UUID,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    account.balance = _compute_balance(db, account_id)
    return account


@app.patch("/accounts/{account_id}", response_model=AccountOut, tags=["Accounts"])
def update_account(
    account_id:   uuid.UUID,
    payload:      AccountUpdate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    if payload.name is not None:
        account.name = payload.name
    if payload.currency is not None:
        account.currency = payload.currency.upper()
    db.commit()
    db.refresh(account)
    account.balance = _compute_balance(db, account_id)
    return account


@app.delete("/accounts/{account_id}", status_code=204, tags=["Accounts"])
def delete_account(
    account_id:   uuid.UUID,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    db.delete(account)
    db.commit()

# ---------------------------------------------------------------------------
# Category Routes  (account-scoped)
# ---------------------------------------------------------------------------

@app.post("/accounts/{account_id}/categories", response_model=CategoryOut, status_code=201, tags=["Categories"])
def create_category(
    account_id:   uuid.UUID,
    payload:      CategoryCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    if db.query(Category).filter(
        Category.account_id == account_id,
        Category.name       == payload.name,
    ).first():
        raise HTTPException(status_code=409, detail="Category already exists.")
    cat = Category(
        user_id    = current_user.id,
        account_id = account_id,
        name       = payload.name,
        color      = payload.color,
        is_income  = payload.is_income,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@app.get("/accounts/{account_id}/categories", response_model=List[CategoryOut], tags=["Categories"])
def list_categories(
    account_id:   uuid.UUID,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    return db.query(Category).filter(Category.account_id == account_id).order_by(Category.name).all()


@app.patch("/accounts/{account_id}/categories/{category_id}", response_model=CategoryOut, tags=["Categories"])
def update_category(
    account_id:   uuid.UUID,
    category_id:  uuid.UUID,
    payload:      CategoryUpdate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    cat = db.query(Category).filter(
        Category.id         == category_id,
        Category.account_id == account_id,
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    if payload.name is not None:
        cat.name = payload.name
    if payload.color is not None:
        cat.color = payload.color
    if payload.is_income is not None:
        cat.is_income = payload.is_income
    if payload.investment_value is not None:
        cat.investment_value            = payload.investment_value
        cat.investment_value_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cat)
    return cat


@app.delete("/accounts/{account_id}/categories/{category_id}", status_code=204, tags=["Categories"])
def delete_category(
    account_id:   uuid.UUID,
    category_id:  uuid.UUID,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    cat = db.query(Category).filter(
        Category.id         == category_id,
        Category.account_id == account_id,
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    db.delete(cat)
    db.commit()

# ---------------------------------------------------------------------------
# Investment Totals  (all-time per-category sums, used by the Investment page)
# ---------------------------------------------------------------------------

class InvestmentTotalOut(BaseModel):
    category_id: uuid.UUID
    total:       float   # raw sum of amounts — negative = net expense/invested

@app.get("/accounts/{account_id}/investment-totals", response_model=List[InvestmentTotalOut], tags=["Investments"])
def get_investment_totals(
    account_id:   uuid.UUID,
    category_ids: str,          # comma-separated UUIDs
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Return all-time SUM(amount) per category for the requested category IDs."""
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    try:
        ids = [uuid.UUID(cid.strip()) for cid in category_ids.split(",") if cid.strip()]
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid category_ids format.")

    if not ids:
        return []

    rows = (
        db.query(Transaction.category_id, func.sum(Transaction.amount).label("total"))
        .filter(
            Transaction.account_id  == account_id,
            Transaction.category_id.in_(ids),
        )
        .group_by(Transaction.category_id)
        .all()
    )
    return [{"category_id": r.category_id, "total": float(r.total)} for r in rows]


# ---------------------------------------------------------------------------
# Investment Snapshots  (year-keyed market-value records)
# ---------------------------------------------------------------------------

class InvestmentSnapshotIn(BaseModel):
    category_id: uuid.UUID
    year:        int
    value:       float

class InvestmentSnapshotOut(BaseModel):
    category_id: uuid.UUID
    year:        int
    value:       float
    updated_at:  datetime
    class Config:
        from_attributes = True

class InvestmentYearRow(BaseModel):
    year:               int
    contributed:        float   # raw SUM for that year (may be negative)
    cumulative:         float   # running sum of contributions up to this year
    snapshot_value:     Optional[float]    = None
    snapshot_updated_at: Optional[datetime] = None

class InvestmentCategorySummary(BaseModel):
    category_id: str
    years:       List[InvestmentYearRow]

def _verify_account(account_id: uuid.UUID, current_user: User, db: Session) -> Account:
    account = db.query(Account).filter(
        Account.id == account_id, Account.user_id == current_user.id
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    return account

@app.put("/accounts/{account_id}/investment-snapshots", response_model=InvestmentSnapshotOut, tags=["Investments"])
def upsert_investment_snapshot(
    account_id:   uuid.UUID,
    payload:      InvestmentSnapshotIn,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Create or update the market value snapshot for a category + year."""
    _verify_account(account_id, current_user, db)
    now = datetime.utcnow()
    stmt = (
        pg_insert(InvestmentSnapshot)
        .values(
            id=uuid.uuid4(),
            account_id=account_id,
            category_id=payload.category_id,
            year=payload.year,
            value=payload.value,
            updated_at=now,
        )
        .on_conflict_do_update(
            constraint="uq_investment_snapshot",
            set_={"value": payload.value, "updated_at": now},
        )
        .returning(
            InvestmentSnapshot.category_id,
            InvestmentSnapshot.year,
            InvestmentSnapshot.value,
            InvestmentSnapshot.updated_at,
        )
    )
    row = db.execute(stmt).fetchone()
    db.commit()
    return {"category_id": row.category_id, "year": row.year,
            "value": float(row.value), "updated_at": row.updated_at}


@app.get("/accounts/{account_id}/investment-summary", response_model=List[InvestmentCategorySummary], tags=["Investments"])
def get_investment_summary(
    account_id:   uuid.UUID,
    category_ids: str,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    All-years summary per category: yearly + cumulative contributions, plus any stored snapshot.
    Used by the Investment Tracker page to build the year-over-year table.
    """
    _verify_account(account_id, current_user, db)
    try:
        ids = [uuid.UUID(c.strip()) for c in category_ids.split(",") if c.strip()]
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid category_ids format.")
    if not ids:
        return []

    # Build per-element params — SQLAlchemy 2.0 text() cannot bind Python lists
    # for PostgreSQL ANY(), so we expand to a named IN clause instead.
    id_strs   = [str(i) for i in ids]
    id_params = {f"cid_{i}": v for i, v in enumerate(id_strs)}
    in_clause = ", ".join(f":cid_{i}" for i in range(len(id_strs)))

    # Yearly contributions per category (all time)
    contrib_rows = db.execute(text(f"""
        SELECT category_id,
               EXTRACT(year FROM date)::int AS yr,
               SUM(amount)                  AS total
        FROM   transactions
        WHERE  account_id   = :account_id
          AND  category_id::text IN ({in_clause})
        GROUP  BY category_id, EXTRACT(year FROM date)
        ORDER  BY category_id, yr
    """), {"account_id": str(account_id), **id_params}).fetchall()

    # Stored snapshots
    snap_rows = db.execute(text(f"""
        SELECT category_id, year, value, updated_at
        FROM   investment_snapshots
        WHERE  account_id  = :account_id
          AND  category_id::text IN ({in_clause})
    """), {"account_id": str(account_id), **id_params}).fetchall()

    # Index contributions by (cat_id, year)
    contrib_map: Dict[str, Dict[int, float]] = {}
    for r in contrib_rows:
        contrib_map.setdefault(str(r.category_id), {})[r.yr] = float(r.total)

    # Index snapshots by (cat_id, year)
    snap_map: Dict[str, Dict[int, dict]] = {}
    for r in snap_rows:
        snap_map.setdefault(str(r.category_id), {})[r.year] = {
            "value": float(r.value), "updated_at": r.updated_at
        }

    result = []
    for cat_id in ids:
        key = str(cat_id)
        contrib_years = contrib_map.get(key, {})
        snap_years    = snap_map.get(key, {})
        all_years     = sorted(set(contrib_years) | set(snap_years))
        cumulative    = 0.0
        year_rows     = []
        for yr in all_years:
            # abs() so investment expenses (negative amounts) show as positive contributions
            contributed = abs(contrib_years.get(yr, 0.0))
            cumulative += contributed
            snap        = snap_years.get(yr)
            year_rows.append(InvestmentYearRow(
                year=yr,
                contributed=round(contributed, 2),
                cumulative=round(cumulative, 2),
                snapshot_value=round(snap["value"], 2) if snap else None,
                snapshot_updated_at=snap["updated_at"] if snap else None,
            ))
        result.append(InvestmentCategorySummary(category_id=key, years=year_rows))

    return result


# ---------------------------------------------------------------------------
# Mapping Rule Routes
# ---------------------------------------------------------------------------

@app.post("/accounts/{account_id}/rules", response_model=MappingRuleOut, status_code=201, tags=["Rules"])
def create_rule(
    account_id:   uuid.UUID,
    payload:      MappingRuleCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    cat = db.query(Category).filter(
        Category.id         == payload.category_id,
        Category.account_id == account_id,
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    rule = MappingRule(
        user_id     = current_user.id,
        account_id  = account_id,
        category_id = payload.category_id,
        pattern     = payload.pattern,
        match_type  = payload.match_type,
        priority    = payload.priority,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@app.get("/accounts/{account_id}/rules", response_model=List[MappingRuleOut], tags=["Rules"])
def list_rules(
    account_id:   uuid.UUID,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    return (
        db.query(MappingRule)
        .filter(MappingRule.account_id == account_id)
        .order_by(MappingRule.priority.desc())
        .all()
    )


@app.delete("/accounts/{account_id}/rules/{rule_id}", status_code=204, tags=["Rules"])
def delete_rule(
    account_id:   uuid.UUID,
    rule_id:      uuid.UUID,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    rule = db.query(MappingRule).filter(
        MappingRule.id         == rule_id,
        MappingRule.account_id == account_id,
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found.")
    db.delete(rule)
    db.commit()


@app.patch("/accounts/{account_id}/rules/{rule_id}", response_model=MappingRuleOut, tags=["Rules"])
def update_rule(
    account_id:   uuid.UUID,
    rule_id:      uuid.UUID,
    payload:      MappingRuleUpdate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    rule = db.query(MappingRule).filter(
        MappingRule.id         == rule_id,
        MappingRule.account_id == account_id,
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found.")
    if payload.category_id is not None:
        cat = db.query(Category).filter(
            Category.id         == payload.category_id,
            Category.account_id == account_id,
        ).first()
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found.")
        rule.category_id = payload.category_id
    if payload.pattern is not None:
        rule.pattern = payload.pattern
    if payload.match_type is not None:
        rule.match_type = payload.match_type
    if payload.priority is not None:
        rule.priority = payload.priority
    db.commit()
    db.refresh(rule)
    return rule

# ---------------------------------------------------------------------------
# Transaction Routes
# ---------------------------------------------------------------------------

@app.get("/accounts/{account_id}/transactions", response_model=List[TransactionOut], tags=["Transactions"])
def list_transactions(
    account_id:    uuid.UUID,
    year:          Optional[int]  = None,
    month:         Optional[int]  = None,
    unmapped_only: bool           = False,
    page:          Optional[int]  = None,   # when provided → paginate + set headers
    per_page:      int            = 50,
    response:      Response       = None,
    db:            Session        = Depends(get_db),
    current_user:  User           = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    q = db.query(Transaction).filter(Transaction.account_id == account_id)

    if year:
        q = q.filter(extract("year",  Transaction.date) == year)
    if month:
        q = q.filter(extract("month", Transaction.date) == month)
    if unmapped_only:
        q = q.filter(Transaction.category_id.is_(None))

    q = q.order_by(Transaction.date.desc())

    # Optional server-side pagination — only activated when ?page= is supplied.
    # Callers that omit ?page (e.g. InboxPage) get the full list unchanged.
    if page is not None:
        per_page = max(1, min(per_page, 200))      # clamp to 1-200
        total    = q.count()
        pages    = math.ceil(total / per_page) if per_page else 1
        if response is not None:
            response.headers["X-Total-Count"] = str(total)
            response.headers["X-Total-Pages"] = str(pages)
            response.headers["X-Page"]        = str(page)
            response.headers["X-Per-Page"]    = str(per_page)
        return q.offset((page - 1) * per_page).limit(per_page).all()

    return q.all()


@app.patch(
    "/accounts/{account_id}/transactions/{transaction_id}",
    response_model=TransactionOut,
    tags=["Transactions"],
)
def update_transaction(
    account_id:     uuid.UUID,
    transaction_id: uuid.UUID,
    payload:        TransactionUpdate,
    db:             Session = Depends(get_db),
    current_user:   User    = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    txn = db.query(Transaction).filter(
        Transaction.id         == transaction_id,
        Transaction.account_id == account_id,
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found.")

    recompute = False
    if payload.date is not None:
        txn.date = payload.date
        recompute = True
    if payload.raw_description is not None:
        txn.raw_description = payload.raw_description
        recompute = True
    if payload.amount is not None:
        txn.amount = payload.amount
        recompute = True
    if payload.category_id is not None:
        cat = db.query(Category).filter(
            Category.id         == payload.category_id,
            Category.account_id == account_id,
        ).first()
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found.")
        txn.category_id = payload.category_id
        txn.is_manual = True  # manual assignment protects from remap

    if payload.is_manual is not None:
        txn.is_manual = payload.is_manual

    # Recompute checksum only when date/description/amount changed
    if recompute:
        txn.checksum = compute_checksum(str(txn.date), str(txn.amount), txn.raw_description)

    db.commit()
    db.refresh(txn)
    return txn


@app.delete(
    "/accounts/{account_id}/transactions/{transaction_id}",
    status_code=204,
    tags=["Transactions"],
)
def delete_transaction(
    account_id:     uuid.UUID,
    transaction_id: uuid.UUID,
    db:             Session = Depends(get_db),
    current_user:   User    = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")
    txn = db.query(Transaction).filter(
        Transaction.id         == transaction_id,
        Transaction.account_id == account_id,
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    db.delete(txn)
    db.commit()



# ---------------------------------------------------------------------------
# Yearly Summary (server-side aggregation for ReviewPage pivot + chart)
# ---------------------------------------------------------------------------

@app.get(
    "/accounts/{account_id}/summary",
    tags=["Transactions"],
    summary="Yearly pivot + monthly chart data (aggregated server-side)",
)
def get_yearly_summary(
    account_id:   uuid.UUID,
    year:         int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    Returns two things for a given year:
      - monthly_chart : list of {month, income, expenses} for the recharts line chart
      - pivot         : list of {category_name, category_color, is_income,
                                 monthly_totals, yearly_total} for the pivot table

    A single GROUP BY query replaces fetching thousands of raw transaction rows.
    """
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    # One aggregation query — category × month
    rows = db.execute(text("""
        SELECT
            category_id,
            EXTRACT(month FROM date)::int AS month,
            SUM(amount)                   AS total
        FROM   transactions
        WHERE  account_id = :account_id
          AND  EXTRACT(year FROM date) = :year
        GROUP  BY category_id, EXTRACT(month FROM date)
    """), {"account_id": str(account_id), "year": year}).fetchall()

    # Category lookup
    cats    = db.query(Category).filter(Category.account_id == account_id).all()
    cat_map = {str(c.id): c for c in cats}

    # Build pivot_raw: cat_key → {month → float}
    pivot_raw: Dict[Optional[str], Dict[int, float]] = {}
    for row in rows:
        key = str(row.category_id) if row.category_id else None
        pivot_raw.setdefault(key, {})[row.month] = float(row.total)

    # Monthly chart data (income / expenses per month, all 12 months)
    income_by_month   = {m: 0.0 for m in range(1, 13)}
    expenses_by_month = {m: 0.0 for m in range(1, 13)}
    for months in pivot_raw.values():
        for m, total in months.items():
            if total >= 0:
                income_by_month[m]   += total
            else:
                expenses_by_month[m] += abs(total)

    monthly_chart = [
        {
            "month":    m,
            "income":   round(income_by_month[m],   2),
            "expenses": round(expenses_by_month[m], 2),
        }
        for m in range(1, 13)
    ]

    # Build pivot rows
    pivot_rows = []
    for key, months in pivot_raw.items():
        if key is None:
            cat_name  = "Uncategorized"
            cat_color = "#6b7280"
            is_income = False
        else:
            cat       = cat_map.get(key)
            cat_name  = cat.name      if cat else "Unknown"
            cat_color = cat.color     if cat else "#6b7280"
            is_income = cat.is_income if cat else False

        monthly_totals = {m: round(months.get(m, 0.0), 2) for m in range(1, 13)}
        yearly_total   = round(sum(monthly_totals.values()), 2)

        pivot_rows.append({
            "category_id":    key,
            "category_name":  cat_name,
            "category_color": cat_color,
            "is_income":      is_income,
            "monthly_totals": monthly_totals,
            "yearly_total":   yearly_total,
        })

    # Expenses first, then income; within each group sort by abs total descending
    pivot_rows.sort(key=lambda r: (r["is_income"], -abs(r["yearly_total"])))

    return {"year": year, "monthly_chart": monthly_chart, "pivot": pivot_rows}


# ---------------------------------------------------------------------------
# Import Endpoints
# ---------------------------------------------------------------------------

@app.post(
    "/accounts/{account_id}/import/preview",
    response_model=ImportPreview,
    tags=["Import"],
    summary="Parse a CSV and return headers + sample rows for column mapping",
)
async def preview_import(
    account_id:   uuid.UUID,
    file:         Optional[UploadFile] = File(default=None),
    raw_csv:      Optional[str]        = Form(default=None),
    db:           Session              = Depends(get_db),
    current_user: User                 = Depends(get_current_user),
):
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    if file is not None:
        raw_bytes = await file.read()
        if len(raw_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File too large. Maximum is 20 MB.")
        content = raw_bytes.decode("utf-8-sig")
    elif raw_csv:
        content = raw_csv
    else:
        raise HTTPException(status_code=422, detail="Provide a CSV file or raw_csv.")

    return preview_csv(content)


@app.post(
    "/accounts/{account_id}/import",
    response_model=ImportResult,
    tags=["Import"],
    summary="Import transactions from a CSV file or raw CSV string",
)
async def import_transactions(
    account_id:      uuid.UUID,
    file:            Optional[UploadFile] = File(default=None,  description="CSV file upload"),
    raw_csv:         Optional[str]        = Form(default=None,  description="Raw CSV text"),
    col_date:        Optional[str]        = Form(default=None,  description="Explicit date column name"),
    col_desc:        Optional[str]        = Form(default=None,  description="Explicit description column name"),
    col_amount:      Optional[str]        = Form(default=None,  description="Explicit amount column name"),
    col_extra_desc:  Optional[str]        = Form(default=None,  description="JSON array of extra description columns"),
    db:              Session              = Depends(get_db),
    current_user:    User                 = Depends(get_current_user),
):
    """
    Full import pipeline:
      1. Verify the account belongs to the authenticated user.
      2. Accept either a multipart file upload or a pasted raw CSV string.
      3. Parse the CSV into (date, description, amount) rows.
      4. For every row compute a SHA-256 checksum and skip if it already
         exists for this account (deduplication).
      5. Run the Mapping Engine against the user's rules (highest priority
         first); assign the winning category or leave as NULL.
      6. Persist new transactions and return a summary.
    """
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    if file is not None:
        raw_bytes = await file.read()
        if len(raw_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File too large. Maximum is 20 MB.")
        content = raw_bytes.decode("utf-8-sig")
    elif raw_csv:
        content = raw_csv
    else:
        raise HTTPException(
            status_code=422,
            detail="Provide either a CSV file (multipart) or raw_csv (form field).",
        )

    extra_cols: List[str] = json.loads(col_extra_desc) if col_extra_desc else []
    rows = parse_csv_content(
        content,
        date_col        = col_date   or None,
        desc_col        = col_desc   or None,
        amount_col      = col_amount or None,
        extra_desc_cols = extra_cols,
    )

    rules: List[MappingRule] = (
        db.query(MappingRule)
        .filter(MappingRule.account_id == account_id)
        .order_by(MappingRule.priority.desc())
        .all()
    )

    new_transactions: List[Transaction] = []
    skipped = 0

    for row in rows:
        checksum = compute_checksum(
            str(row["date"]),
            str(row["amount"]),
            row["description"],
        )

        duplicate = (
            db.query(Transaction)
            .filter(
                Transaction.account_id == account_id,
                Transaction.checksum   == checksum,
            )
            .first()
        )
        if duplicate:
            skipped += 1
            continue

        category_id = apply_mapping_rules(row["description"], rules)

        txn = Transaction(
            account_id      = account_id,
            date            = row["date"],
            raw_description = row["description"],
            amount          = row["amount"],
            category_id     = category_id,
            checksum        = checksum,
        )
        db.add(txn)
        new_transactions.append(txn)

    db.commit()
    for txn in new_transactions:
        db.refresh(txn)

    return ImportResult(
        total_rows         = len(rows),
        imported           = len(new_transactions),
        skipped_duplicates = skipped,
        transactions       = new_transactions,
    )

@app.post(
    "/accounts/{account_id}/import/auto",
    response_model=ImportResult,
    status_code=201,
    tags=["Import"],
    summary="Bot-friendly import: send pre-parsed transactions as JSON",
)
def auto_import(
    account_id:   uuid.UUID,
    payload:      AutoImportRequest,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    Single-step JSON import for automated bots (e.g. a PDF-to-transaction converter).

    The caller must provide a list of transactions with:
      - date        (YYYY-MM-DD)
      - description (raw text from bank statement)
      - amount      (positive = credit, negative = debit)

    Deduplication and category mapping rules are applied automatically.
    """
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    rules: List[MappingRule] = (
        db.query(MappingRule)
        .filter(MappingRule.account_id == account_id)
        .order_by(MappingRule.priority.desc())
        .all()
    )

    new_transactions: List[Transaction] = []
    skipped = 0

    for row in payload.transactions:
        checksum = compute_checksum(str(row.date), str(row.amount), row.description)

        if db.query(Transaction).filter(
            Transaction.account_id == account_id,
            Transaction.checksum   == checksum,
        ).first():
            skipped += 1
            continue

        category_id = apply_mapping_rules(row.description, rules)

        txn = Transaction(
            account_id      = account_id,
            date            = row.date,
            raw_description = row.description,
            amount          = row.amount,
            category_id     = category_id,
            checksum        = checksum,
        )
        db.add(txn)
        new_transactions.append(txn)

    db.commit()
    for txn in new_transactions:
        db.refresh(txn)

    return ImportResult(
        total_rows         = len(payload.transactions),
        imported           = len(new_transactions),
        skipped_duplicates = skipped,
        transactions       = new_transactions,
    )


# ---------------------------------------------------------------------------
# Retroactive Re-map  (CONTEXT.md §5 – "Refine / Unmapped Inbox")
# ---------------------------------------------------------------------------

def _do_remap(account_id: uuid.UUID) -> None:
    """
    Background-safe remap worker — creates its own DB session so it can run
    after the HTTP response has already been sent.  Skips is_manual transactions.
    """
    db = SessionLocal()
    try:
        rules: List[MappingRule] = (
            db.query(MappingRule)
            .filter(MappingRule.account_id == account_id)
            .order_by(MappingRule.priority.desc())
            .all()
        )
        txns = (
            db.query(Transaction)
            .filter(
                Transaction.account_id == account_id,
                Transaction.is_manual  == False,  # noqa: E712
            )
            .all()
        )
        for txn in txns:
            new_cat = apply_mapping_rules(txn.raw_description, rules)
            if new_cat != txn.category_id:
                txn.category_id = new_cat
        db.commit()
    finally:
        db.close()


@app.post(
    "/accounts/{account_id}/remap",
    tags=["Import"],
    summary="Re-run the mapping engine on every transaction in an account",
)
def remap_account(
    account_id:       uuid.UUID,
    background_tasks: BackgroundTasks,
    db:               Session = Depends(get_db),
    current_user:     User    = Depends(get_current_user),
):
    """
    Queues a background remap and returns immediately — the response is sent
    before the (potentially expensive) remap completes, so the UI stays snappy
    even on accounts with tens of thousands of transactions.
    """
    account = db.query(Account).filter(
        Account.id      == account_id,
        Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found.")

    background_tasks.add_task(_do_remap, account_id)
    return {"status": "queued"}


# ---------------------------------------------------------------------------
# Data Export / Import  (full backup & restore)
# ---------------------------------------------------------------------------

@app.get("/data/export", tags=["Data"], summary="Download a full JSON backup of all user data")
def export_data(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    Streams a JSON file containing every account, category, transaction, mapping rule,
    and investment snapshot for the authenticated user.
    Category names are used instead of IDs so the file is human-readable and portable.
    """
    accounts = db.query(Account).filter(Account.user_id == current_user.id).all()

    export = {
        "version":     1,
        "exported_at": datetime.utcnow().isoformat(),
        "accounts":    [],
    }

    for acc in accounts:
        cats  = db.query(Category).filter(Category.account_id == acc.id).all()
        cat_id_to_name = {str(c.id): c.name for c in cats}

        rules = db.query(MappingRule).filter(MappingRule.account_id == acc.id).all()
        txns  = db.query(Transaction).filter(Transaction.account_id == acc.id).order_by(Transaction.date).all()
        snaps = db.query(InvestmentSnapshot).filter(InvestmentSnapshot.account_id == acc.id).all()

        export["accounts"].append({
            "name":     acc.name,
            "currency": acc.currency,
            "categories": [
                {
                    "name":                        c.name,
                    "color":                       c.color,
                    "is_income":                   c.is_income,
                    "investment_value":            float(c.investment_value) if c.investment_value is not None else None,
                    "investment_value_updated_at": c.investment_value_updated_at.isoformat() if c.investment_value_updated_at else None,
                }
                for c in cats
            ],
            "rules": [
                {
                    "category_name": cat_id_to_name.get(str(r.category_id), ""),
                    "pattern":       r.pattern,
                    "match_type":    r.match_type.value,
                    "priority":      r.priority,
                }
                for r in rules
            ],
            "transactions": [
                {
                    "date":          t.date.isoformat(),
                    "description":   t.raw_description,
                    "amount":        float(t.amount),
                    "category_name": cat_id_to_name.get(str(t.category_id), "") if t.category_id else "",
                    "is_manual":     t.is_manual,
                }
                for t in txns
            ],
            "investment_snapshots": [
                {
                    "category_name": cat_id_to_name.get(str(s.category_id), ""),
                    "year":          s.year,
                    "value":         float(s.value),
                }
                for s in snaps
            ],
        })

    filename = f"smartbudget-backup-{datetime.utcnow().strftime('%Y-%m-%d')}.json"
    content  = json.dumps(export, indent=2, ensure_ascii=False)
    return StreamingResponse(
        io.StringIO(content),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/data/import", tags=["Data"], summary="Restore / merge data from a JSON backup file")
async def import_data(
    file:         UploadFile  = File(...),
    db:           Session     = Depends(get_db),
    current_user: User        = Depends(get_current_user),
):
    """
    Merges a JSON backup (produced by GET /data/export) into the user's data.
    Merge strategy — nothing is ever deleted or overwritten:
    - Account:     matched by (name, currency); created if missing.
    - Category:    matched by (account_id, name); created if missing.
    - Transaction: deduplicated by checksum (same logic as CSV import).
    - Rule:        skipped if identical (category, pattern, match_type) already exists.
    - Snapshot:    upserted (value updated if year+category already recorded).
    """
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum is 20 MB.")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="Invalid JSON file.")

    if data.get("version") != 1:
        raise HTTPException(status_code=422, detail="Unsupported backup version.")

    stats = {
        "accounts_created":     0,
        "categories_created":   0,
        "transactions_imported": 0,
        "transactions_skipped":  0,
        "rules_created":        0,
        "snapshots_upserted":   0,
    }

    for acc_data in data.get("accounts", []):
        # ── Account ──────────────────────────────────────────────────────────
        acc = db.query(Account).filter(
            Account.user_id  == current_user.id,
            Account.name     == acc_data["name"],
            Account.currency == acc_data["currency"],
        ).first()
        if not acc:
            acc = Account(
                user_id  = current_user.id,
                name     = acc_data["name"],
                currency = acc_data["currency"],
            )
            db.add(acc)
            db.flush()
            stats["accounts_created"] += 1

        # ── Categories ────────────────────────────────────────────────────────
        name_to_cat_id: Dict[str, uuid.UUID] = {}
        for cat_data in acc_data.get("categories", []):
            cat = db.query(Category).filter(
                Category.account_id == acc.id,
                Category.name       == cat_data["name"],
            ).first()
            if not cat:
                cat = Category(
                    user_id    = current_user.id,
                    account_id = acc.id,
                    name       = cat_data["name"],
                    color      = cat_data.get("color", "#6366f1"),
                    is_income  = cat_data.get("is_income", False),
                )
                db.add(cat)
                db.flush()
                stats["categories_created"] += 1
            name_to_cat_id[cat.name] = cat.id

        # ── Mapping rules ─────────────────────────────────────────────────────
        existing_rules = {
            (str(r.category_id), r.pattern, r.match_type.value)
            for r in db.query(MappingRule).filter(MappingRule.account_id == acc.id).all()
        }
        for rule_data in acc_data.get("rules", []):
            cat_id = name_to_cat_id.get(rule_data.get("category_name", ""))
            if not cat_id:
                continue
            key = (str(cat_id), rule_data["pattern"], rule_data["match_type"])
            if key not in existing_rules:
                db.add(MappingRule(
                    user_id     = current_user.id,
                    account_id  = acc.id,
                    category_id = cat_id,
                    pattern     = rule_data["pattern"],
                    match_type  = MatchType(rule_data["match_type"]),
                    priority    = rule_data.get("priority", 0),
                ))
                existing_rules.add(key)
                stats["rules_created"] += 1

        # ── Transactions ──────────────────────────────────────────────────────
        for txn_data in acc_data.get("transactions", []):
            checksum = compute_checksum(
                txn_data["date"], str(txn_data["amount"]), txn_data["description"]
            )
            exists = db.query(Transaction.id).filter(
                Transaction.account_id == acc.id,
                Transaction.checksum   == checksum,
            ).first()
            if exists:
                stats["transactions_skipped"] += 1
                continue
            cat_id = name_to_cat_id.get(txn_data.get("category_name", ""))
            db.add(Transaction(
                account_id      = acc.id,
                date            = date.fromisoformat(txn_data["date"]),
                raw_description = txn_data["description"],
                amount          = Decimal(str(txn_data["amount"])),
                category_id     = cat_id,
                is_manual       = txn_data.get("is_manual", False),
                checksum        = checksum,
            ))
            stats["transactions_imported"] += 1

        # ── Investment snapshots ──────────────────────────────────────────────
        for snap_data in acc_data.get("investment_snapshots", []):
            cat_id = name_to_cat_id.get(snap_data.get("category_name", ""))
            if not cat_id:
                continue
            stmt = (
                pg_insert(InvestmentSnapshot)
                .values(
                    id=uuid.uuid4(),
                    account_id=acc.id,
                    category_id=cat_id,
                    year=snap_data["year"],
                    value=snap_data["value"],
                    updated_at=datetime.utcnow(),
                )
                .on_conflict_do_update(
                    constraint="uq_investment_snapshot",
                    set_={"value": snap_data["value"], "updated_at": datetime.utcnow()},
                )
            )
            db.execute(stmt)
            stats["snapshots_upserted"] += 1

        db.commit()

    return stats
