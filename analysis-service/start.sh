#!/bin/sh
set -e
export PORT=${PORT:-8080}
echo "Starting uvicorn on 0.0.0.0:${PORT}"
python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
