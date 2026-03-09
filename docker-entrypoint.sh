#!/bin/bash
set -e

PGDATA=/var/lib/postgresql/data
PG_BIN=/usr/lib/postgresql/15/bin
PG_USER=${POSTGRES_USER:-budget_user}
PG_PASS=${POSTGRES_PASSWORD:-budget_password}
PG_DB=${POSTGRES_DB:-budget_db}

# ── Initialize postgres on first start ────────────────────────────────────────
if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "[entrypoint] First start — initializing PostgreSQL..."
    mkdir -p "$PGDATA"
    chown postgres:postgres "$PGDATA"

    # Create cluster (local socket = trust, TCP = md5)
    su -s /bin/sh postgres -c "$PG_BIN/initdb -D $PGDATA --auth-local=trust --auth-host=md5"

    # Start postgres temporarily (socket only) for user/db setup
    su -s /bin/sh postgres -c "$PG_BIN/pg_ctl -D $PGDATA start -w -o '-c listen_addresses='"

    # Create app user and database
    su -s /bin/sh postgres -c "psql -c \"CREATE USER \\\"$PG_USER\\\" WITH PASSWORD '$PG_PASS';\""
    su -s /bin/sh postgres -c "psql -c \"CREATE DATABASE \\\"$PG_DB\\\" OWNER \\\"$PG_USER\\\";\""

    # Stop — supervisord will take over
    su -s /bin/sh postgres -c "$PG_BIN/pg_ctl -D $PGDATA stop -w -m fast"
    echo "[entrypoint] PostgreSQL initialized."
fi

exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/supervisord.conf
