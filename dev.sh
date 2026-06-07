#!/usr/bin/env bash
# Local dev setup: starts wrangler + frontend, auths, opens presenter view.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/lib/dev-vars.sh
source "$SCRIPT_DIR/scripts/lib/dev-vars.sh"

EMAIL="${1:-}"
if [ -z "$EMAIL" ]; then
  read -rp "Enter your email address: " EMAIL
fi
[ -z "$EMAIL" ] && { echo "Error: email cannot be empty." >&2; exit 1; }
ALLOWED_DOMAINS="$(read_dev_var ALLOWED_EMAIL_DOMAINS)"
if [ -z "$ALLOWED_DOMAINS" ]; then
  echo "Error: ALLOWED_EMAIL_DOMAINS not set. Add it to server/.dev.vars (see server/.dev.vars.example)." >&2
  exit 1
fi
if ! validate_email_domain "$EMAIL" "$ALLOWED_DOMAINS"; then
  echo "Error: email must use an allowed domain ($ALLOWED_DOMAINS)." >&2
  exit 1
fi

WORKER_URL="http://localhost:8787"

# ── Install deps ──────────────────────────────────────────────────────────────
if ! command -v pnpm > /dev/null 2>&1; then
  echo "Installing pnpm..."
  npm install -g pnpm
fi
pnpm install

# ── Start wrangler ────────────────────────────────────────────────────────────
echo "Starting wrangler dev server..."
pnpm --filter server dev > /tmp/wrangler-dev.log 2>&1 &
WRANGLER_PID=$!
trap 'kill $WRANGLER_PID 2>/dev/null; kill $VITE_PID 2>/dev/null' EXIT

# Wait for wrangler to be ready
for i in $(seq 1 30); do
  sleep 1
  if curl -sf "$WORKER_URL/" > /dev/null 2>&1; then
    echo "✓ Wrangler ready on $WORKER_URL"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "✗ Wrangler failed to start. Log:" >&2
    cat /tmp/wrangler-dev.log >&2
    exit 1
  fi
done

# ── Auth ──────────────────────────────────────────────────────────────────────
echo ""
RESPONSE=$(curl -sf -X POST "$WORKER_URL/auth/request" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}")

DEVICE_CODE=$(printf '%s' "$RESPONSE" | grep -o '"device_code":"[^"]*"' | sed 's/"device_code":"//;s/"//')

MAGIC_LINK=$(printf '%s' "$RESPONSE" | grep -o '"magic_link":"[^"]*"' | sed 's/"magic_link":"//;s/"//' || true)
if [ -n "$MAGIC_LINK" ]; then
  echo "🔗 Open this link to authenticate:"
  echo "   $MAGIC_LINK"
  echo ""
  # Try to open automatically
  command -v open > /dev/null 2>&1 && open "$MAGIC_LINK" || true
else
  echo "📩 Check your email and click the magic link."
  echo ""
fi

echo -n "Waiting for authentication"
TOKEN=""
while true; do
  sleep 2
  POLL=$(curl -sf "$WORKER_URL/auth/poll?code=$DEVICE_CODE" || printf '{"status":"error"}')
  if printf '%s' "$POLL" | grep -q '"approved"'; then
    TOKEN=$(printf '%s' "$POLL" | grep -o '"agentToken":"[^"]*"' | sed 's/"agentToken":"//;s/"//')
    echo ""
    echo "✅ Authenticated!"
    break
  elif printf '%s' "$POLL" | grep -qE '"expired"|"error"'; then
    echo ""
    echo "✗ Authentication expired. Re-run this script." >&2
    exit 1
  else
    printf "."
  fi
done

# Write token to frontend .env so it auto-loads on next start too
printf 'VITE_SERVER_URL=%s\nVITE_WS_URL=%s\nVITE_AGENT_TOKEN=%s\n' \
  "$WORKER_URL" \
  "$(printf '%s' "$WORKER_URL" | sed 's|^https://|wss://|;s|^http://|ws://|')" \
  "$TOKEN" > frontend/.env

# Also write to starter .env so the game still works
GAME_URL="$(printf '%s' "$WORKER_URL" | sed 's|^https://|wss://|;s|^http://|ws://|')/ws"
printf 'VITE_GAME_URL=%s\nVITE_AGENT_TOKEN=%s\n' "$GAME_URL" "$TOKEN" > examples/starter/.env

# ── Start frontend ────────────────────────────────────────────────────────────
echo "Starting presentation frontend..."
pnpm --filter frontend dev > /tmp/vite-dev.log 2>&1 &
VITE_PID=$!

for i in $(seq 1 20); do
  sleep 1
  if curl -sf "http://localhost:5174/" > /dev/null 2>&1; then
    break
  fi
done

PRESENTER_URL="http://localhost:5174/?token=$(printf '%s' "$TOKEN" | sed 's/+/%2B/g')"
echo ""
echo "🎤 Presenter URL:"
echo "   $PRESENTER_URL"
echo ""
command -v open > /dev/null 2>&1 && open "$PRESENTER_URL" || true

echo "Servers running. Press Ctrl+C to stop."
wait
