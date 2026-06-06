#!/usr/bin/env bash
set -euo pipefail

WORKER_URL="${WORKER_URL:-https://workshop-game.YOUR-SUBDOMAIN.workers.dev}"
ENV_FILE="examples/starter/.env"

# 1. Get email (positional arg or interactive prompt)
EMAIL="${1:-}"
if [ -z "$EMAIL" ]; then
  read -rp "Enter your email address: " EMAIL
fi
[ -z "$EMAIL" ] && { echo "Error: email cannot be empty." >&2; exit 1; }
printf '%s' "$EMAIL" | grep -qE '@(drugbank\.com|twosmiles\.ca)$' \
  || { echo "Error: email must end in @drugbank.com or @twosmiles.ca." >&2; exit 1; }

# 2. Request magic link
RESPONSE=$(curl -sf -X POST "$WORKER_URL/auth/request" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}")

DEVICE_CODE=$(printf '%s' "$RESPONSE" | grep -o '"device_code":"[^"]*"' | sed 's/"device_code":"//;s/"//')
[ -z "$DEVICE_CODE" ] && { echo "Error: no device_code in server response." >&2; exit 1; }

MAGIC_LINK=$(printf '%s' "$RESPONSE" | grep -o '"magic_link":"[^"]*"' | sed 's/"magic_link":"//;s/"//' || true)
if [ -n "$MAGIC_LINK" ]; then
  echo ""
  echo "🔗 [LOCAL DEV] Open this link to authenticate:"
  echo "   $MAGIC_LINK"
else
  echo "📩 Magic link dispatched. Check your email inbox and click the link to authorize your machine."
fi

# 3. Poll until approved or expired
while true; do
  sleep 3
  POLL=$(curl -sf "$WORKER_URL/auth/poll?code=$DEVICE_CODE" || printf '{"status":"error"}')
  if printf '%s' "$POLL" | grep -q '"approved"'; then
    TOKEN=$(printf '%s' "$POLL" | grep -o '"agentToken":"[^"]*"' | sed 's/"agentToken":"//;s/"//')
    printf '\nVITE_AGENT_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
    echo "✅ Authenticated! Token written to $ENV_FILE"
    break
  elif printf '%s' "$POLL" | grep -qE '"expired"|"error"'; then
    echo ""
    echo "❌ Authentication expired or failed. Run ./setup.sh again." >&2
    exit 1
  else
    printf "."
  fi
done

# 4. Launch starter app (skipped when DRY_RUN=1, e.g. during automated tests)
if [ "${DRY_RUN:-0}" = "1" ]; then exit 0; fi
cd examples/starter
npm install
npm start
