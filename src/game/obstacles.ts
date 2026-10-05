import { CAT, FAIRNESS, FISH, OBSTACLE, WORLD } from './config.ts';
import type { GapShape } from './collision.ts';
import { gapForScore, speedForScore } from './difficulty.ts';
import { MAPS, type CourseRules, type MapRules } from './maps.ts';
import { reachOver, transitionTime } from './physics.ts';
import type { Rng } from './rng.ts';

export interface Obstacle extends GapShape {
  active: boolean;
  scored: boolean;
  /** Sequence number within the run (0 = first). */
  index: number;
  /** Cap width: the standard cap, or a long shelf. */
  width: number;
  /** Gap centre when the cat is level with the obstacle's middle. A bobbing gap's `gapY` moves around it. */
  passY: number;
  /** Bob amplitude (0: the gap stays still), phase (0–1) and wavelength (px of approach per cycle). */
  amp: number;
  phase: number;
  wavelength: number;
  /** A fish snack that comes with this obstacle, and whether it's been eaten. */
  fish: boolean;
  fishTaken: boolean;
  /**
   * Fish position. x is from the obstacle's left edge. A fish in the gap
   * keeps `fishY` from the gap's current centre (it bobs along with it); a
   * fish in the open run has an absolute `fishY`.
   */
  fishInGap: boolean;
  fishDx: number;
  fishY: number;
}

/** Where an obstacle's fish is right now. */
export function fishY(o: Obstacle): number {
  return o.fishInGap ? o.gapY + o.fishY : o.fishY;
}

export function createObstaclePool(size: number = OBSTACLE.poolSize): Obstacle[] {
  const pool: Obstacle[] = [];
  for (let i = 0; i < size; i++) {
    pool.push({
      active: false, scored: false, index: 0, x: 0, gapY: 0, gap: 0,
      width: OBSTACLE.capWidth, passY: 0, amp: 0, phase: 0, wavelength: 1,
      fish: false, fishTaken: false, fishInGap: false, fishDx: 0, fishY: 0,
    });
  }
  return pool;
}

/** Allowed range of gap centres for a gap height: never closer than `edgeMargin` to ceiling or ground. */
export function gapCenterRange(gap: number, edgeMargin: number = OBSTACLE.edgeMargin): { min: number; max: number } {
  return {
    min: WORLD.ceilingY + edgeMargin + gap / 2,
    max: WORLD.groundY - edgeMargin - gap / 2,
  };
}

/**
 * A freshly spawned obstacle is reached this many points later, so its
 * fairness check uses the (faster) speed the cat will actually face there.
 * Counted with standard widths: wider obstacles only mean fewer ahead, so
 * this errs towards assuming more speed (less reach), never less.
 */
export function obstaclesAhead(spacing: number): number {
  return Math.ceil((WORLD.width + OBSTACLE.spawnAhead - CAT.x) / spacing);
}

export const OBSTACLES_AHEAD = obstaclesAhead(OBSTACLE.spacing);

/**
 * A smooth up-and-down cycle in [-1, 1] with period 1 (a smoothed triangle
 * wave). Only exact IEEE operations, so a replay bobs identically in every
 * JS engine — `Math.sin` is not guaranteed to.
 */
export function bobWave(u: number): number {
  const f = u - Math.floor(u);
  const tri = 1 - Math.abs(2 * f - 1);
  return 2 * (tri * tri * (3 - 2 * tri)) - 1;
}

/** Steepest slope of `bobWave` per unit of u (2 × smoothstep's 1.5 × the triangle's 2). */
const BOB_MAX_SLOPE = 6;

/** Where a bobbing gap's centre is while the cat's hitbox centre is at world x `catX`. */
export function bobbedGapY(o: Pick<Obstacle, 'x' | 'width' | 'passY' | 'amp' | 'phase' | 'wavelength'>, catX: number): number {
  const d = o.x + o.width / 2 - catX;
  return o.passY + o.amp * (bobWave(d / o.wavelength + o.phase) - bobWave(o.phase));
}

/** The furthest a bobbing gap moves away from its pass height while the cat is inside it. */
export function bobDrift(amp: number, width: number, wavelength: number): number {
  return (amp * BOB_MAX_SLOPE * (width / 2 + CAT.hitboxRadius)) / wavelength;
}

export interface GapPlan {
  gapY: number;
  gap: number;
}

/** Room a bobbing gap needs: how far it travels above and below its pass height, and how much reach its drift costs. */
export interface BobAllowance {
  above: number;
  below: number;
  drift: number;
}

const STILL: BobAllowance = { above: 0, below: 0, drift: 0 };

/**
 * Pick the next gap given the previous one.
 *
 * The shift between consecutive gap centres is bounded three ways:
 *  1. the gap must stay inside `gapCenterRange` (for a bobbing gap: its whole travel);
 *  2. design caps (`maxShiftUp/Down`), scaled down for the first few
 *     obstacles so a new player's first seconds are gentle;
 *  3. the physics reach model: no more than `reachSafety` of what a cat
 *     tapping at a human pace can climb / fall in the time between gaps,
 *     minus however far bobbing gaps drift while the cat is inside them.
 *
 * (3) is what keeps layouts passable at a human tap rate; `tools/oracle.ts`
 * proves it per course (see `tests/fairness.test.ts`).
 */
export function planNextGap(
  prevGapY: number, index: number, score: number, rng: Rng,
  rules: MapRules = MAPS.garden, bob: BobAllowance = STILL,
): GapPlan {
  const c = rules.course;
  const gap = gapForScore(score, c);
  const range = gapCenterRange(gap, c.edgeMargin);
  const min = range.min + bob.above;
  const max = range.max - bob.below;

  if (index === 0) {
    const offset = (rng() * 2 - 1) * c.firstGapMaxOffset;
    return { gap, gapY: clamp(CAT.startY + offset, min, max) };
  }

  const speed = speedForScore(score + obstaclesAhead(c.spacing), rules.difficulty);
  const reach = reachOver(transitionTime(speed, c.spacing), rules.physics);
  const onboarding = Math.min(1, (index + 1) / (c.onboardingCount + 1));
  const up = Math.min(c.maxShiftUp * onboarding, reach.climb * FAIRNESS.reachSafety - bob.drift);
  const down = Math.min(c.maxShiftDown * onboarding, reach.drop * FAIRNESS.reachSafety - bob.drift);

  const lo = Math.max(min, prevGapY - up);
  const hi = Math.min(max, prevGapY + down);
  if (lo >= hi) return { gap, gapY: clamp(prevGapY, min, max) };
  return { gap, gapY: lo + rng() * (hi - lo) };
}

export interface ObstaclePlan extends GapPlan {
  width: number;
  amp: number;
  phase: number;
  wavelength: number;
  /** How far this gap can drift while the cat is inside it (0 when still). */
  drift: number;
}

/**
 * The whole next obstacle: its shape for this map (a long shelf? a bobbing
 * gap?) and then its gap. The first `onboardingCount` obstacles are always
 * plain. Draws nothing extra from the rng on the garden, whose courses stay
 * exactly what they were before maps existed.
 */
export function planObstacle(
  prevGapY: number, prevDrift: number, index: number, score: number, rng: Rng, rules: MapRules,
): ObstaclePlan {
  const c = rules.course;
  const plain = index < c.onboardingCount;
  let amp = 0;
  let phase = 0;
  let wavelength = 1;
  if (c.motion && !plain && rng() < c.motion.chance) {
    amp = c.motion.amplitude;
    phase = rng();
    wavelength = c.motion.wavelength;
  }
  const width = c.shelves && !plain ? pickWidth(c.shelves, rng()) : OBSTACLE.capWidth;
  const w0 = amp > 0 ? bobWave(phase) : 0;
  const drift = amp > 0 ? bobDrift(amp, width, wavelength) : 0;
  const bob = amp > 0 || prevDrift > 0 ? { above: amp * (1 + w0), below: amp * (1 - w0), drift: drift + prevDrift } : STILL;
  const plan = planNextGap(prevGapY, index, score, rng, rules, bob);
  return { gapY: plan.gapY, gap: plan.gap, width, amp, phase, wavelength, drift };
}

export type FishPlan = Pick<Obstacle, 'fish' | 'fishInGap' | 'fishDx' | 'fishY'>;

/**
 * Where (if anywhere) the fish for an obstacle goes, given its plan and the
 * previous gap's pass height. Always draws exactly three numbers from its
 * own stream, so fish never shift anything else.
 *  - in the gap: at the obstacle's middle, anywhere up to `gapInset` (plus
 *    the cat's radius) from the caps — near an edge it's a dare;
 *  - in the open run before it: midway between the two obstacles, off the
 *    line between their gaps by up to `wander`, inside the field.
 */
export function planFish(plan: ObstaclePlan, prevGapY: number, index: number, spacing: number, fishRng: Rng): FishPlan {
  const place = fishRng();
  const where = fishRng();
  const u = fishRng() * 2 - 1;
  if (index === 0 || place >= FISH.chance) return { fish: false, fishInGap: false, fishDx: 0, fishY: 0 };
  if (where < FISH.inGap) {
    const reach = plan.gap / 2 - CAT.hitboxRadius - FISH.gapInset;
    return { fish: true, fishInGap: true, fishDx: plan.width / 2, fishY: u * reach };
  }
  const clear = spacing - OBSTACLE.capWidth;
  const y = (prevGapY + plan.gapY) / 2 + u * FISH.wander;
  return { fish: true, fishInGap: false, fishDx: -clear / 2, fishY: clamp(y, WORLD.ceilingY + FISH.edgeMargin, WORLD.groundY - FISH.edgeMargin) };
}

function pickWidth(shelves: NonNullable<CourseRules['shelves']>, u: number): number {
  let total = 0;
  for (const w of shelves.weights) total += w;
  let acc = 0;
  for (let i = 0; i < shelves.widths.length; i++) {
    acc += shelves.weights[i];
    if (u * total < acc) return shelves.widths[i];
  }
  return shelves.widths[shelves.widths.length - 1];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
