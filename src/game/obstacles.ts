import { CAT, FAIRNESS, OBSTACLE, WORLD } from './config.ts';
import type { GapShape } from './collision.ts';
import { gapForScore, speedForScore } from './difficulty.ts';
import { reachOver, transitionTime } from './physics.ts';
import type { Rng } from './rng.ts';

export interface Obstacle extends GapShape {
  active: boolean;
  scored: boolean;
  /** Sequence number within the run (0 = first). */
  index: number;
}

export function createObstaclePool(size: number = OBSTACLE.poolSize): Obstacle[] {
  const pool: Obstacle[] = [];
  for (let i = 0; i < size; i++) {
    pool.push({ active: false, scored: false, index: 0, x: 0, gapY: 0, gap: 0 });
  }
  return pool;
}

/** Allowed range of gap centres for a gap height: never closer than `edgeMargin` to ceiling or ground. */
export function gapCenterRange(gap: number): { min: number; max: number } {
  return {
    min: WORLD.ceilingY + OBSTACLE.edgeMargin + gap / 2,
    max: WORLD.groundY - OBSTACLE.edgeMargin - gap / 2,
  };
}

/**
 * A freshly spawned obstacle is reached this many points later, so its
 * fairness check uses the (faster) speed the cat will actually face there.
 */
export const OBSTACLES_AHEAD = Math.ceil(
  (WORLD.width + OBSTACLE.spawnAhead - CAT.x) / OBSTACLE.spacing,
);

export interface GapPlan {
  gapY: number;
  gap: number;
}

/**
 * Pick the next gap given the previous one.
 *
 * The shift between consecutive gap centres is bounded three ways:
 *  1. the gap must stay inside `gapCenterRange`;
 *  2. design caps (`maxShiftUp/Down`), scaled down for the first few
 *     obstacles so a new player's first seconds are gentle;
 *  3. the physics reach model: no more than `reachSafety` of what a cat
 *     tapping at a human pace can climb / fall in the time between gaps.
 *
 * (3) is what keeps layouts passable at a human tap rate; `tools/oracle.ts`
 * proves it per course (see `tests/fairness.test.ts`).
 */
export function planNextGap(prevGapY: number, index: number, score: number, rng: Rng): GapPlan {
  const gap = gapForScore(score);
  const range = gapCenterRange(gap);

  if (index === 0) {
    const offset = (rng() * 2 - 1) * OBSTACLE.firstGapMaxOffset;
    return { gap, gapY: clamp(CAT.startY + offset, range.min, range.max) };
  }

  const reach = reachOver(transitionTime(speedForScore(score + OBSTACLES_AHEAD)));
  const onboarding = Math.min(1, (index + 1) / (OBSTACLE.onboardingCount + 1));
  const up = Math.min(OBSTACLE.maxShiftUp * onboarding, reach.climb * FAIRNESS.reachSafety);
  const down = Math.min(OBSTACLE.maxShiftDown * onboarding, reach.drop * FAIRNESS.reachSafety);

  const lo = Math.max(range.min, prevGapY - up);
  const hi = Math.min(range.max, prevGapY + down);
  if (lo >= hi) return { gap, gapY: clamp(prevGapY, range.min, range.max) };
  return { gap, gapY: lo + rng() * (hi - lo) };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
