#!/bin/bash
set -e

echo "[uvicorn] Waiting for PostgreSQL..."
until pg_isready -h 127.0.0.1 -p 5432 -q 2>/dev/null; do
    sleep 1
done
echo "[uvicorn] PostgreSQL ready — starting uvicorn."

exec uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
