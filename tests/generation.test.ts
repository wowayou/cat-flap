import { describe, expect, it } from 'vitest';
import { CAT, FAIRNESS, OBSTACLE, WORLD } from '../src/game/config.ts';
import { gapForScore, speedForScore } from '../src/game/difficulty.ts';
import { gapCenterRange, OBSTACLES_AHEAD, planNextGap } from '../src/game/obstacles.ts';
import { reachOver, transitionTime } from '../src/game/physics.ts';
import { createRng } from '../src/game/rng.ts';

describe('difficulty curve', () => {
  it('speed rises then caps; gap shrinks then floors', () => {
    expect(speedForScore(0)).toBeLessThan(speedForScore(10));
    expect(speedForScore(10)).toBeLessThan(speedForScore(20));
    expect(speedForScore(1000)).toBe(speedForScore(10_000));
    expect(gapForScore(0)).toBe(OBSTACLE.gapStart);
    expect(gapForScore(10_000)).toBe(OBSTACLE.gapMin);
    expect(OBSTACLE.gapMin).toBeGreaterThan(CAT.hitboxRadius * 2 * 4);
  });
});

describe('planNextGap', () => {
  it('keeps every gap inside the playfield with margins, within the reach envelope', () => {
    const rng = createRng(1);
    for (let run = 0; run < 200; run++) {
      let prev: number = CAT.startY;
      for (let index = 0; index < 120; index++) {
        const score = Math.max(0, index - OBSTACLES_AHEAD);
        const plan = planNextGap(prev, index, score, rng);
        const range = gapCenterRange(plan.gap);
        expect(plan.gap).toBeGreaterThanOrEqual(OBSTACLE.gapMin);
        expect(plan.gapY).toBeGreaterThanOrEqual(range.min);
        expect(plan.gapY).toBeLessThanOrEqual(range.max);
        expect(plan.gapY - plan.gap / 2).toBeGreaterThanOrEqual(WORLD.ceilingY + OBSTACLE.edgeMargin - 1e-9);
        expect(plan.gapY + plan.gap / 2).toBeLessThanOrEqual(WORLD.groundY - OBSTACLE.edgeMargin + 1e-9);

        if (index === 0) {
          expect(Math.abs(plan.gapY - CAT.startY)).toBeLessThanOrEqual(OBSTACLE.firstGapMaxOffset + 1e-9);
        } else {
          const reach = reachOver(transitionTime(speedForScore(score + OBSTACLES_AHEAD)));
          const shift = plan.gapY - prev;
          expect(-shift).toBeLessThanOrEqual(Math.min(OBSTACLE.maxShiftUp, reach.climb * FAIRNESS.reachSafety) + 1e-9);
          expect(shift).toBeLessThanOrEqual(Math.min(OBSTACLE.maxShiftDown, reach.drop * FAIRNESS.reachSafety) + 1e-9);
        }
        prev = plan.gapY;
      }
    }
  });

  it('eases in: the first obstacles move less than later ones', () => {
    const rng = createRng(2);
    const early: number[] = [];
    const late: number[] = [];
    for (let run = 0; run < 400; run++) {
      let prev: number = CAT.startY;
      for (let index = 0; index < 12; index++) {
        const plan = planNextGap(prev, index, index, rng);
        (index <= 2 ? early : index >= 6 ? late : []).push(Math.abs(plan.gapY - prev));
        prev = plan.gapY;
      }
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(early)).toBeLessThan(mean(late) * 0.7);
  });

  it('is varied, not a flat corridor', () => {
    const rng = createRng(3);
    const ys: number[] = [];
    let prev: number = CAT.startY;
    for (let index = 0; index < 500; index++) {
      prev = planNextGap(prev, index, 30, rng).gapY;
      if (index > 5) ys.push(prev);
    }
    const range = Math.max(...ys) - Math.min(...ys);
    const range0 = gapCenterRange(gapForScore(30));
    expect(range).toBeGreaterThan((range0.max - range0.min) * 0.9);
  });
});
