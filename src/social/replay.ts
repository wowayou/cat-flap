import { CAT, TIMING, WORLD } from '../game/config.ts';
import { Game, type RunRecord } from '../game/Game.ts';

/*
 * Ghost replays. A run is fully determined by its seed, where it started and
 * the step index of every flap: the simulation is fixed-step and only uses
 * + − × ÷, min/max and integer ops, which IEEE 754 makes bit-identical in
 * every JS engine. So a few hundred bytes in a link are enough to fly a
 * friend's exact run next to yours — and to check the score they claim.
 */

const DT = 1 / TIMING.simHz;
/** After the last flap a cat is down within a couple of seconds; this bounds a replay that never ends. */
const TAIL_TICKS = 10 * TIMING.simHz;

/** Replays one recorded run in its own Game, one fixed step at a time. */
export class Replay {
  readonly game: Game;
  readonly record: RunRecord;
  private next = 0;

  constructor(record: RunRecord) {
    const g = new Game(record.seed);
    g.fixedSeed = record.seed;
    g.scroll = g.prevScroll = record.startScroll;
    g.cat.y = g.cat.prevY = record.startY;
    this.game = g;
    this.record = record;
    this.applyDue();
  }

  /** Distance flown since take-off. */
  get distance(): number {
    return this.game.scroll - this.record.startScroll;
  }

  step(): void {
    this.game.step(DT);
    this.applyDue();
    this.game.events.length = 0;
  }

  /** Flaps recorded for the current step count (the first one, at 0, is the take-off). */
  private applyDue(): void {
    const g = this.game;
    const flaps = this.record.flaps;
    while (this.next < flaps.length && flaps[this.next] <= g.runTicks) {
      if (flaps[this.next] === g.runTicks && (g.phase === 'ready' || g.phase === 'playing')) g.flap();
      this.next++;
    }
  }
}

export interface ReplayResult {
  score: number;
  /** Playing steps until the crash. */
  ticks: number;
}

/** A record is well-formed if it starts with the take-off flap and its flaps never go back in time. */
function isWellFormed(record: RunRecord): boolean {
  const f = record.flaps;
  if (f.length === 0 || f[0] !== 0) return false;
  if (!Number.isFinite(record.startScroll) || !Number.isFinite(record.startY)) return false;
  if (record.startY < CAT.hitboxRadius || record.startY > WORLD.groundY - CAT.hitboxRadius) return false;
  for (let i = 1; i < f.length; i++) if (!(f[i] >= f[i - 1])) return false;
  return true;
}

/** Plays a record to its crash and reports the score it really earns, or null if it is malformed. */
export function simulate(record: RunRecord): ReplayResult | null {
  if (!isWellFormed(record)) return null;
  const r = new Replay(record);
  const limit = record.flaps[record.flaps.length - 1] + TAIL_TICKS;
  while (r.game.phase === 'playing' && r.game.runTicks < limit) r.step();
  if (r.game.phase === 'playing') return null;
  return { score: r.game.score, ticks: r.game.runTicks };
}
