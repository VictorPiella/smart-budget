#!/bin/bash
set -e

# ── Detect postgres binary path ───────────────────────────────────────────────
PG_VERSION=$(cat /etc/pg_version)
PG_BIN=/usr/lib/postgresql/$PG_VERSION/bin
echo "[entrypoint] PostgreSQL version: $PG_VERSION  binaries: $PG_BIN"

# Patch supervisord.conf with the real postgres binary path
sed -i "s|PG_BIN_PLACEHOLDER|$PG_BIN|g" /etc/supervisor/conf.d/supervisord.conf

# ── Config ────────────────────────────────────────────────────────────────────
PGDATA=/var/lib/postgresql/data
PG_USER=${POSTGRES_USER:-budget_user}
PG_PASS=${POSTGRES_PASSWORD:-budget_password}
PG_DB=${POSTGRES_DB:-budget_db}

# ── Initialize postgres on first start (empty volume) ─────────────────────────
if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "[entrypoint] First start — initializing PostgreSQL data directory..."
    mkdir -p "$PGDATA"
    chown postgres:postgres "$PGDATA"

    # Create cluster with trust for local socket, md5 for TCP
    su -s /bin/sh postgres -c "$PG_BIN/initdb -D $PGDATA --auth-local=trust --auth-host=md5"

    # Start postgres temporarily via socket only (no TCP yet) for user/db setup
    su -s /bin/sh postgres -c "$PG_BIN/pg_ctl -D $PGDATA start -w -o '-c listen_addresses='"

    echo "[entrypoint] Creating user '$PG_USER' and database '$PG_DB'..."
    su -s /bin/sh postgres -c "psql -c \"CREATE USER \\\"$PG_USER\\\" WITH PASSWORD '$PG_PASS';\""
    su -s /bin/sh postgres -c "psql -c \"CREATE DATABASE \\\"$PG_DB\\\" OWNER \\\"$PG_USER\\\";\""

    # Stop — supervisord will manage postgres from here
    su -s /bin/sh postgres -c "$PG_BIN/pg_ctl -D $PGDATA stop -w -m fast"
    echo "[entrypoint] PostgreSQL initialized successfully."
else
    echo "[entrypoint] Existing data directory found — skipping init."
fi

exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/supervisord.conf
