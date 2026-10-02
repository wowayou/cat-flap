import { CAT, FAIRNESS, OBSTACLE, PHYSICS } from './config.ts';
import type { Game } from './Game.ts';
import type { Obstacle } from './obstacles.ts';

export interface AutopilotOptions {
  /** Never taps faster than this (seconds). Keeps the bot within human limits. */
  minTapInterval?: number;
  /** Extra clearance (px) kept from caps. 0 = plays the edges like a machine; people keep more. */
  safety?: number;
}

/** Clearance kept from a cap when steering towards the next gap early. */
const MARGIN = 8;
/** Clearance kept from the bottom cap's real collision edge when coasting through a gap. */
const COAST_MARGIN = 0.5;
/** Height gained by one flap (v²/2g, plus a pixel for the discrete integrator). */
const FLAP_RISE = (PHYSICS.flapVelocity * PHYSICS.flapVelocity) / (2 * PHYSICS.gravity) + 1;

/**
 * A human-paced bot that plans one obstacle ahead the way a person does:
 * while threading a gap it already drifts towards the height of the next one,
 * staying inside the current gap. It taps when it sinks below its aim.
 *
 * It exists to exercise the real game end-to-end (tests, `?bot` demo). The
 * *proof* that every layout is passable is `tools/oracle.ts`, not this bot.
 */
export class Autopilot {
  private lastTap = -Infinity;
  private readonly minTapInterval: number;
  private readonly safety: number;

  constructor(opts: AutopilotOptions = {}) {
    this.minTapInterval = opts.minTapInterval ?? 0.18;
    this.safety = opts.safety ?? 0;
  }

  /** Call once per simulation step, before `game.step`. Returns true if it tapped. */
  update(game: Game): boolean {
    if (game.phase !== 'playing') return false;
    if (game.time - this.lastTap < this.minTapInterval) return false;
    if (!this.wants(game)) return false;
    game.flap();
    this.lastTap = game.time;
    return true;
  }

  /**
   * Pure decision: would the bot tap right now? `perceivedOffset` shifts
   * where it believes the cat is — calibration uses it to model human error.
   */
  wants(game: Game, perceivedOffset = 0): boolean {
    const y = game.cat.y + perceivedOffset;
    const vy = game.cat.vy;
    if (this.canCoastThrough(game, y)) return false;
    const below = y - this.aim(game);
    // Far below the aim: climb hard. Close: only tap once the last flap has peaked.
    const rising = below > 50 ? -250 : -60;
    return below > 0 && vy > rising;
  }

  reset(): void {
    this.lastTap = -Infinity;
  }

  /**
   * When the next gap is lower, a person stops tapping early and lets the cat
   * sink through the current gap. Coast if falling without a tap stays clear
   * of the bottom cap until we're out of this obstacle.
   */
  private canCoastThrough(game: Game, y: number): boolean {
    const current = game.upcomingObstacle();
    if (!current) return false;
    const next = followingObstacle(game, current);
    const vy = game.cat.vy;
    if (!next || aimFor(next) <= y) return false;
    const r = CAT.hitboxRadius;
    const toExit = current.x + OBSTACLE.capWidth + r - game.catWorldX;
    if (toExit > OBSTACLE.capWidth + 4 * r) return false; // not near it yet
    const t = toExit / game.speed;
    // Ballistic height at the exit (ignoring the fall-speed cap, so it errs low = safe).
    const yExit = y + vy * t + 0.5 * PHYSICS.gravity * t * t;
    const capTop = current.gapY + current.gap / 2 + FAIRNESS.collisionInset;
    return Math.max(y, yExit) + r < capTop - COAST_MARGIN - this.safety;
  }

  private aim(game: Game): number {
    const current = game.upcomingObstacle();
    if (!current) return CAT.startY + 30;
    const own = aimFor(current);
    const next = followingObstacle(game, current);
    // Only look ahead once we're about to enter / inside the current gap.
    if (!next || current.x - game.catWorldX > OBSTACLE.capWidth) return own;

    const r = CAT.hitboxRadius;
    const top = current.gapY - current.gap / 2;
    const bottom = current.gapY + current.gap / 2;
    // The bob spans [aim - FLAP_RISE, aim]; keep that whole span inside this gap.
    const lo = top + r + MARGIN + this.safety + FLAP_RISE;
    const hi = bottom - r - MARGIN - this.safety;
    return Math.min(hi, Math.max(lo, aimFor(next)));
  }
}

/** Tap height that centres the flap's bob on the gap. */
function aimFor(o: Obstacle): number {
  return o.gapY + FLAP_RISE / 2;
}

function followingObstacle(game: Game, current: Obstacle): Obstacle | null {
  for (const o of game.obstacles) if (o.active && o.index === current.index + 1) return o;
  return null;
}
