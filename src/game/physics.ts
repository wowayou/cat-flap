import { CAT, FAIRNESS, OBSTACLE, PHYSICS, TIMING } from './config.ts';

export interface Body {
  y: number;
  vy: number;
}

/** One semi-implicit Euler step: velocity first, then position. */
export function integrate(body: Body, dt: number): void {
  body.vy = Math.min(body.vy + PHYSICS.gravity * dt, PHYSICS.maxFallSpeed);
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
 * generated layout passable by a human-paced player.
 */
export function reachOver(duration: number): Reach {
  const dt = 1 / TIMING.simHz;
  const steps = Math.max(0, Math.round(duration / dt));
  const tapEvery = Math.max(1, Math.round(FAIRNESS.assumedTapInterval / dt));

  const up: Body = { y: 0, vy: 0 };
  let highest = 0;
  for (let i = 0; i < steps; i++) {
    if (i % tapEvery === 0) up.vy = PHYSICS.flapVelocity;
    integrate(up, dt);
    highest = Math.min(highest, up.y);
  }

  const down: Body = { y: 0, vy: PHYSICS.flapVelocity * FAIRNESS.dropStartFlapFraction };
  for (let i = 0; i < steps; i++) integrate(down, dt);

  return { climb: -highest, drop: down.y };
}

/**
 * Time the cat spends between leaving one obstacle and entering the next at a
 * given scroll speed — the window in which it has to change height.
 */
export function transitionTime(speed: number): number {
  const clear = OBSTACLE.spacing - OBSTACLE.capWidth - 2 * CAT.hitboxRadius;
  return Math.max(0, clear) / speed;
}
