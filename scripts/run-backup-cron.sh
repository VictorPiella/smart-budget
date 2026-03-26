#!/usr/bin/env bash
# run-backup-cron.sh — sleeps until 02:00 UTC, runs backup.sh, repeats daily.
# Started by supervisord at container boot (priority=50, after postgres).

set -euo pipefail

echo "[backup-cron] Cron loop started. Will run backup daily at 02:00 UTC."

while true; do
    # Seconds until next 02:00 UTC
    NOW=$(date -u +%s)
    NEXT_RUN=$(date -u -d "tomorrow 02:00" +%s 2>/dev/null \
        || python3 -c "
import time, datetime
now = datetime.datetime.utcnow()
nxt = now.replace(hour=2, minute=0, second=0, microsecond=0)
if nxt <= now:
    nxt += datetime.timedelta(days=1)
print(int(nxt.timestamp()))
")
    SLEEP_SEC=$(( NEXT_RUN - NOW ))
    echo "[backup-cron] Next backup in ${SLEEP_SEC}s ($(date -u -d "@${NEXT_RUN}" 2>/dev/null || date -u -r "${NEXT_RUN}" 2>/dev/null || echo '02:00 UTC'))."
    sleep "${SLEEP_SEC}"
    /scripts/backup.sh || echo "[backup-cron] WARNING: backup.sh exited non-zero"
done
