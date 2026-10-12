"""
Test fixtures.

Tests run against a real PostgreSQL database (the app uses Postgres-only
features such as ON CONFLICT and DO $$ blocks). Point TEST_DATABASE_URL at a
throwaway database — every table is truncated between tests.

    docker run -d --rm --name sb-test-pg -e POSTGRES_USER=t -e POSTGRES_PASSWORD=t \
        -e POSTGRES_DB=t -p 55432:5432 postgres:15-alpine
    TEST_DATABASE_URL=postgresql://t:t@localhost:55432/t pytest backend/tests
"""
import os

import pytest

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql://t:t@localhost:55432/t")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ["SMTP_HOST"] = ""

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.main import app, engine, limiter  # noqa: E402

limiter.enabled = False


@pytest.fixture(autouse=True)
def _clean_db():
    yield
    with engine.begin() as conn:
        conn.execute(text(
            "TRUNCATE api_tokens, investment_snapshots, transactions, mapping_rules, categories, accounts, users CASCADE"
        ))


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth(client):
    """Register + log in a user; return auth headers."""
    client.post("/auth/register", json={"email": "u@example.com", "password": "Password1"})
    r = client.post("/auth/login", data={"username": "u@example.com", "password": "Password1"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def account(client, auth):
    r = client.post("/accounts", json={"name": "Bank", "currency": "EUR"}, headers=auth)
    return r.json()["id"]
