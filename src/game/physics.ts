import { CAT, FAIRNESS, GLIDE, OBSTACLE, PHYSICS, TIMING } from './config.ts';
import type { PhysicsRules } from './maps.ts';

export interface Body {
  y: number;
  vy: number;
}

/** One semi-implicit Euler step: velocity first, then position. */
export function integrate(body: Body, dt: number, physics: PhysicsRules = PHYSICS): void {
  body.vy = Math.min(body.vy + physics.gravity * dt, physics.maxFallSpeed);
  body.y += body.vy * dt;
}

/**
 * One step with the cape open: a fall faster than the glide is braked down
 * to it, a slower one (just past the top of a flap) settles into it under
 * gravity. Exact IEEE operations only, like `integrate`.
 */
export function glide(body: Body, dt: number, physics: PhysicsRules = PHYSICS): void {
  body.vy = body.vy > GLIDE.fallSpeed
    ? Math.max(GLIDE.fallSpeed, body.vy - GLIDE.brake * dt)
    : Math.min(GLIDE.fallSpeed, body.vy + physics.gravity * dt);
  body.y += body.vy * dt;
}

export interface Reach {
  /** Pixels the cat can rise (positive number). */
  climb: number;
  /** Pixels the cat can fall. */
  drop: number;
}

/**
 * How far the cat can move vertically in `duration` seconds, starting at rest,
 * using the real integrator at the real step size:
 *  - climb: tapping every `FAIRNESS.assumedTapInterval` from t=0;
 *  - drop: never tapping, starting mid-bob (moving up at
 *    `dropStartFlapFraction` of a flap) rather than at rest.
 * The obstacle generator stays inside this envelope, which is what makes every
 * generated layout passable by a human-paced player. Taps only: gliding is an
 * extra the player may use, never something a course requires.
 */
export function reachOver(duration: number, physics: PhysicsRules = PHYSICS): Reach {
  const dt = 1 / TIMING.simHz;
  const steps = Math.max(0, Math.round(duration / dt));
  const tapEvery = Math.max(1, Math.round(FAIRNESS.assumedTapInterval / dt));

  const up: Body = { y: 0, vy: 0 };
  let highest = 0;
  for (let i = 0; i < steps; i++) {
    if (i % tapEvery === 0) up.vy = physics.flapVelocity;
    integrate(up, dt, physics);
    highest = Math.min(highest, up.y);
  }

  const down: Body = { y: 0, vy: physics.flapVelocity * FAIRNESS.dropStartFlapFraction };
  for (let i = 0; i < steps; i++) integrate(down, dt, physics);

  return { climb: -highest, drop: down.y };
}

/**
 * Time the cat spends between leaving one obstacle and entering the next at a
 * given scroll speed — the window in which it has to change height. Wider
 * obstacles keep the same clear run after them, so this holds for every width.
 */
export function transitionTime(speed: number, spacing: number = OBSTACLE.spacing): number {
  const clear = spacing - OBSTACLE.capWidth - 2 * CAT.hitboxRadius;
  return Math.max(0, clear) / speed;
}
