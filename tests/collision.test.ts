import { describe, expect, it } from 'vitest';
import { circleHitsObstacle, circleHitsRect, type GapShape } from '../src/game/collision.ts';
import { CAT, FAIRNESS, OBSTACLE } from '../src/game/config.ts';
import { createRng } from '../src/game/rng.ts';

const r = CAT.hitboxRadius;
const ob: GapShape = { x: 200, gapY: 300, gap: 160 };
const gapTop = ob.gapY - ob.gap / 2;
const gapBottom = ob.gapY + ob.gap / 2;
const postL = ob.x + (OBSTACLE.capWidth - OBSTACLE.postWidth) / 2;
const postR = postL + OBSTACLE.postWidth;

/** The *drawn* silhouette: posts + caps, no forgiveness inset. */
const visibleRects: [number, number, number, number][] = [
  [postL, -1e5, postR, gapTop - OBSTACLE.capHeight],
  [ob.x, gapTop - OBSTACLE.capHeight, ob.x + OBSTACLE.capWidth, gapTop],
  [ob.x, gapBottom, ob.x + OBSTACLE.capWidth, gapBottom + OBSTACLE.capHeight],
  [postL, gapBottom + OBSTACLE.capHeight, postR, 1e5],
];

function distanceToVisible(cx: number, cy: number): number {
  let best = Infinity;
  for (const [l, t, rr, b] of visibleRects) {
    const dx = Math.max(l - cx, 0, cx - rr);
    const dy = Math.max(t - cy, 0, cy - b);
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

describe('circleHitsRect', () => {
  it('detects overlap and treats exact touching as a miss', () => {
    expect(circleHitsRect(0, 0, 10, 5, -5, 20, 5)).toBe(true);
    expect(circleHitsRect(0, 0, 10, 10, -5, 20, 5)).toBe(false);
    // Corner: distance √(8²+8²) ≈ 11.3 > 10
    expect(circleHitsRect(0, 0, 10, 8, 8, 20, 20)).toBe(false);
  });
});

describe('circleHitsObstacle', () => {
  it('is safe in the middle of the gap and fatal in a post', () => {
    expect(circleHitsObstacle(ob.x + 33, ob.gapY, r, ob)).toBe(false);
    expect(circleHitsObstacle(ob.x + 33, gapTop - 40, r, ob)).toBe(true);
    expect(circleHitsObstacle(ob.x + 33, gapBottom + 40, r, ob)).toBe(true);
  });

  it('never kills in the empty space beside a post (no cap-wide box)', () => {
    // Just outside the post, well above the top cap.
    const cx = postR + r + 1;
    expect(circleHitsObstacle(cx, gapTop - 120, r, ob)).toBe(false);
  });

  it('no ghost collisions: never a hit when the circle is clear of the drawn shape', () => {
    const rng = createRng(42);
    let checked = 0;
    for (let i = 0; i < 200_000; i++) {
      const cx = ob.x - 30 + rng() * (OBSTACLE.capWidth + 60);
      const cy = gapTop - 120 + rng() * (ob.gap + 240);
      const d = distanceToVisible(cx, cy);
      if (d >= r) {
        checked++;
        expect(circleHitsObstacle(cx, cy, r, ob)).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });

  it('no free passes: a clear overlap with the drawn shape always kills', () => {
    const rng = createRng(43);
    let checked = 0;
    for (let i = 0; i < 200_000; i++) {
      const cx = ob.x - 30 + rng() * (OBSTACLE.capWidth + 60);
      const cy = gapTop - 120 + rng() * (ob.gap + 240);
      // Overlapping the drawn shape by more than the forgiveness inset (×√2 for corners).
      if (distanceToVisible(cx, cy) < r - FAIRNESS.collisionInset * Math.SQRT2 - 0.01) {
        checked++;
        expect(circleHitsObstacle(cx, cy, r, ob)).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });
});
