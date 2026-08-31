#!/bin/sh
# Ensure uvicorn listens on Cloud Run's PORT (default 8080)
export PORT=${PORT:-8080}
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
