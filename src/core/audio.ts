/**
 * Minimal WebAudio kit. Each sound is generated procedurally — no sample
 * assets are shipped. The kit lazily creates the AudioContext on first
 * user interaction (iOS Safari requirement) and resumes a suspended
 * context on every play attempt.
 */

type Wave = OscillatorType;

class AudioKit {
  private ctx: AudioContext | null = null;
  enabled = true;

  /**
   * Ensure the context exists and is running. Returns null if disabled
   * or if the platform can't create an AudioContext.
   */
  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try { this.ctx = new Ctor(); } catch { return null; }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Schedule a short tone. Falls back silently if audio isn't available.
   */
  private tone(freq: number, dur = 0.06, type: Wave = 'sine', gain = 0.045): void {
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      amp.gain.setValueAtTime(0.0001, ctx.currentTime);
      amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(amp).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // Audio routing can fail mid-suspend on iOS; ignore.
    }
  }

  click(): void { this.tone(520, 0.045, 'square', 0.028); }

  place(): void {
    this.tone(320, 0.07, 'triangle', 0.04);
    window.setTimeout(() => this.tone(520, 0.05, 'sine', 0.028), 30);
  }

  drop(): void { this.tone(105, 0.16, 'sawtooth', 0.035); }
  bad():  void { this.tone(120, 0.12, 'square', 0.026); }

  win(): void {
    [523, 659, 784, 1046].forEach((f, i) => {
      window.setTimeout(() => this.tone(f, 0.12, 'sine', 0.042), i * 75);
    });
  }

  /** Manually unlock audio in response to a user gesture. */
  unlock(): void { this.ensure(); }
}

export const audio = new AudioKit();
