import { CAT, WORLD } from '../game/config.ts';
import type { Game, Phase } from '../game/Game.ts';
import type { Ghost } from './link.ts';
import { Replay } from './replay.ts';

export interface Rival {
  readonly ghost: Ghost;
  /** Index into the ghost coat list, distinct within the squad. */
  readonly coat: number;
  replay: Replay | null;
  /** The player has flown past this rival's crash during the current run. */
  passed: boolean;
}

export interface Standing {
  name: string;
  score: number;
  me: boolean;
  /** Ghost coat index; -1 for the player. */
  coat: number;
}

/** How many distinct ghost coats the renderer has. */
export const GHOST_COAT_COUNT = 5;

/**
 * The friends' ghosts flying the shared course with you. Each take-off
 * starts fresh replays; they are stepped exactly once per player simulation
 * step (none while paused), so a ghost is where its owner really was at the
 * same moment of their run. After you crash they fly on out of view; a ghost
 * that crashed stays where it fell and scrolls away behind you.
 */
export class Squad {
  readonly rivals: Rival[];
  /** Bumped on every take-off, so the renderer knows to reset per-ghost animation. */
  generation = 0;
  private running = false;

  constructor(ghosts: readonly Ghost[]) {
    const used = new Set<number>();
    this.rivals = ghosts.map((ghost) => {
      let coat = ghost.pid % GHOST_COAT_COUNT;
      while (used.has(coat) && used.size < GHOST_COAT_COUNT) coat = (coat + 1) % GHOST_COAT_COUNT;
      used.add(coat);
      return { ghost, coat, replay: null, passed: false };
    });
  }

  get flying(): boolean {
    return this.running;
  }

  /**
   * Call once per simulation step right before the player's `game.step`,
   * then `afterStep` with the phase the player had before that step.
   */
  beforeStep(player: Game): void {
    if (player.phase === 'ready') {
      this.running = false;
    } else if (player.phase === 'playing' && player.runTicks === 0) {
      // Take-off (the only moment a run is playing with no steps taken yet).
      this.running = true;
      this.generation++;
      for (const r of this.rivals) {
        r.replay = new Replay(r.ghost.record);
        r.passed = false;
      }
    }
  }

  afterStep(player: Game, phaseBefore: Phase): void {
    if (!this.running) return;
    if (phaseBefore !== 'playing' && phaseBefore !== 'dying' && phaseBefore !== 'gameover') return;
    for (const r of this.rivals) {
      const replay = r.replay;
      if (!replay || replay.game.phase === 'gameover') continue;
      // Once the player is down, ghosts still in the air fly on until they leave the screen.
      if (phaseBefore !== 'playing' && this.screenX(r, player, 1) > WORLD.width + 60) continue;
      replay.step();
    }
  }

  /** Rivals whose final score the player has just beaten, each reported once per run. */
  overtaken(score: number): Rival[] {
    const out: Rival[] = [];
    if (!this.running) return out;
    for (const r of this.rivals) {
      if (!r.passed && score > r.ghost.score) {
        r.passed = true;
        out.push(r);
      }
    }
    return out;
  }

  /** Screen x of a rival's hitbox centre, interpolated like the player's. */
  screenX(r: Rival, player: Game, alpha: number): number {
    const g = r.replay?.game;
    if (!g) return -Infinity;
    const ghostScroll = g.prevScroll + (g.scroll - g.prevScroll) * alpha;
    const playerScroll = player.prevScroll + (player.scroll - player.prevScroll) * alpha;
    return CAT.x + (ghostScroll - r.ghost.record.startScroll) - (playerScroll - player.record.startScroll);
  }

  /** Everyone on this course, best first; on a tie the player ranks ahead. */
  standings(myName: string, myScore: number): Standing[] {
    const rows: Standing[] = this.rivals.map((r) => ({ name: r.ghost.name, score: r.ghost.score, me: false, coat: r.coat }));
    rows.push({ name: myName, score: myScore, me: true, coat: -1 });
    return rows.sort((a, b) => b.score - a.score || Number(b.me) - Number(a.me));
  }
}
