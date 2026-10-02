#!/usr/bin/env bash
# Start the Claude Office panel.
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null; then
  echo "Node is required but was not found on PATH." >&2
  exit 1
fi

MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 20 ]; then
  echo "Node 20 or newer is required (found $(node -v))." >&2
  exit 1
fi

exec node server/start.js
