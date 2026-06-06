import { GameClient } from '@workshop/sdk';
import type { GameState } from '@workshop/sdk';

const GAME_URL = import.meta.env.VITE_GAME_URL as string | undefined;
const AGENT_TOKEN = import.meta.env.VITE_AGENT_TOKEN as string | undefined;

if (!GAME_URL) {
  document.body.innerHTML = `
    <div style="padding:2rem;color:#ef4444;font-family:monospace;max-width:480px">
      <h2 style="margin-bottom:1rem">Missing VITE_GAME_URL</h2>
      <p>Create <code>examples/starter/.env</code> containing:</p>
      <pre style="background:#1e293b;padding:1rem;border-radius:0.5rem;margin-top:0.75rem">VITE_GAME_URL=wss://workshop-game.YOUR-SUBDOMAIN.workers.dev/ws</pre>
      <p style="margin-top:0.75rem;color:#94a3b8">Your organizer will provide the URL.</p>
    </div>`;
  throw new Error('VITE_GAME_URL is not set');
}

function decodeTokenName(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.name === 'string' ? payload.name : null;
  } catch {
    return null;
  }
}

const GRID_SIZE = 20;
const gameUrl = AGENT_TOKEN ? `${GAME_URL}?token=${encodeURIComponent(AGENT_TOKEN)}` : GAME_URL;
const client = new GameClient(gameUrl);

// DOM refs
const nameScreen   = document.getElementById('name-screen')!;
const gameScreen   = document.getElementById('game-screen')!;
const nameInput    = document.getElementById('name-input') as HTMLInputElement;
const joinBtn      = document.getElementById('join-btn') as HTMLButtonElement;

// Pre-fill name from JWT token if present
const tokenName = AGENT_TOKEN ? decodeTokenName(AGENT_TOKEN) : null;
if (tokenName) nameInput.value = tokenName;
const progressBar  = document.getElementById('progress-bar')!;
const progressText = document.getElementById('progress-text')!;
const playerCount  = document.getElementById('player-count')!;
const canvasGrid   = document.getElementById('canvas-grid')!;
const targetGrid   = document.getElementById('target-grid')!;
const playerList   = document.getElementById('player-list')!;
const victory      = document.getElementById('victory')!;

function renderTarget(target: boolean[][]) {
  targetGrid.innerHTML = '';
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = document.createElement('div');
      cell.className = `cell ${target[y][x] ? 'target-filled' : 'target-empty'}`;
      targetGrid.appendChild(cell);
    }
  }
}

function renderCanvas(canvas: (string | null)[][], target: boolean[][]) {
  canvasGrid.innerHTML = '';
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = document.createElement('div');
      const isTarget = target[y][x];
      cell.className = `cell${isTarget ? ' paintable' : ''}`;
      cell.style.background = canvas[y][x] ?? (isTarget ? '#1e293b' : '#0f172a');
      if (isTarget) {
        const cx = x, cy = y;
        cell.addEventListener('click', () => client.paint(cx, cy));
      }
      canvasGrid.appendChild(cell);
    }
  }
}

let targetRendered = false;

function updateUI(state: GameState) {
  if (!targetRendered) {
    renderTarget(state.target);
    targetRendered = true;
  }

  renderCanvas(state.canvas, state.target);

  const players = Object.values(state.players);
  const n = players.length;
  playerCount.textContent = `${n} player${n !== 1 ? 's' : ''}`;
  progressBar.style.width = `${state.progress}%`;
  progressText.textContent = `${state.progress}% complete`;

  playerList.innerHTML = '';
  for (const p of players) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    const dot = document.createElement('div');
    dot.className = 'chip-dot';
    dot.style.background = p.color;
    chip.append(dot, document.createTextNode(p.name));
    playerList.appendChild(chip);
  }

  if (state.progress === 100) victory.style.display = 'block';
}

async function joinGame(name: string) {
  joinBtn.disabled = true;
  joinBtn.textContent = 'Connecting…';
  client.onStateUpdate(updateUI);
  try {
    await client.connect(name);
    nameScreen.style.display = 'none';
    gameScreen.style.display = 'block';
  } catch (err) {
    alert(`Connection failed: ${(err as Error).message}`);
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join';
    client.disconnect();
  }
}

nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinBtn.click(); });
joinBtn.addEventListener('click', () => { const name = nameInput.value.trim(); if (name) joinGame(name); });

// Auto-join immediately when a valid token is present
if (tokenName) joinGame(tokenName);
