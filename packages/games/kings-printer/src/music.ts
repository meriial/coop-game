type Note = { freq: number; dur: number }; // dur in seconds

const R = 0; // rest
const BPM = 128;
const B = 60 / BPM; // one beat = ~0.469s

// Royal march melody — 2-bar loop
const MELODY: Note[] = [
  { freq: 392, dur: B * 0.5 }, // G4
  { freq: 523, dur: B * 0.5 }, // C5
  { freq: 494, dur: B },        // B4
  { freq: 440, dur: B },        // A4
  { freq: 392, dur: B * 0.5 }, // G4
  { freq: 440, dur: B * 0.5 }, // A4
  { freq: 494, dur: B * 2 },   // B4
  { freq: 392, dur: B * 0.5 }, // G4
  { freq: 330, dur: B * 0.5 }, // E4
  { freq: 294, dur: B },        // D4
  { freq: 330, dur: B },        // E4
  { freq: 392, dur: B * 0.5 }, // G4
  { freq: 440, dur: B * 0.5 }, // A4
  { freq: 392, dur: B * 1.5 }, // G4
  { freq: R,   dur: B * 0.5 }, // rest
];

const BASS: Note[] = [
  { freq: 131, dur: B * 2 }, // C3
  { freq: 147, dur: B * 2 }, // D3
  { freq: 165, dur: B * 2 }, // E3
  { freq: 147, dur: B * 2 }, // D3
  { freq: 131, dur: B * 2 }, // C3
  { freq: 110, dur: B * 2 }, // A2
  { freq: 131, dur: B * 4 }, // C3
];

function scheduleVoice(
  ctx: AudioContext,
  notes: Note[],
  startTime: number,
  type: OscillatorType,
  gain: number,
): number {
  let t = startTime;
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, t);
  gainNode.connect(ctx.destination);

  for (const note of notes) {
    if (note.freq === R) {
      gainNode.gain.setValueAtTime(0, t);
      t += note.dur;
      continue;
    }
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(note.freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.setValueAtTime(gain, t + note.dur - 0.03);
    g.gain.linearRampToValueAtTime(0, t + note.dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + note.dur);
    t += note.dur;
  }
  return t; // time when this voice finishes
}

function totalDur(notes: Note[]): number {
  return notes.reduce((s, n) => s + n.dur, 0);
}

export class ChiptunePlayer {
  private actx: AudioContext | null = null;
  private loopTimeout: ReturnType<typeof setTimeout> | null = null;
  private playing = false;

  start() {
    if (this.playing) return;
    this.playing = true;
    this.actx = new AudioContext();
    this.scheduleLoop(this.actx.currentTime);
  }

  stop() {
    this.playing = false;
    if (this.loopTimeout) clearTimeout(this.loopTimeout);
    this.loopTimeout = null;
    this.actx?.close();
    this.actx = null;
  }

  private scheduleLoop(startAt: number) {
    if (!this.playing || !this.actx) return;
    const ctx = this.actx;

    const melodyDur = totalDur(MELODY);
    const bassDur = totalDur(BASS);
    const loopDur = Math.max(melodyDur, bassDur);

    scheduleVoice(ctx, MELODY, startAt, 'square', 0.08);
    scheduleVoice(ctx, BASS, startAt, 'square', 0.05);

    // Schedule next loop just before this one ends
    const msUntilNext = Math.max(0, (startAt + loopDur - ctx.currentTime - 0.1) * 1000);
    this.loopTimeout = setTimeout(() => {
      if (this.playing && this.actx) {
        this.scheduleLoop(startAt + loopDur);
      }
    }, msUntilNext);
  }

  sfx(kind: 'pickup' | 'process' | 'deliver' | 'fail' | 'start' | 'tick') {
    if (!this.actx) {
      // Create a one-shot context for SFX even when music is off
      const ctx = new AudioContext();
      this.playSfx(ctx, kind, ctx.currentTime);
      setTimeout(() => ctx.close(), 2000);
      return;
    }
    this.playSfx(this.actx, kind, this.actx.currentTime);
  }

  private playSfx(ctx: AudioContext, kind: string, t: number) {
    const play = (freq: number, dur: number, gain = 0.15, type: OscillatorType = 'square') => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.01);
      g.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    };

    switch (kind) {
      case 'pickup':
        play(440, 0.08); play(554, 0.08); break;
      case 'process':
        play(330, 0.06); play(392, 0.06); play(494, 0.1); break;
      case 'deliver':
        play(523, 0.1); play(659, 0.1); play(784, 0.2, 0.2); break;
      case 'fail':
        play(220, 0.08); play(185, 0.08); play(147, 0.18, 0.15); break;
      case 'start':
        play(392, 0.1); play(494, 0.1); play(523, 0.1); play(659, 0.2, 0.2); break;
      case 'tick':
        play(880, 0.04, 0.05); break;
    }
  }
}

export const chiptunePlayer = new ChiptunePlayer();
