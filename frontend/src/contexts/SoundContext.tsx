import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

function getCtx(ref: React.MutableRefObject<AudioContext | null>): AudioContext | null {
  try {
    if (!ref.current) ref.current = new AudioContext();
    if (ref.current.state === 'suspended') void ref.current.resume();
    return ref.current;
  } catch {
    return null;
  }
}

function tone(ctx: AudioContext, freq: number, startTime: number, duration: number, gain = 0.18, type: OscillatorType = 'sine'): void {
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

interface SoundContextValue {
  muted: boolean;
  toggleMute: () => void;
  playBleep: () => void;
  playBoop: () => void;
  playBing: () => void;
  playDoorbell: () => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);

  const toggleMute = useCallback(() => setMuted(m => !m), []);

  const playBleep = useCallback(() => {
    if (muted) return;
    const ctx = getCtx(ctxRef);
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.07);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.start(t); osc.stop(t + 0.13);
  }, [muted]);

  const playBoop = useCallback(() => {
    if (muted) return;
    const ctx = getCtx(ctxRef);
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.22);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.start(t); osc.stop(t + 0.23);
  }, [muted]);

  const playBing = useCallback(() => {
    if (muted) return;
    const ctx = getCtx(ctxRef);
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, 1047, t, 0.35, 0.16);
    tone(ctx, 1319, t + 0.09, 0.45, 0.12);
  }, [muted]);

  const playDoorbell = useCallback(() => {
    if (muted) return;
    const ctx = getCtx(ctxRef);
    if (!ctx) return;
    const t = ctx.currentTime;
    tone(ctx, 783, t, 0.45, 0.16);
    tone(ctx, 659, t + 0.48, 0.55, 0.12);
  }, [muted]);

  return (
    <SoundContext.Provider value={{ muted, toggleMute, playBleep, playBoop, playBing, playDoorbell }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSoundContext(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error('useSoundContext used outside SoundProvider');
  return ctx;
}
