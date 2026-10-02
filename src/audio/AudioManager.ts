import { SFX, type SfxName } from './sfx.ts';

type AudioContextCtor = typeof AudioContext;

/**
 * Owns the AudioContext. Browsers only let audio start inside a user
 * gesture, so the context is created lazily by `unlock()`, which input calls
 * on every press. Muting sets the master gain to 0 (instant, no clicks) and
 * the game keeps working identically with sound off or unavailable.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  unlock(): void {
    if (!this.ctx) {
      const Ctor: AudioContextCtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      // A gentle limiter so overlapping sounds never clip.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      limiter.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      this.master.connect(limiter);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.01);
  }

  play(name: SfxName, delay = 0): void {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    try {
      SFX[name](this.ctx, this.master, this.ctx.currentTime + 0.005 + delay);
    } catch {
      // Never let audio break the game.
    }
  }

  /** Called when the page is hidden. */
  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend().catch(() => {});
  }
}
