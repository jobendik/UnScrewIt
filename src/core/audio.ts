/**
 * Minimal WebAudio kit. Each sound is generated procedurally — no sample
 * assets are shipped. The kit lazily creates the AudioContext on first
 * user interaction (iOS Safari requirement) and resumes a suspended
 * context on every play attempt.
 *
 * Pitch-shifted screw pops form a rising arpeggio as combo grows — this
 * is the single biggest "feel-good" trick in the genre.
 */

import { loadSave } from './save';

type Wave = OscillatorType;

const PENTATONIC = [392.00, 440.00, 523.25, 587.33, 659.25, 784.00, 880.00, 1046.50, 1174.66, 1318.51];

class AudioKit {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicHandle: number | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.85;
        this.masterGain.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.0;
        this.musicGain.connect(this.masterGain);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private get sfxOn(): boolean {
    return this.enabled && loadSave().settings.sound;
  }

  private get musicOn(): boolean {
    return this.enabled && loadSave().settings.music;
  }

  private tone(freq: number, dur = 0.06, type: Wave = 'sine', gain = 0.045): void {
    if (!this.sfxOn) return;
    const ctx = this.ensure();
    if (!ctx || !this.masterGain) return;
    try {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      amp.gain.setValueAtTime(0.0001, ctx.currentTime);
      amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(amp).connect(this.masterGain);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // ignore
    }
  }

  click(): void { this.tone(520, 0.045, 'square', 0.022); }

  /**
   * Screw pop — pitch rises with the combo level. After ~10 pops the pitch
   * resets to the bottom so it never gets shrill.
   */
  screwPop(combo: number): void {
    const idx = Math.max(0, (combo - 1) % PENTATONIC.length);
    const freq = PENTATONIC[idx] ?? PENTATONIC[0]!;
    this.tone(freq, 0.07, 'triangle', 0.045);
    window.setTimeout(() => this.tone(freq * 2, 0.045, 'sine', 0.018), 25);
  }

  /** Slot clear fanfare — three ascending sines. */
  slotClear(): void {
    [660, 880, 1175].forEach((f, i) =>
      window.setTimeout(() => this.tone(f, 0.1, 'sine', 0.05), i * 60),
    );
  }

  bucketFull(): void {
    this.tone(180, 0.16, 'square', 0.04);
  }

  blocked(): void {
    this.tone(110, 0.1, 'sawtooth', 0.024);
  }

  plateDrop(): void { this.tone(110, 0.18, 'sawtooth', 0.034); }
  coin(): void { this.tone(880, 0.06, 'sine', 0.035); }

  win(): void {
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      window.setTimeout(() => this.tone(f, 0.16, 'sine', 0.05), i * 80),
    );
  }

  fail(): void {
    this.tone(220, 0.2, 'sawtooth', 0.04);
    window.setTimeout(() => this.tone(180, 0.25, 'sawtooth', 0.035), 100);
  }

  unlock(): void {
    this.ensure();
  }

  // ── Procedural ambient pad ─────────────────────────────────────────────
  //
  // A slow chord cycle. Volume is ducked to near-silent on construction;
  // call `startMusic()` once to swell it in. Not a "real" song — just a
  // calm bed under the SFX so silent rooms aren't dead.

  startMusic(): void {
    if (!this.musicOn) return;
    const ctx = this.ensure();
    if (!ctx || !this.musicGain) return;
    if (this.musicHandle !== null) return;
    this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, ctx.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 1.5);
    const chords: number[][] = [
      [220, 277.18, 329.63],
      [196.00, 246.94, 293.66],
      [174.61, 220.00, 261.63],
      [196.00, 261.63, 329.63],
    ];
    let beat = 0;
    this.musicHandle = window.setInterval(() => {
      if (!this.musicOn) return;
      const chord = chords[beat % chords.length] ?? chords[0]!;
      this.playChord(chord);
      beat += 1;
    }, 3200);
  }

  stopMusic(): void {
    const ctx = this.ensure();
    if (this.musicHandle !== null) {
      window.clearInterval(this.musicHandle);
      this.musicHandle = null;
    }
    if (ctx && this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
      this.musicGain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.5);
    }
  }

  private playChord(freqs: number[]): void {
    const ctx = this.ensure();
    if (!ctx || !this.musicGain) return;
    const start = ctx.currentTime;
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, start);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.linearRampToValueAtTime(0.4, start + 0.4);
      amp.gain.linearRampToValueAtTime(0.0001, start + 3.0);
      osc.connect(amp).connect(this.musicGain);
      osc.start(start);
      osc.stop(start + 3.1);
    }
  }
}

export const audio = new AudioKit();
