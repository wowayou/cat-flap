/**
 * Passability oracle: decides whether a seeded course can be survived by
 * *some* tap schedule whose taps are at least `tapInterval` apart — a
 * human-paced player with perfect timing. This is the hard evidence behind
 * "every generated layout is passable".
 *
 * 1. Record the course. Drive a real `Game`, puppeteering the cat to the
 *    centre of the upcoming gap every step so it can't die, and log every
 *    obstacle (its width, and how a bobbing gap moves). Horizontal motion
 *    (scroll, score, speed) doesn't depend on the cat's height, so it is
 *    recorded too and shared by all trajectories — and so is where every
 *    bobbing gap is at each step, since that is keyed to the scroll.
 *
 * 2. Per step, compute the band of hitbox-centre heights that touch nothing
 *    (using the real collision function on the obstacles as they are at that
 *    step), with the ceiling treated as fatal — stricter than the game,
 *    which only bonks. Taps only: gliding is never needed, so it isn't modelled.
 *
 * 3. Search. A tap *sets* vertical speed and the integrator is linear in y,
 *    so the arc after a tap at height y is y + s[i] for one fixed offset
 *    table s: the whole future after a tap depends only on (step, height).
 *    Depth-first: follow an arc through the safe bands, collect every step
 *    where another tap is allowed, try the most promising first (closest to
 *    a comfortable height for the next gap), backtrack on failure. States are
 *    visited once per (step, 1px bucket), keeping the *actual* height — so
 *    any surviving path is real physics and "passable" is a sound proof,
 *    while merging can only hide solutions, so "impossible" is conservative.
 *    Exhaustive over that state space either way; the ordering only makes
 *    the common (passable) case fast.
 */
import { circleHitsObstacle, type GapShape } from '../src/game/collision.ts';
import { CAT, OBSTACLE, TIMING, WORLD } from '../src/game/config.ts';
import { Game } from '../src/game/Game.ts';
import { MAPS, type MapId, type PhysicsRules } from '../src/game/maps.ts';
import { integrate, type Body } from '../src/game/physics.ts';
import { bobbedGapY, type Obstacle } from '../src/game/obstacles.ts';

const DT = 1 / TIMING.simHz;
const EPS = 1e-6;

export type CourseObstacle = Pick<Obstacle, 'index' | 'x' | 'gap' | 'width' | 'passY' | 'amp' | 'phase' | 'wavelength'>;

export interface Course {
  map: MapId;
  seed: number;
  obstacles: CourseObstacle[];
  /** scroll[k] = Game.scroll after step k (what collision uses during step k). */
  scroll: Float64Array;
  /** Height of the run's first flap. */
  startY: number;
}

/** Record a course by playing it with an invulnerable puppet cat until `targetScore`. */
export function recordCourse(seed: number, targetScore: number, map: MapId = 'garden'): Course {
  const game = new Game(seed, map);
  const startY = game.cat.y;
  game.flap();
  const obstacles: CourseObstacle[] = [];
  const seen = new Set<number>();
  const scroll: number[] = [];

  while (game.score < targetScore) {
    const next = game.upcomingObstacle();
    game.cat.y = next ? next.gapY : CAT.startY;
    game.cat.vy = 0;
    game.step(DT);
    if (game.phase !== 'playing') throw new Error(`puppet died on seed ${seed} at score ${game.score}`);
    scroll.push(game.scroll);
    for (const o of game.obstacles) {
      if (o.active && !seen.has(o.index)) {
        seen.add(o.index);
        const { index, x, gap, width, passY, amp, phase, wavelength } = o;
        obstacles.push({ index, x, gap, width, passY, amp, phase, wavelength });
      }
    }
  }
  obstacles.sort((a, b) => a.index - b.index);
  return { map, seed, obstacles, scroll: Float64Array.from(scroll), startY };
}

/** An obstacle's shape while the cat's hitbox centre is at world x `cx` (where a bobbing gap is then). */
function shapeAt(o: CourseObstacle, cx: number): GapShape {
  return { x: o.x, width: o.width, gap: o.gap, gapY: o.amp > 0 ? bobbedGapY(o, cx) : o.passY };
}

/** Safe band of hitbox-centre heights for every step of the course. */
export function safeBands(course: Course): { lo: Float64Array; hi: Float64Array } {
  const n = course.scroll.length;
  const lo = new Float64Array(n);
  const hi = new Float64Array(n);
  const r = CAT.hitboxRadius;
  let first = 0;
  for (let k = 0; k < n; k++) {
    const cx = course.scroll[k] + CAT.x;
    let l = WORLD.ceilingY + r + EPS;
    let h = WORLD.groundY - r - EPS;
    while (first < course.obstacles.length && course.obstacles[first].x + course.obstacles[first].width + r < cx) first++;
    for (let i = first; i < course.obstacles.length && course.obstacles[i].x - r < cx; i++) {
      const o = shapeAt(course.obstacles[i], cx);
      if (circleHitsObstacle(cx, o.gapY, r, o)) {
        l = Infinity; // the gap centre itself is blocked: no safe height at all
        break;
      }
      l = Math.max(l, boundary(cx, o, o.gapY - o.gap / 2 - OBSTACLE.capHeight - 2 * r, o.gapY));
      h = Math.min(h, boundary(cx, o, o.gapY + o.gap / 2 + OBSTACLE.capHeight + 2 * r, o.gapY));
    }
    lo[k] = l;
    hi[k] = h;
  }
  return { lo, hi };
}

/**
 * Binary-search the collision boundary between `blocked` (inside an obstacle
 * part) and `free` (the gap centre). Returns a height on the free side.
 * Relies on each half of an obstacle being "solid outward" at any x, which
 * holds because the cap overhang is narrower than the hitbox radius.
 */
function boundary(cx: number, o: GapShape, blocked: number, free: number): number {
  const r = CAT.hitboxRadius;
  if (!circleHitsObstacle(cx, blocked, r, o)) {
    // Beside the obstacle at this x: nothing blocks between here and the gap.
    return blocked < free ? -Infinity : Infinity;
  }
  let a = blocked;
  let b = free;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (circleHitsObstacle(cx, m, r, o)) a = m;
    else b = m;
  }
  return b + (blocked < free ? EPS : -EPS);
}

/** Offsets of the arc after a tap: s[i] = displacement after i steps. */
function arcOffsets(maxSteps: number, physics: PhysicsRules): Float64Array {
  const s = new Float64Array(maxSteps + 1);
  const body: Body = { y: 0, vy: physics.flapVelocity };
  for (let i = 1; i <= maxSteps; i++) {
    integrate(body, DT, physics);
    s[i] = body.y;
  }
  return s;
}

export interface OracleResult {
  passable: boolean;
  /** Furthest step any trajectory survived to. */
  furthestStep: number;
  totalSteps: number;
  statesExplored: number;
}

const BUCKET_PX = 1;

export function provePassable(course: Course, tapInterval: number): OracleResult {
  const total = course.scroll.length;
  const cooldown = Math.max(1, Math.round(tapInterval / DT));
  const physics = MAPS[course.map].physics;
  const { lo, hi } = safeBands(course);
  const aim = aimHeights(course, physics);
  const maxArc = 3 * TIMING.simHz; // ceiling → ground takes well under 3s, even in low gravity
  const s = arcOffsets(maxArc, physics);
  const nBuckets = Math.ceil(WORLD.height / BUCKET_PX) + 1;
  const visited = new Uint8Array(total * nBuckets);

  const stackStep: number[] = [0];
  const stackY: number[] = [course.startY];
  const candStep: number[] = [];
  const candY: number[] = [];
  const order: number[] = [];

  let furthest = 0;
  let explored = 0;
  while (stackStep.length > 0) {
    const k = stackStep.pop()!;
    const y0 = stackY.pop()!;
    explored++;
    candStep.length = 0;
    candY.length = 0;
    for (let i = 1; i <= maxArc; i++) {
      const j = k + i - 1; // the step that produces offset s[i]
      const y = y0 + s[i];
      if (y < lo[j] || y > hi[j]) break;
      if (j + 1 > furthest) furthest = j + 1;
      if (j + 1 >= total) return { passable: true, furthestStep: total, totalSteps: total, statesExplored: explored };
      if (i >= cooldown) {
        const key = (j + 1) * nBuckets + Math.round(y / BUCKET_PX);
        if (visited[key]) continue;
        visited[key] = 1;
        candStep.push(j + 1);
        candY.push(y);
      }
    }
    // Push worst first so the best candidate is popped next.
    order.length = 0;
    for (let c = 0; c < candStep.length; c++) order.push(c);
    order.sort((p, q) => Math.abs(candY[q] - aim[candStep[q]]) - Math.abs(candY[p] - aim[candStep[p]]));
    for (const c of order) {
      stackStep.push(candStep[c]);
      stackY.push(candY[c]);
    }
  }
  return { passable: false, furthestStep: furthest, totalSteps: total, statesExplored: explored };
}

/** A comfortable tap height per step: half a flap's rise below the next gap's centre, so the bob is centred. */
function aimHeights(course: Course, physics: PhysicsRules): Float64Array {
  const aim = new Float64Array(course.scroll.length);
  const rise = (physics.flapVelocity * physics.flapVelocity) / (2 * physics.gravity);
  let i = 0;
  for (let k = 0; k < aim.length; k++) {
    const cx = course.scroll[k] + CAT.x;
    while (i < course.obstacles.length && course.obstacles[i].x + course.obstacles[i].width < cx - CAT.hitboxRadius) i++;
    const o = course.obstacles[i];
    aim[k] = o ? shapeAt(o, cx).gapY + rise / 2 : CAT.startY;
  }
  return aim;
}
