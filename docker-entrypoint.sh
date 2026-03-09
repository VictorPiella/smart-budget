#!/bin/bash
set -e

# ── Detect postgres binary path ───────────────────────────────────────────────
PG_VERSION=$(cat /etc/pg_version)
PG_BIN=/usr/lib/postgresql/$PG_VERSION/bin
echo "[entrypoint] PostgreSQL $PG_VERSION — binaries: $PG_BIN"

# Patch supervisord.conf with actual postgres binary path
sed -i "s|PG_BIN_PLACEHOLDER|$PG_BIN|g" /etc/supervisor/conf.d/supervisord.conf

# ── Config ────────────────────────────────────────────────────────────────────
PGDATA=/var/lib/postgresql/data
PG_USER=${POSTGRES_USER:-budget_user}
PG_PASS=${POSTGRES_PASSWORD:-budget_password}
PG_DB=${POSTGRES_DB:-budget_db}

# ── Initialize cluster if fresh ───────────────────────────────────────────────
if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "[entrypoint] Fresh data directory — initializing PostgreSQL cluster..."
    mkdir -p "$PGDATA"
    chown postgres:postgres "$PGDATA"
    su -s /bin/sh postgres -c "$PG_BIN/initdb -D $PGDATA --auth-local=trust --auth-host=md5"
    echo "[entrypoint] Cluster initialized."
fi

# ── Ensure user/db exist (runs every start — idempotent) ─────────────────────
echo "[entrypoint] Ensuring user '$PG_USER' and database '$PG_DB' exist..."
su -s /bin/sh postgres -c "$PG_BIN/pg_ctl -D $PGDATA start -w -o '-c listen_addresses='"

# Create or update user
su -s /bin/sh postgres -c "psql -c \"CREATE USER \\\"$PG_USER\\\" WITH PASSWORD '$PG_PASS';\" 2>/dev/null \
    || psql -c \"ALTER USER \\\"$PG_USER\\\" WITH PASSWORD '$PG_PASS';\""

# Create database if missing
su -s /bin/sh postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='$PG_DB'\" \
    | grep -q 1 || psql -c \"CREATE DATABASE \\\"$PG_DB\\\" OWNER \\\"$PG_USER\\\";\""

su -s /bin/sh postgres -c "$PG_BIN/pg_ctl -D $PGDATA stop -w -m fast"
echo "[entrypoint] Setup complete — handing off to supervisord."

exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/supervisord.conf
