import { DIFFICULTY, OBSTACLE } from './config.ts';
import type { CourseRules, DifficultyRules } from './maps.ts';

type GapRules = Pick<CourseRules, 'gapStart' | 'gapMin' | 'gapShrinkPerPoint'>;

/** Scroll speed (px/s) for a score. Continuous ramp, capped. */
export function speedForScore(score: number, d: DifficultyRules = DIFFICULTY): number {
  return Math.min(d.maxSpeed, d.baseSpeed + score * d.speedPerPoint);
}

/** Gap height for a score. Shrinks slightly, never below the safe minimum. */
export function gapForScore(score: number, c: GapRules = OBSTACLE): number {
  return Math.max(c.gapMin, c.gapStart - score * c.gapShrinkPerPoint);
}
