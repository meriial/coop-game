# Local verification guide

Step-by-step instructions to verify the workshop platform locally. Intended for humans and agents — follow in order; each section states prerequisites, commands, and expected outcomes.

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 18+ | Node 22 recommended (see `.tool-versions`) |
| `curl` | Used for health checks and auth |
| Repo dependencies | `npm install` in `server/` and `frontend/` (or `pnpm install` at root if available) |

Local secrets live in [`server/.dev.vars`](../server/.dev.vars) (gitignored). Copy from [`server/.dev.vars.example`](../server/.dev.vars.example):

```bash
cp server/.dev.vars.example server/.dev.vars
# edit ADMIN_EMAIL, JWT_SECRET, ALLOWED_EMAIL_DOMAINS, and REPO_URL
```

| Variable | Where | Purpose |
|---|---|---|
| `JWT_SECRET` | `.dev.vars` / `wrangler secret` | Signs session JWTs |
| `ADMIN_EMAIL` | `.dev.vars` / `wrangler secret` | Email that gets **presenter** role |
| `ALLOWED_EMAIL_DOMAINS` | `.dev.vars` / `wrangler secret` | Comma-separated hostnames for magic-link auth (e.g. `your-domain.example,other.example`) |
| `REPO_URL` | `.dev.vars` / `wrangler secret` | Git clone URL returned by `GET /auth/config` for `setup.sh` |

Magic-link auth only accepts emails on `ALLOWED_EMAIL_DOMAINS`. If unset, `/auth/request` returns 500 (fail fast) — set it in `.dev.vars` / `wrangler secret`. Vitest uses `admin@test.com` with a test secret (tests mint JWTs directly) — not the magic-link flow.

**Public config endpoint:** `GET /auth/config` returns participant-facing settings (no JWT secrets):

```json
{
  "allowed_email_domains": ["your-domain.example"],
  "repo_url": "https://github.com/your-org/your-workshop-repo.git"
}
```

Returns **500** if `ALLOWED_EMAIL_DOMAINS` or `REPO_URL` is unset on the worker.

**Participant setup:** [`setup.sh`](../setup.sh) takes the worker URL as its first argument:

```bash
setup.sh <worker-url> [email]
# Or: WORKER_URL=<url> setup.sh [email]
```

It fetches `/auth/config`, validates the email domain, runs the magic-link flow, clones `repo_url`, and starts the frontend. Participants do not need local `ALLOWED_EMAIL_DOMAINS` or `REPO_URL`.

Production:

```bash
cd server && pnpm exec wrangler secret put JWT_SECRET
cd server && pnpm exec wrangler secret put ADMIN_EMAIL
cd server && pnpm exec wrangler secret put ALLOWED_EMAIL_DOMAINS
cd server && pnpm exec wrangler secret put REPO_URL
```

Without `RESEND_API_KEY`, magic links are **not emailed** — they appear in the terminal or at `GET /auth/inbox`.

---

## 1. Full presentation E2E (presenter + participant, recommended)

With the Worker running (`cd server && npm run dev`), authenticates **two real users** via magic link and exercises both games, slide navigation, and polls over WebSocket:

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2 (optional, for browser UI)
cd frontend && npm run dev

# Terminal 3
node scripts/verify-presentation-e2e.mjs
```

Uses a **fresh room id** each run (`verify-<timestamp>`) so leftover step state from earlier sessions does not affect results.

| User | Email | Role |
|---|---|---|
| Presenter | `$ADMIN_EMAIL` from `server/.dev.vars` | Must match worker `ADMIN_EMAIL` |
| Participant | `alice@<first-allowed-domain>` (default) | Any allowed-domain participant |

Override with env vars: `PRESENTER_EMAIL`, `ADMIN_EMAIL`, `PARTICIPANT_EMAIL`, `ALLOWED_EMAIL_DOMAINS`, `WORKER_URL`, `FRONTEND_URL`, `ROOM_ID`.

**Expected:** `✅ All presentation + game checks passed.` (19 checks)

**Browser follow-up** (optional): open the printed frontend URLs with each JWT:

```
http://localhost:5174/?token=<presenter-jwt>
http://localhost:5174/?token=<participant-jwt>   # incognito / second browser
```

Obtain JWTs via section 4 below, or run:

```bash
# Presenter token (use your ADMIN_EMAIL from server/.dev.vars)
curl -s -X POST http://localhost:8787/auth/request \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\"}" | tee /tmp/auth.json
curl -s "$(jq -r .magic_link /tmp/auth.json)" > /dev/null
curl -s "http://localhost:8787/auth/poll?code=$(jq -r .device_code /tmp/auth.json)" | jq -r .agentToken
```

---

## 2. Automated unit tests (no servers, fastest)

Runs WebSocket BDD tests against the real Worker + `PresentationRoom` Durable Object in Vitest. No browser or JWT setup required.

```bash
cd server && npm install && npm test
cd ../packages/mcp-server && npm install && npm test
```

**Expected:**

```
Test Files  6 passed (6)
Tests       25 passed (25)
```

Covers: `WELCOME`, periodic-match flips/alarms, pixel-heart paint, polls, `CONNECTED_USERS`, agent auth caps, `GET /auth/config` and domain enforcement on `/auth/request`.

From repo root (runs both suites):

```bash
npm test
```

---

## 3. Full local stack (one command)

[`dev.sh`](../dev.sh) installs deps, starts the Worker (`:8787`), runs the magic-link auth flow, writes `frontend/.env`, starts the frontend (`:5174`), and opens the presenter URL.

```bash
./dev.sh you@your-allowed-domain.example
```

Or interactively (prompts for email):

```bash
./dev.sh
```

**What happens:**

1. Wrangler dev starts → `http://localhost:8787`
2. `POST /auth/request` with your email → magic link printed in terminal (no email server locally)
3. Open the link → `GET /auth/verify` approves the device
4. Script polls `GET /auth/poll` → receives `agentToken` (JWT)
5. Writes `frontend/.env`:
   ```
   VITE_SERVER_URL=http://localhost:8787
   VITE_WS_URL=ws://localhost:8787
   VITE_AGENT_TOKEN=<jwt>
   ```
6. Frontend starts → `http://localhost:5174/?token=<jwt>`

**Expected terminal output:** `✓ Wrangler ready`, `✅ Authenticated!`, presenter URL printed.

**Stop:** Ctrl+C (stops both servers).

### Presenter vs participant locally

| Role | How |
|---|---|
| **Presenter** | Email must equal `ADMIN_EMAIL` in `server/.dev.vars`, **or** use dev role override (below) |
| **Participant** | Any other email on `ALLOWED_EMAIL_DOMAINS`, or guest invite link |

**Dev role override** (localhost only): append `&devRole=presenter` or `&devRole=participant` to the WebSocket URL. The frontend dev UI also has a toggle (amber presentation icon, top-right) to switch views without re-authenticating.

To test as presenter with `dev.sh` and a non-admin email:

```
http://localhost:5174/?token=<jwt>
```

Then click the dev **presenter/participant toggle** in the top-right, or restart with `devRole` in the WS URL (the toggle updates `devRole` automatically in dev mode).

---

## 4. Manual server startup (two terminals)

Use when you need fine-grained control or are verifying without `dev.sh`.

### Terminal 1 — Worker

```bash
cd server
npm install
npm run dev
# → http://localhost:8787
```

Verify:

```bash
curl -s http://localhost:8787/ | jq .
# → { "status": "ok", "game": "Workshop Pixel Art", "ws": "/ws" }
```

### Terminal 2 — Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5174
```

The frontend **requires a JWT** in the URL (`?token=…`) or in `VITE_AGENT_TOKEN` inside `frontend/.env`. Without it you see "Authentication required".

---

## 5. Obtaining a JWT locally

### Option A — Magic-link flow (mirrors production)

```bash
# 1. Request a device code
curl -s -X POST http://localhost:8787/auth/request \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\"}" | jq .

# Response includes "magic_link" (local only) and "device_code"

# 2. Open magic_link in a browser (or curl it)
curl -s '<magic_link_from_step_1>'
# → HTML page with "Authenticated!"

# 3. Poll for the token
curl -s 'http://localhost:8787/auth/poll?code=<device_code>' | jq .
# → { "status": "approved", "email": "...", "name": "...", "agentToken": "<jwt>" }
```

Save `agentToken` as your JWT.

### Option B — Read from `frontend/.env` after `dev.sh`

```bash
grep VITE_AGENT_TOKEN frontend/.env
```

### Option C — Guest invite (presenter only)

1. Open presenter UI with an admin JWT (`admin@test.com` or `devRole=presenter`).
2. Click **+ Invite**, enter guest name + email, send.
3. Without Resend, the invite link appears in the modal — open in incognito.

### Presenter JWT shortcut

Use your `ADMIN_EMAIL` in the auth flow — that email receives presenter role automatically.

---

## 6. Browser verification checklist

With Worker + frontend running and a JWT in hand:

| Step | Action | Expected |
|---|---|---|
| 1 | Open `http://localhost:5174/?token=<jwt>` | Slide deck loads; WebSocket connects |
| 2 | Default step (index 0) | **periodic-match** game visible |
| 3 | Presenter: advance slides (←/→ or control bar) | All tabs sync via `SYNC_STEP` |
| 4 | Advance to pixel-heart step (index 7) | Co-op canvas; click cells to paint (colors blend; power-ups appear) |
| 5 | Poll steps | Vote; results update live |
| 6 | Two tabs (dev toggle or two JWTs) | Moves in one tab appear in the other |

### WebSocket URL (for debugging)

The frontend connects to:

```
ws://localhost:8787/room/main?token=<jwt>
```

With dev role override:

```
ws://localhost:8787/room/main?token=<jwt>&devRole=presenter
```

---

## 7. MCP agent verification

Requires a running Worker (section 2 or 3) and a JWT (section 4).

### Poor man's MCP (scripted client)

No MCP host config (Cursor, Claude Desktop, etc.) is required. Build the server, then drive it from Node scripts that spawn `dist/index.js` on stdio and call tools via `@modelcontextprotocol/sdk`:

```bash
cd packages/mcp-server
npm install && npm run build

# Room must be on co-op canvas (step 7) — or run prep first:
node scripts/prep-canvas.mjs

# Read the canvas:
node scripts/mcp-call.mjs get_state

# Free-paint a cell anywhere (worm-mode bypass); --backend prod to hit production:
node scripts/mcp-call.mjs take_action '{"type":"GAME_PAINT","payload":{"x":10,"y":8,"fromCursor":true}}'
```

> The older demo scripts (`draw-circle.mjs`, `creative-draw.mjs`, `paint-agent.mjs`, `verify-canvas.mjs`) were **removed** — they called the deleted `paint_path` tool. Drive paints with `mcp-call.mjs` + `take_action`/`GAME_PAINT { fromCursor: true }`; see [game.md § Agent painting playbook](./game.md#agent-painting-playbook).

Scripts live in `packages/mcp-server/scripts/`. JWT: use section 4 token, `frontend/.env` `VITE_AGENT_TOKEN`, or sign locally with `JWT_SECRET` from `server/.dev.vars` (see `prep-canvas.mjs`).

Full pattern and tool reference: [architecture.md § Poor man's MCP](./architecture.md#poor-mans-mcp-scripted-client).

### Hosted MCP (optional)

To attach an LLM inside an editor instead of a script:

```bash
cd packages/mcp-server && npm run build
export WORKSHOP_OWNER_TOKEN='<jwt from section 4>'
export WORKSHOP_AGENT_LABEL='Agent 1'
export WORKSHOP_ROOM_URL='http://localhost:8787'
export WORKSHOP_ROOM_ID='main'
node dist/index.js   # stdio — register this command in your MCP host config
```

**Tool smoke test** (scripted or hosted):

| Tool | Expected |
|---|---|
| `get_config` | Grid size, cooldown, `agentBatchMax`, power-up rules |
| `get_state` | JSON with `activeGameId`, compact canvas state, `identity.name` = `"<Owner>'s Agent 1"` |
| `paint` | Single paint on co-op canvas; coverage increases (adjacency-locked in worm mode) |
| `take_action` | Batch via `{ "type": "GAME_PAINT_PATH", "payload": { "cells": [...] } }`, or e.g. `{ "type": "MATCH_FLIP", "pos": 0 }` on periodic-match step |
| `wait_for_update` | Returns after another player moves or times out ~25s when idle |

**Agent cap test** (periodic-match, step 0): connect a second agent with the same owner token + different `agentLabel` → WebSocket upgrade returns **403**.

On pixel-heart (step 7): second agent for the same owner is **allowed**.

---

## 8. Build & deploy verification

```bash
cd frontend && npm run type-check && npm run build
cd ../server && npx wrangler deploy --dry-run
```

**Expected:** no TypeScript errors; dry-run lists `PRESENTATION_ROOM` and `GAME_ROOM` bindings.

Full deploy:

```bash
npm run deploy   # from repo root — builds frontend, deploys server
```

---

## 9. Participant setup script (`setup.sh`)

Mirrors what participants run against a deployed worker. From the repo (with worker running locally):

```bash
./setup.sh http://localhost:8787 you@your-allowed-domain.example
```

**Flow:**

1. `GET /auth/config` — domain list + `repo_url`
2. Domain check (fails fast before magic link if email not allowed)
3. `POST /auth/request` → open magic link (or read from `/auth/inbox` locally)
4. `GET /auth/poll` → JWT
5. `git clone` from `repo_url`, write `frontend/.env`, `pnpm install`, start frontend

**Blocked domain (expect exit 1):**

```bash
./setup.sh http://localhost:8787 user@blocked.com
# Error: email domain not permitted (allowed: …)
```

**Dry run (auth only, no clone/install):**

```bash
DRY_RUN=1 ./setup.sh http://localhost:8787 you@your-allowed-domain.example
```

From repo root: `npm run login:dev` runs the dry-run flow against `http://localhost:8787`.

---

## 10. Auth end-to-end script

[`test-local.sh`](../test-local.sh) clones the repo to a temp directory, runs the full magic-link + inbox + JWT pipeline, and prints the decoded payload. Useful for CI-style auth verification:

```bash
./test-local.sh                    # default: testuser+local@example.test
./test-local.sh custom@my.test     # positional override
```

**Expected:** `=== ✅ All auth checks passed ===`

---

## Quick reference

| Goal | Command / URL |
|---|---|
| Full presenter+participant E2E | `node scripts/verify-presentation-e2e.mjs` |
| Run all automated tests | `cd server && npm test` |
| Start everything + auth | `./dev.sh you@your-allowed-domain.example` |
| Worker only | `cd server && npm run dev` |
| Frontend only | `cd frontend && npm run dev` |
| Health check | `curl http://localhost:8787/` |
| Local auth inbox | `curl http://localhost:8787/auth/inbox \| jq` |
| Auth config (domains + repo) | `curl http://localhost:8787/auth/config \| jq` |
| Participant setup | `./setup.sh http://localhost:8787 you@your-allowed-domain.example` |
| Presenter UI | `http://localhost:5174/?token=<jwt>` |
| MCP read (scripted) | `cd packages/mcp-server && node scripts/mcp-call.mjs get_state` |
| MCP free-paint demo | `node packages/mcp-server/scripts/mcp-call.mjs take_action '{"type":"GAME_PAINT","payload":{"x":10,"y":8,"fromCursor":true}}'` |

## Troubleshooting

| Problem | Fix |
|---|---|
| `Authentication required` in browser | Add `?token=<jwt>` or run `dev.sh` to populate `frontend/.env` |
| Presenter controls missing | JWT email must match `ADMIN_EMAIL` in `.dev.vars`, or use dev `devRole=presenter` toggle |
| `pnpm: command not found` | Use `npm` in `server/` and `frontend/` directly |
| Tests hang on first run | Normal on cold start; re-run. Config uses `maxWorkers: 1` for WebSocket + DO |
| Magic link missing | Check terminal output from `dev.sh`, or `curl localhost:8787/auth/inbox` |
| Wrong slide on connect (not step 0) | The `main` room persists state — use `node scripts/verify-presentation-e2e.mjs` (fresh room), or presenter resets step |
| `admin@test.com` magic-link auth fails | Domain not in `ALLOWED_EMAIL_DOMAINS` — use an allowed domain or mint JWTs in tests |
| `/auth/config` returns 500 | Set `ALLOWED_EMAIL_DOMAINS` and `REPO_URL` in `server/.dev.vars` (or wrangler secrets) |
| `setup.sh` cannot reach worker | Pass worker URL as first arg: `./setup.sh http://localhost:8787 …` |
| Wrangler crashes on hot reload (`SQLITE_BUSY`) | Kill port 8787 and restart `cd server && npm run dev` |
