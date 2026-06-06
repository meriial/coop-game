# Workshop Pixel Art

An interactive presentation platform and cooperative real-time game for AI workshops. The presenter drives a slide deck with live polls; everyone plays a cooperative pixel art game together to fill a heart-shaped canvas.

---

## Setup (DrugBank / twosmiles.ca participants)

Run this single command in your terminal — it handles everything:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/meriial/coop-game/main/setup.sh)
```

You'll be prompted for your `@drugbank.com` or `@twosmiles.ca` email. A magic link will arrive in your inbox — click it to authenticate, and your browser will open the presentation automatically.

**What you see depends on who you are:**
- **Participants** — slides sync in real-time, vote in polls, paint the pixel heart
- **Organizer** (`music@twosmiles.ca`) — same view, plus a presenter control bar to advance slides, trigger polls, reset the canvas, and invite guests

**Requirements:** Node.js 18+, git, curl &nbsp;·&nbsp; pnpm is installed automatically if missing

---

## Joining as a guest (external participants)

Guests with non-DrugBank emails don't need the terminal setup. The organizer sends them a personal invite link from the presenter control bar — clicking it opens the presentation directly in their browser, no setup required.

The invite link is a signed JWT valid for 7 days.

---

## SDK reference

The `@workshop/sdk` package exposes a single `GameClient` class.

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

# 4. Update the default WORKER_URL in setup.sh to match your worker subdomain

# 5. Deploy
pnpm exec wrangler deploy
```

### Local development

```bash
# server/.dev.vars is already set up with a local JWT_SECRET and ADMIN_EMAIL.
# No RESEND_API_KEY → magic links and invite emails are stored in KV instead of sent.

cd server && pnpm dev        # worker on http://localhost:8787
```

Then in a second terminal, run setup pointed at localhost — the magic link prints directly in the terminal:

```bash
WORKER_URL=http://localhost:8787 bash <(curl -fsSL https://raw.githubusercontent.com/meriial/coop-game/main/setup.sh) music@twosmiles.ca
```

This authenticates you, writes your token to `frontend/.env`, and opens `http://localhost:5174` as the presenter. Open a second browser window at `http://localhost:5174` (in a private/incognito window with no token) to see the participant view.

**Testing guest invites locally:** Click "+ Invite" in the presenter control bar, enter any name and email, and click Send. Because there's no `RESEND_API_KEY`, the invite link is returned directly in the modal — copy it and open it in a new incognito tab to join as that guest. To inspect the email that would have been sent: `curl http://localhost:8787/auth/inbox`

### Reset the canvas between rounds

```bash
# Redeploy — the Durable Object reinitialises with an empty canvas on first request
cd server && pnpm exec wrangler deploy
```

Or add a `POST /reset` endpoint to `server/src/game-room.ts` for in-place resets.

### Customise the target image

Edit the `TARGET` constant in `server/src/game-room.ts`. It's a 20×20 boolean grid — `true` means a cell needs to be painted. Redeploy after changing it.
