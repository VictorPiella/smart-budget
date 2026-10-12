#!/bin/bash
set -euo pipefail

# ── Detect postgres binary path ───────────────────────────────────────────────
PG_VERSION=$(cat /etc/pg_version)
PG_BIN=/usr/lib/postgresql/$PG_VERSION/bin
echo "[entrypoint] PostgreSQL $PG_VERSION — binaries: $PG_BIN"

# Patch supervisord.conf with actual postgres binary path
sed -i "s|PG_BIN_PLACEHOLDER|$PG_BIN|g" /etc/supervisor/conf.d/supervisord.conf

# ── Config ────────────────────────────────────────────────────────────────────
PGDATA=/var/lib/postgresql/data
PG_USER=${POSTGRES_USER:-budget_user}
PG_DB=${POSTGRES_DB:-budget_db}
PW_FILE="$PGDATA/.smartbudget_db_password"

# ── Initialize cluster if fresh ───────────────────────────────────────────────
if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "[entrypoint] Fresh data directory — initializing PostgreSQL cluster..."
    mkdir -p "$PGDATA"
    chown postgres:postgres "$PGDATA"
    runuser -u postgres -- "$PG_BIN/initdb" -D "$PGDATA" \
        --auth-local=peer --auth-host=scram-sha-256
    echo "[entrypoint] Cluster initialized."
fi

# ── DB password ───────────────────────────────────────────────────────────────
# Without POSTGRES_PASSWORD, generate one once and keep it in the data volume so
# it survives redeploys. Child processes (uvicorn, backup) inherit the export.
if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    if [ ! -s "$PW_FILE" ]; then
        echo "[entrypoint] POSTGRES_PASSWORD not set — generating one (stored in the data volume)."
        python3 -c "import secrets; print(secrets.token_urlsafe(32))" > "$PW_FILE"
        chmod 600 "$PW_FILE"
    fi
    POSTGRES_PASSWORD=$(cat "$PW_FILE")
fi
export POSTGRES_USER="$PG_USER" POSTGRES_DB="$PG_DB" POSTGRES_PASSWORD

# ── pg_hba.conf: password auth everywhere except the postgres superuser over
# the local socket (peer = must be the OS user "postgres"). Rewritten on every
# start so containers created by older images (which used `trust`) are fixed.
cat > "$PGDATA/pg_hba.conf" <<'HBA'
# TYPE  DATABASE  USER      ADDRESS         METHOD
local   all       postgres                  peer
local   all       all                       scram-sha-256
host    all       all       127.0.0.1/32    scram-sha-256
host    all       all       ::1/128         scram-sha-256
HBA
chown postgres:postgres "$PGDATA/pg_hba.conf"
chmod 600 "$PGDATA/pg_hba.conf"

# ── Ensure user/db exist and the password is current (idempotent) ─────────────
echo "[entrypoint] Ensuring user '$PG_USER' and database '$PG_DB' exist..."
runuser -u postgres -- "$PG_BIN/pg_ctl" -D "$PGDATA" start -w -o "-c listen_addresses=''"

# psql variables (:'x' / :"x") quote values safely — no SQL injection via env.
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -q \
    -v u="$PG_USER" -v pw="$POSTGRES_PASSWORD" -v db="$PG_DB" <<'SQL'
SET password_encryption = 'scram-sha-256';
SELECT format('CREATE ROLE %I LOGIN', :'u')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'u') \gexec
ALTER ROLE :"u" WITH LOGIN PASSWORD :'pw';
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'u')
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') \gexec
SQL

runuser -u postgres -- "$PG_BIN/pg_ctl" -D "$PGDATA" stop -w -m fast

# ── Volume ownership (volumes created by older images are root-owned) ─────────
mkdir -p /uploads /home/app/.cache /var/backups/smartbudget /var/www/certbot
chown -R app:app /uploads /home/app/.cache
chmod 700 /uploads
chown postgres:postgres /var/backups/smartbudget
chmod 700 /var/backups/smartbudget

# ── nginx: HTTPS when a certificate for $DOMAIN is mounted, else HTTP only ────
DOMAIN=${DOMAIN:-}
if [ -n "$DOMAIN" ] && ! [[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "[entrypoint] ERROR: invalid DOMAIN '$DOMAIN'" >&2
    exit 1
fi
if [ -n "$DOMAIN" ] && [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "[entrypoint] TLS certificate found for $DOMAIN — enabling HTTPS."
    sed "s/__DOMAIN__/$DOMAIN/g" /etc/nginx/smartbudget-tls.conf.template > /etc/nginx/sites-available/default
else
    [ -n "$DOMAIN" ] && echo "[entrypoint] WARNING: DOMAIN=$DOMAIN but no certificate in /etc/letsencrypt/live/$DOMAIN — serving HTTP only. Run setup-https.sh."
    cp /etc/nginx/smartbudget-http.conf /etc/nginx/sites-available/default
fi
ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
nginx -t

echo "[entrypoint] Setup complete — handing off to supervisord."
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/supervisord.conf
