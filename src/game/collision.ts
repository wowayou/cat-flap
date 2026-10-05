import { FAIRNESS, OBSTACLE } from './config.ts';

export interface GapShape {
  /** World x of the obstacle's left edge (the cap, its widest part). */
  x: number;
  /** Gap centre. */
  gapY: number;
  /** Gap height. */
  gap: number;
  /** Cap width (default: the standard cap). Posts are always this minus the standard overhang. */
  width?: number;
}

const FAR = 1e5;
/** How far a cap sticks out past its post on each side. */
const OVERHANG = (OBSTACLE.capWidth - OBSTACLE.postWidth) / 2;

/** Circle vs axis-aligned rect. Strict: exactly touching is not a hit. */
export function circleHitsRect(
  cx: number, cy: number, r: number,
  left: number, top: number, right: number, bottom: number,
): boolean {
  const nx = cx < left ? left : cx > right ? right : cx;
  const ny = cy < top ? top : cy > bottom ? bottom : cy;
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/**
 * Exact silhouette of an obstacle: narrow posts reaching off-screen plus the
 * wider caps at the gap edges, each shrunk by `collisionInset`. Using the
 * real silhouette (not one cap-wide box) is what prevents deaths in the empty
 * space beside a post.
 */
export function circleHitsObstacle(cx: number, cy: number, r: number, o: GapShape): boolean {
  const inset = FAIRNESS.collisionInset;
  const { capHeight } = OBSTACLE;
  const capWidth = o.width ?? OBSTACLE.capWidth;
  const gapTop = o.gapY - o.gap / 2;
  const gapBottom = o.gapY + o.gap / 2;

  const capL = o.x + inset;
  const capR = o.x + capWidth - inset;
  // Broad phase: nothing in this obstacle can be touched from further away.
  if (cx + r <= capL || cx - r >= capR) return false;

  // Offsets are summed before adding to x, so standard posts round exactly as they always have (replays depend on it).
  const postL = o.x + OVERHANG + inset;
  const postR = o.x + (capWidth - OVERHANG) - inset;

  return (
    circleHitsRect(cx, cy, r, capL, gapTop - capHeight + inset, capR, gapTop - inset) ||
    circleHitsRect(cx, cy, r, postL, -FAR, postR, gapTop - capHeight + inset) ||
    circleHitsRect(cx, cy, r, capL, gapBottom + inset, capR, gapBottom + capHeight - inset) ||
    circleHitsRect(cx, cy, r, postL, gapBottom + capHeight - inset, postR, FAR)
  );
}
