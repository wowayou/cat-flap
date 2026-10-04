import { DIFFICULTY } from '../game/config.ts';
import type { Game } from '../game/Game.ts';
import { DEFAULT_POSE, type CatPose } from './cat.ts';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Ripple phase speed (radians/s) of the cape. */
const RIPPLE_RATE = 9;

/**
 * Turns a cat's simulation state into a drawing pose: tilt that snaps up on
 * a flap and leans lazily into a dive, a cape streaming in the airflow,
 * squash and stretch, legs, face and tail. Presentation only — it reads the Game, never changes it.
 * One per drawn cat (the player and each ghost).
 */
export class CatAnimator {
  readonly pose: CatPose = { ...DEFAULT_POSE };
  private deathTilt = 0;
  private seenDeathAt = -Infinity;
  /** Offsets idle cycles (blink, tail) so ghosts don't move in lockstep with the player. */
  private readonly phase: number;

  constructor(phase = 0) {
    this.phase = phase;
  }

  /** A fresh cat: don't animate the belly-up pose spinning back upright. */
  reset(): void {
    Object.assign(this.pose, DEFAULT_POSE);
    this.deathTilt = 0;
    this.seenDeathAt = -Infinity;
  }

  update(game: Game, dt: number, animTime: number, reducedMotion = false): void {
    if (game.phase === 'paused') return;
    const p = this.pose;
    const cat = game.cat;
    const t = game.time;
    const anim = animTime + this.phase;
    const ease = (rate: number) => 1 - Math.exp(-rate * dt);

    if (game.phase === 'dying' || game.phase === 'gameover') {
      if (cat.deathAt !== this.seenDeathAt) {
        this.seenDeathAt = cat.deathAt;
        this.deathTilt = p.tilt;
      }
      // Lose control: spin belly-up while falling, land with a squash.
      const flip = clamp01((t - cat.deathAt) / 0.55);
      const e = 1 - (1 - flip) * (1 - flip);
      p.tilt = reducedMotion ? Math.PI : this.deathTilt + (Math.PI - this.deathTilt) * e;
      const q = cat.landed ? clamp01(1 - (t - cat.landAt) / 0.25) : 0;
      p.scaleX = 1 + (reducedMotion ? 0 : 0.2 * q);
      p.scaleY = 1 - (reducedMotion ? 0 : 0.2 * q);
      // Flapping loose in the fall; once down, it lies flat.
      p.cape += ((cat.landed ? 0 : 0.9) - p.cape) * ease(cat.landed ? 12 : 5);
      p.billow = cat.landed || reducedMotion ? 0 : 0.7;
      p.ripple = reducedMotion ? 0 : anim * RIPPLE_RATE;
      p.legs = 1;
      p.eyes = 'dead';
      p.mouth = 'tongue';
      p.tail = 0.4 + (cat.landed && !reducedMotion ? Math.sin(anim * 2) * 0.08 : 0);
      p.ears = 1;
      return;
    }

    const ready = game.phase === 'ready';
    const vy = ready ? 0 : cat.vy;
    const target = ready ? (reducedMotion ? 0 : Math.sin(anim * 1.7) * 0.04) : Math.max(-0.4, Math.min(0.85, vy * 0.0014));
    // Snap up on a flap, lean into a dive more lazily.
    p.tilt += (target - p.tilt) * ease(target < p.tilt ? 20 : 6);

    // The cape streams back against the cat's flight through the air (so it
    // lifts in a dive and presses flat to the back on a climb), lagging like
    // cloth; it can't fold down through the body. A flap sends a whip down it.
    const since = t - cat.flapAt;
    const vx = ready ? DIFFICULTY.baseSpeed : game.speed;
    const capeTarget = Math.max(-0.05, Math.min(1.3, Math.atan2(vy, vx) - p.tilt + 0.2));
    p.cape += (capeTarget - p.cape) * ease(9);
    p.billow = reducedMotion ? 0 : 0.3 + 0.7 * clamp01(1 - since / 0.45);
    p.ripple = reducedMotion ? 0 : anim * RIPPLE_RATE;

    const stretch = clamp01(1 - since / 0.16);
    const bonk = clamp01(1 - (t - cat.bonkAt) / 0.14);
    p.scaleX = reducedMotion ? 1 : 1 - 0.08 * stretch + 0.12 * bonk;
    p.scaleY = reducedMotion ? 1 : 1 + 0.1 * stretch - 0.12 * bonk;

    const legs = ready ? -0.15 : Math.max(-1, Math.min(1, vy / 420));
    p.legs += (legs - p.legs) * ease(18);
    const panic = vy > 560;
    p.eyes = panic ? 'wide' : (anim + 0.6) % 3.3 < 0.12 ? 'blink' : 'open';
    p.mouth = panic ? 'open' : 'smile';
    const tail = (reducedMotion ? 0 : Math.sin(anim * 3) * 0.12) + Math.max(-0.25, Math.min(0.25, -vy * 0.0005));
    p.tail += (tail - p.tail) * ease(7);
    p.ears = bonk * 0.6;
  }
}
