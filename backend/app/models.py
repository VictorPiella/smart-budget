import hashlib
import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum as PyEnum

from sqlalchemy import (
    Column, String, Numeric, Date, DateTime, ForeignKey,
    Enum, Text, Integer, UniqueConstraint, Boolean
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def compute_checksum(date: str, amount: str, description: str) -> str:
    """
    SHA-256 hash of the canonical date|amount|description triple.
    Normalised to lowercase + stripped so formatting differences don't
    create false duplicates on re-import.
    """
    normalised = f"{str(date).strip()}|{str(amount).strip()}|{description.strip().lower()}"
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class MatchType(PyEnum):
    exact       = "exact"
    starts_with = "starts_with"
    contains    = "contains"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email         = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at    = Column(DateTime, nullable=False, default=datetime.utcnow)

    accounts      = relationship("Account",     back_populates="user", cascade="all, delete-orphan")
    categories    = relationship("Category",    back_populates="user", cascade="all, delete-orphan")
    mapping_rules = relationship("MappingRule", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email}>"


class Account(Base):
    __tablename__ = "accounts"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name       = Column(String(100), nullable=False)
    currency   = Column(String(3),   nullable=False, default="USD")
    balance    = Column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user         = relationship("User",        back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account", cascade="all, delete-orphan")
    rules        = relationship("MappingRule", back_populates="account", cascade="all, delete-orphan")
    categories   = relationship("Category",   back_populates="account", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_account_name"),
    )

    def __repr__(self) -> str:
        return f"<Account id={self.id} name={self.name} currency={self.currency}>"


class Category(Base):
    __tablename__ = "categories"

    id                          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id                     = Column(UUID(as_uuid=True), ForeignKey("users.id",    ondelete="CASCADE"), nullable=False, index=True)
    account_id                  = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=True,  index=True)
    name                        = Column(String(100), nullable=False)
    color                       = Column(String(7),   nullable=False, default="#6366f1")
    is_income                   = Column(Boolean,     nullable=False, default=False)
    investment_value            = Column(Numeric(14, 2), nullable=True,  default=None)
    investment_value_updated_at = Column(DateTime,       nullable=True,  default=None)
    created_at                  = Column(DateTime,    nullable=False, default=datetime.utcnow)

    user          = relationship("User",        back_populates="categories")
    account       = relationship("Account",     back_populates="categories")
    transactions  = relationship("Transaction", back_populates="category")
    mapping_rules = relationship("MappingRule", back_populates="category", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("account_id", "name", name="uq_account_category_name"),
    )

    def __repr__(self) -> str:
        return f"<Category id={self.id} name={self.name}>"


class Transaction(Base):
    __tablename__ = "transactions"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id      = Column(UUID(as_uuid=True), ForeignKey("accounts.id",   ondelete="CASCADE"),  nullable=False, index=True)
    category_id     = Column(UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True,  index=True)
    date            = Column(Date,           nullable=False, index=True)
    raw_description = Column(Text,           nullable=False)
    amount          = Column(Numeric(14, 2), nullable=False)
    checksum        = Column(String(64),     nullable=False, index=True)
    is_manual       = Column(Boolean,        nullable=False, default=False)
    created_at      = Column(DateTime,       nullable=False, default=datetime.utcnow)

    account  = relationship("Account",  back_populates="transactions")
    category = relationship("Category", back_populates="transactions")

    __table_args__ = (
        UniqueConstraint("account_id", "checksum", name="uq_account_transaction_checksum"),
    )

    def __repr__(self) -> str:
        return f"<Transaction id={self.id} date={self.date} amount={self.amount}>"


class MappingRule(Base):
    """
    User-owned rules that map raw bank descriptions to categories.
    Applied in descending priority order; first match wins.
    Rules are scoped to an account.
    """
    __tablename__ = "mapping_rules"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id     = Column(UUID(as_uuid=True), ForeignKey("users.id",      ondelete="CASCADE"), nullable=False, index=True)
    account_id  = Column(UUID(as_uuid=True), ForeignKey("accounts.id",   ondelete="CASCADE"), nullable=True,  index=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    pattern     = Column(String(255), nullable=False)
    match_type  = Column(Enum(MatchType), nullable=False)
    priority    = Column(Integer, nullable=False, default=0, index=True)
    created_at  = Column(DateTime, nullable=False, default=datetime.utcnow)

    user     = relationship("User",     back_populates="mapping_rules")
    account  = relationship("Account",  back_populates="rules")
    category = relationship("Category", back_populates="mapping_rules")

    def __repr__(self) -> str:
        return f"<MappingRule id={self.id} type={self.match_type.value} pattern={self.pattern!r}>"


class InvestmentSnapshot(Base):
    """
    Stores the user-reported market value of an investment category for a given year.
    One row per (account, category, year) — upserted whenever the user updates the value.
    """
    __tablename__ = "investment_snapshots"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id  = Column(UUID(as_uuid=True), ForeignKey("accounts.id",   ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True)
    year        = Column(Integer,            nullable=False)
    value       = Column(Numeric(14, 2),     nullable=False)
    updated_at  = Column(DateTime,           nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("account_id", "category_id", "year", name="uq_investment_snapshot"),
    )

    def __repr__(self) -> str:
        return f"<InvestmentSnapshot cat={self.category_id} year={self.year} value={self.value}>"
