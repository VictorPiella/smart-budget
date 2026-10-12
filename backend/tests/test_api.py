import io
import json

import pytest

from app.main import _parse_amount, apply_mapping_rules


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    ("-10.50",       "-10.50"),
    ("-10,50",       "-10.50"),
    ("1,234.56",     "1234.56"),
    ("1.234,56",     "1234.56"),
    ("1.234.567,89", "1234567.89"),
    ("1,234,567.89", "1234567.89"),
    ("1.234.567",    "1234567"),
    ("(12.50)",      "-12.50"),
    ("12.50-",       "-12.50"),
    ("−12,50",  "-12.50"),   # unicode minus
    ("€ -3,00",      "-3.00"),
    ("",             None),
    ("abc",          None),
])
def test_parse_amount(raw, expected):
    result = _parse_amount(raw)
    assert (str(result) if result is not None else None) == expected


def test_mapping_rules_priority_and_case():
    class R:
        def __init__(self, pattern, match_type, category_id):
            from app.models import MatchType
            self.pattern, self.match_type, self.category_id = pattern, MatchType(match_type), category_id
    rules = [R("netflix", "contains", "a"), R("NET", "starts_with", "b")]
    assert apply_mapping_rules("NETFLIX.COM 123", rules) == "a"
    assert apply_mapping_rules("NETWORK", rules) == "b"
    assert apply_mapping_rules("other", rules) is None


# ---------------------------------------------------------------------------
# CSV import
# ---------------------------------------------------------------------------

def _import_csv(client, auth, account, content: bytes, **cols):
    return client.post(
        f"/accounts/{account}/import",
        files={"file": ("x.csv", io.BytesIO(content), "text/csv")},
        data=cols,
        headers=auth,
    )


def test_csv_import_with_duplicate_rows_in_same_file(client, auth, account):
    csv = b"date,description,amount\n2024-01-01,Coffee,-2.50\n2024-01-01,Coffee,-2.50\n"
    r = _import_csv(client, auth, account, csv)
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == 1
    assert r.json()["skipped_duplicates"] == 1


def test_csv_import_reimport_is_idempotent(client, auth, account):
    csv = b"date,description,amount\n2024-01-01,Coffee,-2.50\n2024-01-02,Salary,1000\n"
    assert _import_csv(client, auth, account, csv).json()["imported"] == 2
    r = _import_csv(client, auth, account, csv).json()
    assert r["imported"] == 0 and r["skipped_duplicates"] == 2


def test_csv_import_latin1_file(client, auth, account):
    csv = "fecha;concepto;importe\n01/02/2024;Cafetería Ñandú;-3,20\n".encode("cp1252")
    r = client.post(
        f"/accounts/{account}/import/preview",
        files={"file": ("x.csv", io.BytesIO(csv), "text/csv")},
        headers=auth,
    )
    assert r.status_code == 200, r.text
    r = _import_csv(client, auth, account, csv)
    assert r.status_code == 200, r.text
    assert r.json()["transactions"][0]["raw_description"] == "Cafetería Ñandú"


def test_csv_import_invalid_extra_desc_json(client, auth, account):
    csv = b"date,description,amount\n2024-01-01,Coffee,-2.50\n"
    r = _import_csv(client, auth, account, csv, col_extra_desc="not json")
    assert r.status_code == 422


def test_import_applies_rules(client, auth, account):
    cat = client.post(f"/accounts/{account}/categories", json={"name": "Food"}, headers=auth).json()
    client.post(f"/accounts/{account}/rules",
                json={"category_id": cat["id"], "pattern": "coffee", "match_type": "contains"}, headers=auth)
    csv = b"date,description,amount\n2024-01-01,COFFEE SHOP,-2.50\n"
    r = _import_csv(client, auth, account, csv).json()
    assert r["transactions"][0]["category_id"] == cat["id"]


# ---------------------------------------------------------------------------
# Validation → 4xx instead of 500
# ---------------------------------------------------------------------------

def test_rule_pattern_too_long_is_422(client, auth, account):
    cat = client.post(f"/accounts/{account}/categories", json={"name": "Food"}, headers=auth).json()
    r = client.post(f"/accounts/{account}/rules",
                    json={"category_id": cat["id"], "pattern": "x" * 300, "match_type": "contains"}, headers=auth)
    assert r.status_code == 422


def test_rule_update_priority_out_of_range_is_422(client, auth, account):
    cat = client.post(f"/accounts/{account}/categories", json={"name": "Food"}, headers=auth).json()
    rule = client.post(f"/accounts/{account}/rules",
                       json={"category_id": cat["id"], "pattern": "x", "match_type": "contains"}, headers=auth).json()
    r = client.patch(f"/accounts/{account}/rules/{rule['id']}", json={"priority": 10**12}, headers=auth)
    assert r.status_code == 422


def test_rename_account_to_existing_name_is_409(client, auth, account):
    other = client.post("/accounts", json={"name": "Card", "currency": "EUR"}, headers=auth).json()
    r = client.patch(f"/accounts/{other['id']}", json={"name": "Bank"}, headers=auth)
    assert r.status_code == 409


def test_rename_category_to_existing_name_is_409(client, auth, account):
    client.post(f"/accounts/{account}/categories", json={"name": "Food"}, headers=auth)
    other = client.post(f"/accounts/{account}/categories", json={"name": "Fun"}, headers=auth).json()
    r = client.patch(f"/accounts/{account}/categories/{other['id']}", json={"name": "Food"}, headers=auth)
    assert r.status_code == 409


def test_edit_transaction_into_duplicate_is_409(client, auth, account):
    csv = b"date,description,amount\n2024-01-01,Coffee,-2.50\n2024-01-02,Coffee,-2.50\n"
    txns = _import_csv(client, auth, account, csv).json()["transactions"]
    second = next(t for t in txns if t["date"] == "2024-01-02")
    r = client.patch(f"/accounts/{account}/transactions/{second['id']}", json={"date": "2024-01-01"}, headers=auth)
    assert r.status_code == 409


def test_transactions_page_zero_is_422(client, auth, account):
    r = client.get(f"/accounts/{account}/transactions?page=0", headers=auth)
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------

def test_snapshot_rejects_foreign_category(client, auth, account):
    # Second user with their own category
    client.post("/auth/register", json={"email": "v@example.com", "password": "Password1"})
    tok = client.post("/auth/login", data={"username": "v@example.com", "password": "Password1"}).json()["access_token"]
    other = {"Authorization": f"Bearer {tok}"}
    other_acc = client.post("/accounts", json={"name": "X", "currency": "EUR"}, headers=other).json()["id"]
    foreign_cat = client.post(f"/accounts/{other_acc}/categories", json={"name": "Inv"}, headers=other).json()["id"]

    r = client.put(f"/accounts/{account}/investment-snapshots",
                   json={"category_id": foreign_cat, "year": 2024, "value": 1}, headers=auth)
    assert r.status_code == 404


def test_cannot_read_other_users_account(client, auth, account):
    client.post("/auth/register", json={"email": "v@example.com", "password": "Password1"})
    tok = client.post("/auth/login", data={"username": "v@example.com", "password": "Password1"}).json()["access_token"]
    r = client.get(f"/accounts/{account}/transactions", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 404


def test_register_existing_email_does_not_leak_user_id(client, auth):
    me = client.get("/accounts", headers=auth)  # noqa: F841 — ensure user exists
    r = client.post("/auth/register", json={"email": "u@example.com", "password": "Password1"})
    assert r.status_code == 201
    first = client.post("/auth/register", json={"email": "new@example.com", "password": "Password1"})
    # Responses for existing vs new emails must have the same shape and no real id of the existing user
    assert set(r.json()) == set(first.json())
    login = client.post("/auth/login", data={"username": "u@example.com", "password": "Password1"})
    assert login.status_code == 200


def test_login_unknown_user_is_401(client):
    r = client.post("/auth/login", data={"username": "nobody@example.com", "password": "Password1"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Backup export / import round-trip
# ---------------------------------------------------------------------------

def test_backup_roundtrip_into_same_account_creates_no_duplicates(client, auth, account):
    cat = client.post(f"/accounts/{account}/categories",
                      json={"name": "Transfer", "exclude_from_totals": True}, headers=auth).json()
    client.post(f"/accounts/{account}/rules",
                json={"category_id": cat["id"], "pattern": "coffee", "match_type": "contains"}, headers=auth)
    csv = b"date,description,amount\n2024-01-01,Coffee,-2.50\n2024-01-02,Salary,1000.00\n"
    _import_csv(client, auth, account, csv)

    backup = client.get("/data/export", headers=auth).content
    r = client.post("/data/import", files={"file": ("b.json", io.BytesIO(backup), "application/json")}, headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["transactions_imported"] == 0
    assert r.json()["transactions_skipped"] == 2


def test_backup_restore_into_fresh_user_preserves_flags(client, auth, account):
    client.post(f"/accounts/{account}/categories",
                json={"name": "Transfer", "exclude_from_totals": True}, headers=auth)
    backup = client.get("/data/export", headers=auth).content

    client.post("/auth/register", json={"email": "v@example.com", "password": "Password1"})
    tok = client.post("/auth/login", data={"username": "v@example.com", "password": "Password1"}).json()["access_token"]
    other = {"Authorization": f"Bearer {tok}"}
    r = client.post("/data/import", files={"file": ("b.json", io.BytesIO(backup), "application/json")}, headers=other)
    assert r.status_code == 200, r.text
    acc = client.get("/accounts", headers=other).json()[0]["id"]
    cats = client.get(f"/accounts/{acc}/categories", headers=other).json()
    assert cats[0]["exclude_from_totals"] is True


def test_backup_import_malformed_is_422(client, auth):
    bad = json.dumps({"version": 1, "accounts": [{"name": "A"}]}).encode()
    r = client.post("/data/import", files={"file": ("b.json", io.BytesIO(bad), "application/json")}, headers=auth)
    assert r.status_code == 422
    bad = json.dumps({"version": 1, "accounts": [{"name": "A", "currency": "EUR",
                      "rules": [{"category_name": "x", "pattern": "p", "match_type": "bogus"}]}]}).encode()
    r = client.post("/data/import", files={"file": ("b.json", io.BytesIO(bad), "application/json")}, headers=auth)
    assert r.status_code == 422


def test_delete_me_wrong_password_is_400_not_401(client, auth):
    r = client.request("DELETE", "/auth/me", json={"password": "wrong"}, headers=auth)
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# API tokens (used by the Telegram bot instead of storing passwords)
# ---------------------------------------------------------------------------

def test_api_token_lifecycle(client, auth, account):
    r = client.post("/auth/api-tokens", json={"name": "telegram-bot"}, headers=auth)
    assert r.status_code == 201
    token, token_id = r.json()["token"], r.json()["id"]
    assert token.startswith("sb_")
    bot = {"Authorization": f"Bearer {token}"}

    assert client.get("/accounts", headers=bot).json()[0]["id"] == account
    r = client.post(f"/accounts/{account}/import/auto",
                    json={"transactions": [{"date": "2024-01-01", "description": "X", "amount": -1}]}, headers=bot)
    assert r.status_code == 201

    listed = client.get("/auth/api-tokens", headers=auth).json()
    assert [t["id"] for t in listed] == [token_id] and "token" not in listed[0]

    assert client.delete(f"/auth/api-tokens/{token_id}", headers=bot).status_code == 204
    assert client.get("/accounts", headers=bot).status_code == 401


def test_api_token_cannot_be_revoked_by_other_user(client, auth):
    token_id = client.post("/auth/api-tokens", json={"name": "a"}, headers=auth).json()["id"]
    client.post("/auth/register", json={"email": "v@example.com", "password": "Password1"})
    tok = client.post("/auth/login", data={"username": "v@example.com", "password": "Password1"}).json()["access_token"]
    r = client.delete(f"/auth/api-tokens/{token_id}", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 404


def test_bogus_api_token_is_401(client):
    assert client.get("/accounts", headers={"Authorization": "Bearer sb_nope"}).status_code == 401


def test_investment_flag_persists_and_survives_backup(client, auth, account):
    cat = client.post(f"/accounts/{account}/categories", json={"name": "ETF"}, headers=auth).json()
    assert cat["is_investment"] is False
    r = client.patch(f"/accounts/{account}/categories/{cat['id']}", json={"is_investment": True}, headers=auth)
    assert r.json()["is_investment"] is True
    assert client.get(f"/accounts/{account}/categories", headers=auth).json()[0]["is_investment"] is True

    backup = client.get("/data/export", headers=auth).content
    client.post("/auth/register", json={"email": "v@example.com", "password": "Password1"})
    tok = client.post("/auth/login", data={"username": "v@example.com", "password": "Password1"}).json()["access_token"]
    other = {"Authorization": f"Bearer {tok}"}
    client.post("/data/import", files={"file": ("b.json", io.BytesIO(backup), "application/json")}, headers=other)
    acc = client.get("/accounts", headers=other).json()[0]["id"]
    assert client.get(f"/accounts/{acc}/categories", headers=other).json()[0]["is_investment"] is True
