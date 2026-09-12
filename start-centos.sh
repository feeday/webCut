#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-18080}"
PYTHON_BIN="${PYTHON_BIN:-}"

if [[ -z "$PYTHON_BIN" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  else
    echo "[webCut] Python 3 not found."
    echo "CentOS/RHEL example: sudo dnf install -y python3"
    exit 1
  fi
fi

echo "=============================================="
echo "webCut CentOS/Linux server"
echo "=============================================="
echo "Python : $PYTHON_BIN"
echo "Host   : $HOST"
echo "Port   : $PORT"
echo "Folder : $SCRIPT_DIR"
echo

echo "Open in browser: http://<server-ip>:$PORT/"
echo "Media editing/export still runs in the visitor browser."
echo

exec "$PYTHON_BIN" server.py --host "$HOST" --port "$PORT" --no-browser
