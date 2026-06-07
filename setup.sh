#!/usr/bin/env bash
# Usage: setup.sh <worker-url> [email]
#   Or:  WORKER_URL=<url> setup.sh [email]
set -euo pipefail

if [ -n "${1:-}" ] && printf '%s' "$1" | grep -qE '^https?://'; then
  WORKER_URL="$1"
  shift
  EMAIL="${1:-}"
elif [ -n "${WORKER_URL:-}" ]; then
  EMAIL="${1:-}"
else
  echo "Usage: setup.sh <worker-url> [email]" >&2
  echo "   Or: WORKER_URL=<url> setup.sh [email]" >&2
  exit 1
fi

# 1. Get email (positional arg or interactive prompt)
if [ -z "$EMAIL" ]; then
  read -rp "Enter your email address: " EMAIL
fi
[ -z "$EMAIL" ] && { echo "Error: email cannot be empty." >&2; exit 1; }

# Fetch allowed domains from the worker (authoritative)
CONFIG=$(curl -sf "$WORKER_URL/auth/config" 2>/dev/null) || {
  echo "Error: could not reach worker at $WORKER_URL (is it running?)." >&2
  exit 1
}

DOMAINS=$(
  printf '%s' "$CONFIG" |
    sed 's/.*"allowed_email_domains":\[//' |
    sed 's/\].*//' |
    sed 's/"//g' |
    tr -d ' '
)

[ -z "$DOMAINS" ] && {
  echo "Error: worker returned invalid auth config (allowed_email_domains)." >&2
  exit 1
}

REPO_URL=$(printf '%s' "$CONFIG" | grep -o '"repo_url":"[^"]*"' | sed 's/"repo_url":"//;s/"//')
[ -z "$REPO_URL" ] && {
  echo "Error: worker returned invalid auth config (repo_url)." >&2
  exit 1
}
CLONE_DIR=$(basename "$REPO_URL" .git)

_domain="${EMAIL##*@}"
_allowed=0
IFS=',' read -r -a _domains <<< "$DOMAINS"
for _d in "${_domains[@]}"; do
  _d="${_d#"${_d%%[![:space:]]*}"}"
  _d="${_d%"${_d##*[![:space:]]}"}"
  if [ "$(printf '%s' "$_domain" | tr '[:upper:]' '[:lower:]')" = "$(printf '%s' "$_d" | tr '[:upper:]' '[:lower:]')" ]; then
    _allowed=1
    break
  fi
done
[ "$_allowed" -eq 0 ] && {
  echo "Error: email domain not permitted (allowed: $DOMAINS)." >&2
  exit 1
}

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
TOKEN=""
while true; do
  sleep 3
  POLL=$(curl -sf "$WORKER_URL/auth/poll?code=$DEVICE_CODE" || printf '{"status":"error"}')
  if printf '%s' "$POLL" | grep -q '"approved"'; then
    TOKEN=$(printf '%s' "$POLL" | grep -o '"agentToken":"[^"]*"' | sed 's/"agentToken":"//;s/"//')
    echo ""
    echo "✅ Authenticated!"
    break
  elif printf '%s' "$POLL" | grep -qE '"expired"|"error"'; then
    echo ""
    echo "❌ Authentication expired or failed. Run this script again." >&2
    exit 1
  else
    printf "."
  fi
done

# 4. Clone repo + write token (skipped in DRY_RUN mode where we're already inside the repo)
if [ "${DRY_RUN:-0}" != "1" ]; then
  echo "Cloning workshop repo..."
  git clone "$REPO_URL" "$CLONE_DIR"
  cd "$CLONE_DIR"
fi

# Derive URLs from WORKER_URL
WS_URL=$(printf '%s' "$WORKER_URL" | sed 's|^https://|wss://|;s|^http://|ws://|')
GAME_URL="$WS_URL/ws"

# Write token to both apps
printf 'VITE_GAME_URL=%s\nVITE_AGENT_TOKEN=%s\n' "$GAME_URL" "$TOKEN" > examples/starter/.env
printf 'VITE_SERVER_URL=%s\nVITE_WS_URL=%s\nVITE_AGENT_TOKEN=%s\n' "$WORKER_URL" "$WS_URL" "$TOKEN" > frontend/.env
echo "Token written."

if [ "${DRY_RUN:-0}" = "1" ]; then exit 0; fi

# 5. Install deps (requires pnpm — install it if missing) + launch presentation
if ! command -v pnpm > /dev/null 2>&1; then
  echo "Installing pnpm..."
  npm install -g pnpm
fi
pnpm install
pnpm --filter frontend dev
