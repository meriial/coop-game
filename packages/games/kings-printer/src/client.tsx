import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameComponentProps } from '@workshop/game-core/client';
import type { KPDocument, KPPlayerState, KPState, KPStation } from './types';
import { chiptunePlayer } from './music';

// ── Constants ────────────────────────────────────────────────────────────────

const DOC_LABELS: Record<string, string> = {
  proclamation: 'Royal Proclamation',
  bill: 'Parliamentary Bill',
  gazette: 'Canada Gazette',
  patent: 'Letters Patent',
};

const DOC_ICONS: Record<string, string> = {
  proclamation: '📜',
  bill: '📋',
  gazette: '📰',
  patent: '📑',
};

const STATION_LABEL: Record<KPStation, string> = {
  queue: 'PAPER STOCK',
  typeset: 'COMPOSITOR',
  press: 'ROLLING PRESS',
  deliver: 'ROYAL DISPATCH',
};

const STATION_ICON: Record<KPStation, string> = {
  queue: '📄',
  typeset: '⌨️',
  press: '🖨️',
  deliver: '📬',
};

// Stations that require "processing" (show progress bar before sending)
const PROCESS_STATIONS: KPStation[] = ['typeset', 'press'];
const PROCESS_DURATION = 1800; // ms

// Next station needed based on doc step
const STEP_NEEDS: Record<number, KPStation> = { 0: 'typeset', 1: 'press', 2: 'deliver' };

// ── Pixel font style helper ───────────────────────────────────────────────────

const px = 'font-["Press_Start_2P",monospace]';

// ── Sub-components ────────────────────────────────────────────────────────────

function Timer({ seconds }: { seconds: number }) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const urgent = seconds <= 30;
  return (
    <span className={`${px} text-xs tabular-nums ${urgent ? 'text-red-400 animate-pulse' : 'text-yellow-300'}`}>
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  );
}

function DocCard({ doc, isHeldByMe }: { doc: KPDocument; isHeldByMe: boolean }) {
  const now = Date.now();
  const total = 50_000;
  const remaining = Math.max(0, doc.expiresAt - now);
  const pct = (remaining / total) * 100;
  const urgent = pct < 30;
  const needsStation = STEP_NEEDS[doc.step];

  return (
    <div className={`rounded border-2 px-2 py-1.5 flex flex-col gap-1 min-w-[100px] flex-shrink-0
      ${isHeldByMe ? 'border-yellow-400 bg-yellow-900/30' : 'border-slate-600 bg-slate-800/60'}`}>
      <div className={`${px} text-[8px] text-slate-300 leading-tight`}>
        {DOC_ICONS[doc.docType]} {DOC_LABELS[doc.docType].split(' ')[0]}
      </div>
      <div className={`${px} text-[6px] ${urgent ? 'text-red-400' : 'text-slate-400'}`}>
        → {STATION_ICON[needsStation]} {STATION_LABEL[needsStation].split(' ')[0]}
      </div>
      <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${urgent ? 'bg-red-500' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

type StationState = 'idle' | 'processing' | 'wrong';

function StationButton({
  station,
  myPlayer,
  docs,
  onAction,
}: {
  station: KPStation;
  myPlayer: KPPlayerState | undefined;
  docs: KPDocument[];
  onAction: (s: KPStation) => void;
}) {
  const [btnState, setBtnState] = useState<StationState>('idle');
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const heldDoc = myPlayer?.holdingId ? docs.find((d) => d.id === myPlayer.holdingId) : undefined;
  const isProcessingStation = PROCESS_STATIONS.includes(station);

  // Determine whether tapping this station would do something useful
  const wouldWork = (() => {
    if (station === 'queue') return true; // always useful (pick up or drop)
    if (!heldDoc) return false;
    return STEP_NEEDS[heldDoc.step] === station;
  })();

  const clearInterval_ = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const handleTap = () => {
    if (btnState === 'processing') return;

    if (isProcessingStation && wouldWork) {
      // Show progress bar, then fire action
      setBtnState('processing');
      setProgress(0);
      const start = Date.now();
      chiptunePlayer.sfx('pickup');
      intervalRef.current = setInterval(() => {
        const pct = Math.min(100, ((Date.now() - start) / PROCESS_DURATION) * 100);
        setProgress(pct);
        if (pct >= 100) {
          clearInterval_();
          setBtnState('idle');
          setProgress(0);
          chiptunePlayer.sfx('process');
          onAction(station);
        }
      }, 30);
    } else {
      if (!wouldWork && station !== 'queue' && heldDoc) {
        setBtnState('wrong');
        setTimeout(() => setBtnState('idle'), 400);
      } else {
        if (station === 'deliver' && wouldWork) chiptunePlayer.sfx('deliver');
        else if (station === 'queue') chiptunePlayer.sfx('pickup');
        onAction(station);
      }
    }
  };

  useEffect(() => () => clearInterval_(), [clearInterval_]);

  const isMeHere = myPlayer?.station === station;
  const colors: Record<KPStation, string> = {
    queue: 'from-blue-900 to-blue-800 border-blue-500',
    typeset: 'from-purple-900 to-purple-800 border-purple-500',
    press: 'from-orange-900 to-orange-800 border-orange-500',
    deliver: 'from-green-900 to-green-800 border-green-500',
  };

  return (
    <button
      onPointerDown={handleTap}
      className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2
        bg-gradient-to-b p-3 select-none touch-none transition-all active:scale-95 w-full aspect-square
        ${colors[station]}
        ${isMeHere ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-slate-950' : ''}
        ${btnState === 'wrong' ? 'border-red-500 bg-red-900/50' : ''}
        ${btnState === 'processing' ? 'border-yellow-400' : ''}
        `}
    >
      <span className="text-3xl leading-none">{STATION_ICON[station]}</span>
      <span className={`${px} text-[7px] text-center leading-tight text-white`}>
        {STATION_LABEL[station]}
      </span>
      {/* Processing bar */}
      {btnState === 'processing' && (
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-700 rounded-b-lg overflow-hidden">
          <div className="h-full bg-yellow-400 transition-none" style={{ width: `${progress}%` }} />
        </div>
      )}
      {/* "Me here" pip */}
      {isMeHere && (
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
      )}
    </button>
  );
}

function PlayerPill({ player, isMe }: { player: KPPlayerState; isMe: boolean }) {
  const station = player.station ? STATION_ICON[player.station] : '💤';
  return (
    <div className={`flex items-center gap-1.5 rounded px-2 py-1 ${isMe ? 'bg-yellow-900/40 border border-yellow-600' : 'bg-slate-800/60'}`}>
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: player.color }} />
      <span className={`${px} text-[7px] text-white truncate max-w-[70px]`}>{player.name}</span>
      <span className="text-xs">{station}</span>
      <span className={`${px} text-[6px] text-yellow-300`}>{player.score}pt</span>
    </div>
  );
}

// ── Help overlay ──────────────────────────────────────────────────────────────

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border-2 border-yellow-500 rounded-lg p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={`${px} text-yellow-400 text-[10px] mb-4 text-center`}>👑 HOW TO PLAY 👑</h2>

        <div className={`${px} text-[7px] text-slate-300 space-y-4 leading-relaxed`}>
          <section>
            <p className="text-yellow-300 mb-1">THE ROYAL PRINT SHOP</p>
            <p>You are a worker at the King's Printer of Canada — publisher of royal proclamations, acts of Parliament, and the Canada Gazette since 1841. Rush documents through the print shop before the Crown runs out of patience!</p>
          </section>

          <section>
            <p className="text-yellow-300 mb-2">STATIONS</p>
            <div className="space-y-1.5">
              <p>📄 PAPER STOCK — Pick up / drop documents</p>
              <p>⌨️ COMPOSITOR — Set the type (hold 2s)</p>
              <p>🖨️ ROLLING PRESS — Print the page (hold 2s)</p>
              <p>📬 ROYAL DISPATCH — Deliver for 10 pts!</p>
            </div>
          </section>

          <section>
            <p className="text-yellow-300 mb-2">WORKFLOW</p>
            <p>📄 → ⌨️ → 🖨️ → 📬</p>
            <p className="mt-1">Pick up from Paper Stock, typeset, press, then deliver. Drop at Paper Stock to pass to a teammate!</p>
          </section>

          <section>
            <p className="text-yellow-300 mb-1">DOCUMENTS</p>
            <p>📜 Royal Proclamation · 📋 Parliamentary Bill · 📰 Canada Gazette · 📑 Letters Patent</p>
            <p className="mt-1 text-red-400">Beware! Documents expire in 50 seconds.</p>
          </section>

          <section>
            <p className="text-yellow-300 mb-1">TIPS</p>
            <p>· Coordinate with teammates — split stations for speed!</p>
            <p>· Drop and hand off to save time</p>
            <p>· Watch the green timer bars on orders</p>
          </section>
        </div>

        <button
          onPointerDown={onClose}
          className={`${px} mt-5 w-full py-2 bg-yellow-600 hover:bg-yellow-500 text-black text-[8px] rounded border border-yellow-400`}
        >
          BACK TO WORK →
        </button>
      </div>
    </div>
  );
}

// ── Lobby screen ──────────────────────────────────────────────────────────────

function LobbyScreen({
  state,
  send,
  myOwner,
}: {
  state: KPState;
  send: (msg: Record<string, unknown> & { type: string }) => void;
  myOwner: string;
}) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="w-full h-full flex flex-col items-center justify-between bg-slate-950 p-4 overflow-y-auto">
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}

      <div className="flex flex-col items-center gap-4 mt-4">
        <div className="text-5xl">👑</div>
        <h1 className={`${px} text-yellow-400 text-[11px] text-center leading-relaxed`}>
          THE KING'S<br />PRINTER
        </h1>
        <p className={`${px} text-slate-400 text-[7px] text-center max-w-[240px] leading-relaxed`}>
          Rush royal documents through the print shop before time runs out!
        </p>
      </div>

      <div className="w-full max-w-xs">
        <p className={`${px} text-slate-500 text-[7px] mb-2 text-center`}>
          PLAYERS READY ({state.kpPlayers.length})
        </p>
        <div className="flex flex-col gap-1.5 mb-4">
          {state.kpPlayers.length === 0 && (
            <p className={`${px} text-slate-600 text-[7px] text-center`}>Waiting for players…</p>
          )}
          {state.kpPlayers.map((p) => (
            <div key={p.playerKey} className="flex items-center gap-2 bg-slate-800/60 rounded px-3 py-2">
              <span className="w-3 h-3 rounded-full" style={{ background: p.color }} />
              <span className={`${px} text-[8px] text-white`}>{p.playerKey === myOwner ? `${p.name} (you)` : p.name}</span>
            </div>
          ))}
        </div>

        <button
          onPointerDown={() => {
            chiptunePlayer.sfx('start');
            chiptunePlayer.start();
            send({ type: 'KP_START' });
          }}
          className={`${px} w-full py-3 bg-yellow-500 hover:bg-yellow-400 active:scale-95 text-black text-[9px] rounded-lg border-2 border-yellow-300 transition-transform`}
        >
          START PRINTING! →
        </button>

        <button
          onPointerDown={() => setShowHelp(true)}
          className={`${px} w-full py-2 mt-2 bg-transparent text-slate-500 text-[7px] border border-slate-700 rounded`}
        >
          ? HOW TO PLAY
        </button>
      </div>

      <p className={`${px} text-slate-700 text-[6px] text-center pb-2`}>
        King's Printer for Canada · Est. 1841
      </p>
    </div>
  );
}

// ── Game board ────────────────────────────────────────────────────────────────

function GameBoard({
  state,
  send,
  myOwner,
}: {
  state: KPState;
  send: (msg: Record<string, unknown> & { type: string }) => void;
  myOwner: string;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const prevFailed = useRef(state.kpFailed);
  const prevTime = useRef(state.kpTimeRemaining);

  // SFX on failure
  useEffect(() => {
    if (state.kpFailed > prevFailed.current) chiptunePlayer.sfx('fail');
    prevFailed.current = state.kpFailed;
  }, [state.kpFailed]);

  // Tick SFX in last 10 seconds
  useEffect(() => {
    if (state.kpTimeRemaining <= 10 && state.kpTimeRemaining < prevTime.current) {
      chiptunePlayer.sfx('tick');
    }
    prevTime.current = state.kpTimeRemaining;
  }, [state.kpTimeRemaining]);

  const myPlayer = state.kpPlayers.find((p) => p.playerKey === myOwner);
  const myHeldDoc = myPlayer?.holdingId ? state.kpDocuments.find((d) => d.id === myPlayer.holdingId) : undefined;

  const doAction = useCallback((station: KPStation) => {
    send({ type: 'KP_GOTO', station });
  }, [send]);

  const stations: KPStation[] = ['queue', 'typeset', 'press', 'deliver'];

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 overflow-hidden">
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 flex-shrink-0">
        <span className={`${px} text-yellow-400 text-[8px]`}>👑 KING'S PRINTER</span>
        <div className="flex items-center gap-3">
          <span className={`${px} text-[7px] text-green-400`}>🏆 {state.kpScore}</span>
          {state.kpFailed > 0 && <span className={`${px} text-[7px] text-red-400`}>✗ {state.kpFailed}</span>}
          <Timer seconds={state.kpTimeRemaining} />
          <button onPointerDown={() => setShowHelp(true)} className="text-slate-500 text-sm">?</button>
        </div>
      </div>

      {/* Document queue */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-slate-800">
        <p className={`${px} text-[6px] text-slate-500 mb-1.5`}>
          ACTIVE ORDERS ({state.kpDocuments.length})
        </p>
        {state.kpDocuments.length === 0 ? (
          <p className={`${px} text-[6px] text-slate-700`}>Awaiting orders from the Crown…</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {state.kpDocuments.map((doc) => (
              <DocCard key={doc.id} doc={doc} isHeldByMe={doc.id === myPlayer?.holdingId} />
            ))}
          </div>
        )}
      </div>

      {/* Station grid */}
      <div className="flex-1 p-3 grid grid-cols-2 gap-2.5 content-start">
        {stations.map((s) => (
          <StationButton
            key={s}
            station={s}
            myPlayer={myPlayer}
            docs={state.kpDocuments}
            onAction={doAction}
          />
        ))}
      </div>

      {/* Player status */}
      <div className="flex-shrink-0 px-3 pb-3 pt-1 border-t border-slate-800">
        {myHeldDoc && (
          <p className={`${px} text-[6px] text-yellow-300 mb-1.5`}>
            You hold: {DOC_ICONS[myHeldDoc.docType]} {DOC_LABELS[myHeldDoc.docType]}
            {' → '}
            {STATION_ICON[STEP_NEEDS[myHeldDoc.step]]} {STATION_LABEL[STEP_NEEDS[myHeldDoc.step]]}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {state.kpPlayers.map((p) => (
            <PlayerPill key={p.playerKey} player={p} isMe={p.playerKey === myOwner} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Game over screen ──────────────────────────────────────────────────────────

function GameOverScreen({
  state,
  send,
}: {
  state: KPState;
  send: (msg: Record<string, unknown> & { type: string }) => void;
}) {
  const delivered = state.kpScore / 10;
  const rating = delivered >= 12 ? '👑 ROYAL SEAL OF APPROVAL' :
    delivered >= 8 ? '🥇 COMMENDED' :
    delivered >= 4 ? '📜 ADEQUATE SERVICE' :
    '😅 THE CROWN IS DISPLEASED';

  useEffect(() => { chiptunePlayer.stop(); }, []);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-6 gap-6">
      <div className="text-5xl">🏰</div>
      <div className={`${px} text-yellow-400 text-[10px] text-center`}>PRESS CLOSED</div>
      <div className={`${px} text-[8px] text-center text-slate-300`}>{rating}</div>

      <div className="border border-slate-700 rounded-lg p-4 w-full max-w-xs space-y-2">
        <div className={`${px} text-[7px] flex justify-between text-white`}>
          <span>Documents delivered</span>
          <span className="text-green-400">{delivered}</span>
        </div>
        <div className={`${px} text-[7px] flex justify-between text-white`}>
          <span>Documents failed</span>
          <span className="text-red-400">{state.kpFailed}</span>
        </div>
        <div className={`${px} text-[7px] flex justify-between text-white border-t border-slate-700 pt-2`}>
          <span>Final score</span>
          <span className="text-yellow-300">{state.kpScore} pts</span>
        </div>
      </div>

      {/* Per-player scores */}
      {state.kpPlayers.length > 0 && (
        <div className="w-full max-w-xs space-y-1">
          {[...state.kpPlayers].sort((a, b) => b.score - a.score).map((p) => (
            <div key={p.playerKey} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
              <span className={`${px} text-[7px] text-slate-300 flex-1`}>{p.name}</span>
              <span className={`${px} text-[7px] text-yellow-300`}>{p.score} docs</span>
            </div>
          ))}
        </div>
      )}

      <button
        onPointerDown={() => {
          chiptunePlayer.start();
          send({ type: 'KP_RESET' });
        }}
        className={`${px} px-6 py-3 bg-yellow-500 text-black text-[9px] rounded-lg border-2 border-yellow-300 active:scale-95 transition-transform`}
      >
        PLAY AGAIN →
      </button>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export function KingsPrinterGame({ state, send, myOwner }: GameComponentProps<KPState>) {
  // Ensure player is joined when game connects
  useEffect(() => {
    // Music cleanup on unmount
    return () => chiptunePlayer.stop();
  }, []);

  if (state.kpPhase === 'finished') {
    return <GameOverScreen state={state} send={send} />;
  }

  if (state.kpPhase === 'playing') {
    return <GameBoard state={state} send={send} myOwner={myOwner} />;
  }

  return <LobbyScreen state={state} send={send} myOwner={myOwner} />;
}
