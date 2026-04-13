#!/usr/bin/env bash
# backup.sh — nightly PostgreSQL backup inside the SmartBudget container
#
# Keeps the last 7 daily backups locally. If S3_BACKUP_BUCKET is set, also
# uploads to S3 (30-day retention managed by an S3 Lifecycle rule).
# Run automatically via supervisord (see supervisord.conf [program:backup-cron]).
# Can also be triggered manually inside the container:
#   docker exec budget_app /scripts/backup.sh

set -euo pipefail

BACKUP_DIR=/var/backups/smartbudget
KEEP_DAYS=7
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
FILENAME="smartbudget-${TIMESTAMP}.sql.gz"

# DB connection from env (injected by docker-compose / docker-entrypoint)
DB_NAME="${POSTGRES_DB:-budget_db}"
DB_USER="${POSTGRES_USER:-user}"

mkdir -p "${BACKUP_DIR}"

echo "[backup] Starting backup → ${BACKUP_DIR}/${FILENAME}"
PGPASSWORD="${POSTGRES_PASSWORD:-password}" \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" \
  | gzip > "${BACKUP_DIR}/${FILENAME}"

echo "[backup] Done. Size: $(du -sh "${BACKUP_DIR}/${FILENAME}" | cut -f1)"

# Upload to S3 if configured
if [ -n "${S3_BACKUP_BUCKET:-}" ]; then
  echo "[backup] Uploading to s3://${S3_BACKUP_BUCKET}/backups/${FILENAME}"
  aws s3 cp "${BACKUP_DIR}/${FILENAME}" "s3://${S3_BACKUP_BUCKET}/backups/${FILENAME}"
  echo "[backup] S3 upload complete."
fi

# Remove local backups older than KEEP_DAYS days
find "${BACKUP_DIR}" -name "smartbudget-*.sql.gz" \
  -mtime "+${KEEP_DAYS}" -delete

echo "[backup] Cleanup done. Retained files:"
ls -lh "${BACKUP_DIR}"/smartbudget-*.sql.gz 2>/dev/null || echo "  (none)"
