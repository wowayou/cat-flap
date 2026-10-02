import { TIMING } from './config.ts';

/**
 * Fixed-timestep accumulator. Real frame times of any length are turned into
 * whole simulation steps of exactly 1/simHz, so a 30 Hz phone and a 144 Hz
 * monitor run identical physics; the leftover fraction is returned for
 * render interpolation.
 */
export class FixedStepLoop {
  readonly stepDt = 1 / TIMING.simHz;
  private acc = 0;

  /** Feed one real frame's duration (seconds). Returns the interpolation factor in [0, 1). */
  advance(frameDt: number, step: (dt: number) => void): number {
    const dt = Math.min(Math.max(frameDt, 0), TIMING.maxFrameDt);
    this.acc += dt;
    // Tiny epsilon so float error never turns "exactly one step" into zero steps.
    while (this.acc >= this.stepDt - 1e-9) {
      step(this.stepDt);
      this.acc -= this.stepDt;
    }
    if (this.acc < 0) this.acc = 0;
    return this.acc / this.stepDt;
  }

  reset(): void {
    this.acc = 0;
  }
}
