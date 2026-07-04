# Workshop Pixel Art

An interactive presentation platform for AI workshops. The presenter drives a slide deck with live polls; participants play real-time games together (periodic-table matching and a cooperative paint canvas with color mixing and power-ups). AI agents can join via an MCP bridge.

**Docs:** [architecture](docs/architecture.md) · [presentations](docs/presentations.md) · [games](docs/game.md) · **[local verification](docs/verification.md)**

---

## Setup (allowed-domain participants)

Your organizer provides a **worker URL** (e.g. `https://your-worker.YOUR-SUBDOMAIN.workers.dev`). Run:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/meriial/coop-game/main/setup.sh) \
  https://your-worker.YOUR-SUBDOMAIN.workers.dev
```

Or pass your email on the same line:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/meriial/coop-game/main/setup.sh) \
  https://your-worker.YOUR-SUBDOMAIN.workers.dev you@your-allowed-domain.example
```

**What `setup.sh` does:**

1. `GET /auth/config` on the worker — reads `allowed_email_domains` and `repo_url` (no local env vars needed)
2. Validates your email domain against that list
3. `POST /auth/request` — magic link (emailed in production, printed locally)
4. Clones the repo from `repo_url` and writes your JWT to `frontend/.env`
5. Starts the presentation frontend

You'll be prompted for an email if you omit it. The email must be on a domain listed in the worker's `ALLOWED_EMAIL_DOMAINS` secret.

**What you see depends on who you are:**
- **Participants** — slides sync in real-time, vote in polls, paint together on the shared canvas
- **Organizer** (email set via `ADMIN_EMAIL`) — same view, plus a presenter control bar to advance slides, trigger polls, reset the canvas, and invite guests

**Requirements:** Node.js 18+, git, curl &nbsp;·&nbsp; pnpm is installed automatically if missing

---

## Joining as a guest (external participants)

Guests with non-DrugBank emails don't need the terminal setup. The organizer sends them a personal invite link from the presenter control bar — clicking it opens the presentation directly in their browser, no setup required.

The invite link is a signed JWT valid for 7 days.

---

## Local verification

See **[docs/verification.md](docs/verification.md)** for full instructions (servers, auth, browser checks, MCP).

Quick start:

```bash
./dev.sh you@your-allowed-domain.example   # starts Worker + frontend, opens presenter
node scripts/verify-presentation-e2e.mjs # presenter + participant E2E (Worker must be running)
cd server && npm test                    # 25 automated WebSocket tests (no servers needed)
```

## MCP agents

The workshop exposes a stdio MCP server (`packages/mcp-server`) with tools `get_config`, `get_state`, `paint`, `wait_for_update`, and `take_action` (batch paint, free-paint, and colour changes all go through `take_action`).

**Recommended for dev/demos:** [Poor man's MCP](./docs/architecture.md#poor-mans-mcp-scripted-client) — spawn the server from a Node script and call tools via `@modelcontextprotocol/sdk`, no Cursor MCP config required:

```bash
cd packages/mcp-server && npm run build
node scripts/mcp-call.mjs get_state                    # read the canvas (generic switchable transport)
node scripts/mcp-call.mjs --backend prod get_state     # ...or hit production
node scripts/mcp-call.mjs take_action '{"type":"GAME_PAINT","payload":{"x":10,"y":8}}'  # worm-mode paint
```

Before writing an agent that paints, read the **[Agent painting playbook](docs/game.md#agent-painting-playbook)** — worm mode, cooldown, and silent paint-drops will trip you up otherwise.

Details, env vars, and the full script list: [docs/architecture.md § MCP bridge](docs/architecture.md#mcp-bridge).

## SDK reference

### Presentation room (`PresentationClient`)

For the workshop presentation at `/room/{roomId}`:

```typescript
import { PresentationClient, buildRoomWsUrl } from '@workshop/sdk';

const client = new PresentationClient(
  buildRoomWsUrl('ws://localhost:8787', 'main', token),
  'Alice',
);
await client.connect();
client.sendAction({ type: 'GAME_PAINT', x: 3, y: 2 });
const snap = await client.waitForUpdate();
```

### Legacy game room (`GameClient`)

The `@workshop/sdk` package also exposes `GameClient` for the original `/ws` endpoint:

```typescript
import { GameClient } from '@workshop/sdk';
import type { GameState } from '@workshop/sdk';

const client = new GameClient('wss://workshop-game.SUBDOMAIN.workers.dev/ws');

// Register state listener (call before connect)
client.onStateUpdate((state: GameState) => {
  console.log(`Progress: ${state.progress}%`);
  console.log('Players:', Object.values(state.players));
  console.log('Canvas:', state.canvas);   // (string|null)[][] — color or null per cell
  console.log('Target:', state.target);   // boolean[][] — which cells need painting
});

// Connect with your name (resolves after the first state arrives)
await client.connect('Alice');

// Paint a cell at (x, y) — server ignores non-target cells
client.paint(3, 7);

// Read current state without a callback
const state = client.getState();

// Disconnect when done
client.disconnect();
```

### Types

```typescript
interface Player  { id: string; name: string; color: string }
interface GameState {
  canvas:   (string | null)[][];  // 20×20, hex color or null
  target:   boolean[][];           // 20×20, true = needs painting
  players:  Record<string, Player>;
  progress: number;                // 0–100
}
```

---

## Ideas for extending the starter

These are good Cursor / AI-assisted tasks once you understand the SDK:

- **Animation** — flash or scale a cell when it gets painted
- **My score** — count how many cells carry your color and display it
- **Bot mode** — auto-paint one random target cell every second
- **Sound** — play a short tone when any cell is painted
- **Color picker** — override your assigned color with an `<input type="color">`
- **Confetti** — burst confetti when `progress === 100`
- **Heatmap overlay** — shade cells by how many times they've been repainted

---

## For the organizer

### First-time setup

```bash
# 1. Authenticate with Cloudflare
cd server && pnpm exec wrangler login

# 2. Create the KV namespace for auth tokens
pnpm exec wrangler kv namespace create AUTH_KV
pnpm exec wrangler kv namespace create AUTH_KV --preview
# Copy the two IDs printed into server/wrangler.toml

# 3. Set secrets
pnpm exec wrangler secret put RESEND_API_KEY   # your Resend API key
pnpm exec wrangler secret put FROM_EMAIL       # e.g. info@yourdomain.com
pnpm exec wrangler secret put JWT_SECRET       # run: openssl rand -hex 32
pnpm exec wrangler secret put ADMIN_EMAIL      # presenter email (must be on an allowed domain)
pnpm exec wrangler secret put ALLOWED_EMAIL_DOMAINS  # comma-separated, e.g. your-domain.example,other.example
pnpm exec wrangler secret put REPO_URL               # git URL for setup.sh to clone

# 4. Deploy (builds the frontend, then deploys the worker)
pnpm deploy:wrangler
```

### Local development

```bash
# Copy server/.dev.vars.example → server/.dev.vars and set JWT_SECRET, ADMIN_EMAIL, ALLOWED_EMAIL_DOMAINS, REPO_URL.
# No RESEND_API_KEY → magic links and invite emails are stored in KV instead of sent.

cp server/.dev.vars.example server/.dev.vars   # first time only
cd server && pnpm dev        # worker on http://localhost:8787
```

Then in a second terminal, authenticate via setup (magic link prints in the terminal):

```bash
# From the repo (after cp .dev.vars.example → .dev.vars)
./setup.sh http://localhost:8787 you@your-allowed-domain.example

# Or curl the script (same args: <worker-url> [email])
bash <(curl -fsSL https://raw.githubusercontent.com/meriial/coop-game/main/setup.sh) \
  http://localhost:8787 you@your-allowed-domain.example
```

From the repo you can also use `./dev.sh you@your-allowed-domain.example` — it starts servers and opens the presenter URL in one step.

`setup.sh` writes your token to `frontend/.env` and starts the frontend. Open a second browser window at `http://localhost:5174` (incognito, no token) to see the participant view.

**Testing guest invites locally:** Click "+ Invite" in the presenter control bar, enter any name and email, and click Send. Because there's no `RESEND_API_KEY`, the invite link is returned directly in the modal — copy it and open it in a new incognito tab to join as that guest. To inspect the email that would have been sent: `curl http://localhost:8787/auth/inbox`

### Reset the canvas between rounds

```bash
# Redeploy — the Durable Object reinitialises with an empty canvas on first request
cd server && pnpm exec wrangler deploy
```

Or add a `POST /reset` endpoint to `server/src/game-room.ts` for in-place resets.

### Customise the target image

Edit the `TARGET` constant in `server/src/game-room.ts`. It's a 20×20 boolean grid — `true` means a cell needs to be painted. Redeploy after changing it.
