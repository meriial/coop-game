import { useRef, useCallback } from 'react';

function getCtx(ref: React.MutableRefObject<AudioContext | null>): AudioContext | null {
  try {
    if (!ref.current) ref.current = new AudioContext();
    if (ref.current.state === 'suspended') void ref.current.resume();
    return ref.current;
  } catch {
    return null;
  }
}

function tone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  gain = 0.18,
  type: OscillatorType = 'sine',
): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  g.gain.setValueAtTime(gain, startTime);
  g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);
}

export function useSounds() {
  const ctxRef = useRef<AudioContext | null>(null);

  // Rising bleep — first flip (card revealed)
  const playBleep = useCallback(() => {
    const ctx = getCtx(ctxRef);
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.07);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.start(t);
    osc.stop(t + 0.13);
  }, []);

  // Descending boop — failed match
  const playBoop = useCallback(() => {
    const ctx = getCtx(ctxRef);
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.22);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.start(t);
    osc.stop(t + 0.23);
  }, []);

  // Two-note ascending bing — successful match
  const playBing = useCallback(() => {
    const ctx = getCtx(ctxRef);
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, 1047, t, 0.35, 0.16);         // C6
    tone(ctx, 1319, t + 0.09, 0.45, 0.12);  // E6
  }, []);

  // Ding-dong doorbell — user connected
  const playDoorbell = useCallback(() => {
    const ctx = getCtx(ctxRef);
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, 783, t, 0.45, 0.16);          // G5 — ding
    tone(ctx, 659, t + 0.48, 0.55, 0.12);  // E5 — dong
  }, []);

  return { playBleep, playBoop, playBing, playDoorbell };
}
