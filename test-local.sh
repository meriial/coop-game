#!/usr/bin/env bash
# End-to-end local auth test.
# Clones the repo to a temp dir (simulating participant experience), runs the
# full auth flow using the fake inbox, verifies the JWT lands in .env, then
# optionally keeps wrangler running so you can open the app in a browser.
set -euo pipefail

REPO_ROOT="$(git -C "$(cd "$(dirname "$0")" && pwd)" rev-parse --show-toplevel)"
# shellcheck source=scripts/lib/dev-vars.sh
source "$REPO_ROOT/scripts/lib/dev-vars.sh"

TEST_EMAIL_DOMAIN="${TEST_EMAIL_DOMAIN:-example.test}"
TEST_EMAIL="${1:-${TEST_EMAIL:-testuser+local@${TEST_EMAIL_DOMAIN}}}"
WORK_DIR="$(mktemp -d)/workshop"
WORKER_PORT=8789
WRANGLER_PID=""

echo "=== Local Auth E2E Test ==="
echo "Email : $TEST_EMAIL"
echo "Tmpdir: $WORK_DIR"
echo ""

cleanup() {
  if [ -n "$WRANGLER_PID" ]; then
    pkill -P "$WRANGLER_PID" 2>/dev/null || true
    kill "$WRANGLER_PID" 2>/dev/null || true
  fi
  # Belt-and-suspenders: kill anything still holding our port
  PORT_PID=$(lsof -ti ":$WORKER_PORT" 2>/dev/null || true)
  [ -n "$PORT_PID" ] && kill -9 $PORT_PID 2>/dev/null || true
  rm -rf "$(dirname "$WORK_DIR")"
  echo ""; echo "Cleaned up."
}
trap cleanup EXIT

# 1. Mirror repo to temp dir (rsync copies uncommitted files, simulating post-push state)
echo "▶ Copying repo to temp dir..."
rsync -a \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.wrangler' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='server/.dev.vars' \
  "$REPO_ROOT/" "$WORK_DIR/"

# Seed isolated worker secrets for the test domain (no real organizer config).
cat > "$WORK_DIR/server/.dev.vars" <<EOF
ALLOWED_EMAIL_DOMAINS=${TEST_EMAIL_DOMAIN}
JWT_SECRET=test-jwt-secret-local-e2e
ADMIN_EMAIL=admin@${TEST_EMAIL_DOMAIN}
EOF
# Seed a minimal .env so the starter app has the game URL pointing to our test worker
mkdir -p "$WORK_DIR/examples/starter"
printf 'VITE_GAME_URL=ws://localhost:%s/ws\n' "$WORKER_PORT" > "$WORK_DIR/examples/starter/.env"

cd "$WORK_DIR"

# 2. Install workspace deps + start wrangler dev on an isolated port
echo "▶ Installing deps..."
pnpm install --silent
echo "▶ Starting wrangler dev (port $WORKER_PORT)..."
(cd server && pnpm exec wrangler dev --port "$WORKER_PORT") > /tmp/wrangler-e2e.log 2>&1 &
WRANGLER_PID=$!

# Wait up to 30s for the worker to be ready
echo -n "Waiting for worker"
READY=0
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$WORKER_PORT" > /dev/null 2>&1; then READY=1; break; fi
  sleep 1; printf "."
done
echo ""
[ $READY -eq 0 ] && { echo "❌ Worker failed to start. Check /tmp/wrangler-e2e.log" >&2; exit 1; }
echo "✓ Worker ready"

# 3. Run setup.sh in background (DRY_RUN=1 skips npm start)
echo "▶ Running setup.sh..."
WORKER_URL="http://localhost:$WORKER_PORT" DRY_RUN=1 bash setup.sh "$TEST_EMAIL" \
  > /tmp/setup-e2e.log 2>&1 &
SETUP_PID=$!

# 4. Poll /auth/inbox until a magic link appears (max 20s)
echo -n "Waiting for inbox"
MAGIC_LINK=""
for i in $(seq 1 20); do
  sleep 1
  INBOX=$(curl -sf "http://localhost:$WORKER_PORT/auth/inbox" 2>/dev/null || echo '[]')
  MAGIC_LINK=$(printf '%s' "$INBOX" | grep -o '"link":"[^"]*"' | sed 's/"link":"//;s/"//' | head -1 || true)
  [ -n "$MAGIC_LINK" ] && break
  printf "."
done
echo ""
[ -z "$MAGIC_LINK" ] && {
  echo "❌ No magic link in inbox. setup.sh output:"
  cat /tmp/setup-e2e.log >&2
  kill "$SETUP_PID" 2>/dev/null || true
  exit 1
}
echo "✓ Magic link: $MAGIC_LINK"

# 5. Click the magic link
echo "▶ Clicking magic link..."
VERIFY_HTML=$(curl -sf "$MAGIC_LINK" 2>/dev/null || echo '')
if printf '%s' "$VERIFY_HTML" | grep -qi "authenticated"; then
  echo "✓ Verification page: Authenticated"
else
  echo "❌ Unexpected verify response:" >&2
  printf '%s\n' "$VERIFY_HTML" >&2
  kill "$SETUP_PID" 2>/dev/null || true
  exit 1
fi

# 6. Wait for setup.sh to detect approved + write .env
echo "▶ Waiting for setup.sh to finish..."
wait "$SETUP_PID"
echo "✓ setup.sh completed"

# 7. Verify token written to .env
grep -q "VITE_AGENT_TOKEN" examples/starter/.env || {
  echo "❌ VITE_AGENT_TOKEN not found in examples/starter/.env" >&2; exit 1
}
echo "✓ VITE_AGENT_TOKEN written to examples/starter/.env"

# 8. Decode + print JWT payload
RAW_TOKEN=$(grep "^VITE_AGENT_TOKEN=" examples/starter/.env | cut -d= -f2-)
PAYLOAD_B64=$(printf '%s' "$RAW_TOKEN" | cut -d. -f2 | tr -- '-_' '+/')
MOD=$(( ${#PAYLOAD_B64} % 4 ))
[ $MOD -ne 0 ] && PAYLOAD_B64="${PAYLOAD_B64}$(printf '=%.0s' $(seq 1 $((4 - MOD))))"
PAYLOAD=$(printf '%s' "$PAYLOAD_B64" | base64 -d 2>/dev/null || echo '(decode failed)')
echo "JWT payload: $PAYLOAD"

echo ""
echo "=== ✅ All auth checks passed ==="
echo ""
echo "To see the player in the game:"
echo "  cd $WORK_DIR/examples/starter && npm install && npm start"
echo "  Then open http://localhost:5173 — name is pre-filled from the JWT"
echo "  Click Join to appear in the heart canvas"
echo ""
echo "Wrangler (PID $WRANGLER_PID) is still running on port $WORKER_PORT."
echo "Press Ctrl+C to stop it and clean up the temp dir."
wait
