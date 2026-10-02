import { DIFFICULTY, OBSTACLE } from './config.ts';

/** Scroll speed (px/s) for a score. Continuous ramp, capped. */
export function speedForScore(score: number): number {
  return Math.min(DIFFICULTY.maxSpeed, DIFFICULTY.baseSpeed + score * DIFFICULTY.speedPerPoint);
}

/** Gap height for a score. Shrinks slightly, never below the safe minimum. */
export function gapForScore(score: number): number {
  return Math.max(OBSTACLE.gapMin, OBSTACLE.gapStart - score * OBSTACLE.gapShrinkPerPoint);
}
