import type { Game } from '../game/Game.ts';
import { DEFAULT_POSE, type CatPose } from './cat.ts';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Ripple phase speed (radians/s) of the cape; a spread cape flutters faster in the airstream. */
const RIPPLE_RATE = 10;
const GLIDE_RIPPLE_RATE = 16;
/** How long the mouth stays open after eating a fish. */
const CHOMP = 0.2;

/**
 * Turns a cat's simulation state into a drawing pose: tilt that snaps up on
 * a flap and leans lazily into a dive, a cape streaming in the airflow (or
 * spread wide and fluttering in a glide, paws reaching ahead), squash and
 * stretch of the round body, paws, face, ears and tail, a chomp for a fish.
 * Presentation only — it reads the Game, never changes it. One per drawn
 * cat (the player and each ghost).
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
      // Lose control: roll belly-up while falling, land with a squash.
      const flip = clamp01((t - cat.deathAt) / 0.55);
      const e = 1 - (1 - flip) * (1 - flip);
      p.tilt = reducedMotion ? Math.PI : this.deathTilt + (Math.PI - this.deathTilt) * e;
      const q = cat.landed ? clamp01(1 - (t - cat.landAt) / 0.25) : 0;
      p.scaleX = 1 + (reducedMotion ? 0 : 0.22 * q);
      p.scaleY = 1 - (reducedMotion ? 0 : 0.2 * q);
      // Flapping loose in the fall; once down, it lies flat.
      p.cape += ((cat.landed ? -0.1 : 0.9) - p.cape) * ease(cat.landed ? 12 : 5);
      p.billow = cat.landed || reducedMotion ? 0 : 0.9;
      p.ripple = reducedMotion ? 0 : anim * RIPPLE_RATE;
      p.spread = 0;
      p.legs = 1;
      p.eyes = 'dead';
      p.mouth = 'tongue';
      p.tail = 0.5 + (cat.landed && !reducedMotion ? Math.sin(anim * 2) * 0.1 : 0);
      p.ears = 1;
      return;
    }

    const ready = game.phase === 'ready';
    const vy = ready ? 0 : cat.vy;
    const gliding = !ready && cat.gliding;
    // Opens fast as the cape catches the air; folds back a little slower.
    p.spread += ((gliding ? 1 : 0) - p.spread) * ease(gliding ? 22 : 12);
    const target = ready
      ? (reducedMotion ? 0 : Math.sin(anim * 1.7) * 0.05)
      : gliding ? 0.06 : Math.max(-0.4, Math.min(0.85, vy * 0.0014));
    // Snap up on a flap, lean into a dive more lazily.
    p.tilt += (target - p.tilt) * ease(target < p.tilt ? 20 : 6);

    // The cape streams back against the cat's flight through the air (so it
    // lifts in a dive and presses flat to the back on a climb), lagging like
    // cloth. A flap sends a bigger wave down it.
    const since = t - cat.flapAt;
    const vx = ready ? game.rules.difficulty.baseSpeed : game.speed;
    const capeTarget = gliding ? 0 : Math.max(-0.25, Math.min(1.2, Math.atan2(vy, vx) - p.tilt + 0.15));
    p.cape += (capeTarget - p.cape) * ease(9);
    p.billow = reducedMotion ? 0 : gliding ? 0.6 : 0.45 + 0.55 * clamp01(1 - since / 0.45);
    p.ripple = reducedMotion ? 0 : anim * (gliding ? GLIDE_RIPPLE_RATE : RIPPLE_RATE);

    // The round body stretches along the push of a flap and squashes on a bonk.
    const stretch = clamp01(1 - since / 0.18);
    const bonk = clamp01(1 - (t - cat.bonkAt) / 0.16);
    p.scaleX = reducedMotion ? 1 : 1 - 0.1 * stretch + 0.14 * bonk;
    p.scaleY = reducedMotion ? 1 : 1 + 0.12 * stretch - 0.14 * bonk;

    // Superhero flight: paws reach ahead on the way up and in a glide, drop when falling.
    const legs = ready ? -0.3 : gliding ? -1 : Math.max(-1, Math.min(1, vy / 420));
    p.legs += (legs - p.legs) * ease(18);
    const panic = vy > 560;
    p.eyes = bonk > 0 ? 'squint' : panic ? 'wide' : (anim + 0.6) % 3.3 < 0.12 ? 'blink' : 'open';
    p.mouth = panic || t - cat.fishAt < CHOMP ? 'open' : 'smile';
    const tail = (reducedMotion ? 0 : Math.sin(anim * 3) * 0.14) + (gliding ? -0.15 : Math.max(-0.3, Math.min(0.3, -vy * 0.0006)));
    p.tail += (tail - p.tail) * ease(7);
    p.ears = bonk * 0.7;
  }
}
