#!/bin/bash
# Wrapper script called by supervisord.
# If BOT_TOKEN is not set, exit cleanly (supervisord won't restart on exit code 0).
if [ -z "${BOT_TOKEN}" ]; then
    echo "[telegram-bot] BOT_TOKEN not set — bot disabled."
    exit 0
fi

exec python /telegram-bot/bot.py
