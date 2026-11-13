#!/bin/sh
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "Run setup first: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python download.py"
  exit 1
fi
if [ -f .secret ]; then
  export TIJAR_TRANSLATE_SECRET="$(cat .secret)"
fi
export TIJAR_TRANSLATE_HOST="${TIJAR_TRANSLATE_HOST:-127.0.0.1}"
export TIJAR_TRANSLATE_PORT="${TIJAR_TRANSLATE_PORT:-8787}"
export PYTHONUNBUFFERED=1
export TRANSFORMERS_OFFLINE=1
export HF_HUB_OFFLINE=1
exec .venv/bin/python server.py
