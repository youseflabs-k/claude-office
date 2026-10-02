#!/usr/bin/env bash
# Fire-and-forget notifier for Claude Office.
#
# This runs inside Claude's hook path. It must never fail visibly and must
# never block, even when the panel server is stopped. Every exit is 0.
#
# Hooks are children of Claude Code, not of the panel server, so the port
# cannot arrive by environment. It is read from the endpoint file the server
# writes on listen and removes on exit.
set +e

ENDPOINT="${CLAUDE_OFFICE_ENDPOINT:-$HOME/.claude/panel/endpoint.json}"
EVENT="${1:-unknown}"

[ -r "$ENDPOINT" ] || exit 0

PORT=$(sed -n 's/.*"port"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$ENDPOINT" | head -1)
[ -n "$PORT" ] || exit 0

PAYLOAD=$(cat 2>/dev/null)

curl --silent --max-time 0.5 --connect-timeout 0.2 \
  -X POST "http://127.0.0.1:${PORT}/api/hook" \
  -H 'Content-Type: application/json' \
  --data "{\"event\":\"${EVENT}\",\"payload\":${PAYLOAD:-null}}" \
  >/dev/null 2>&1

exit 0
