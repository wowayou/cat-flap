import { TIMING } from '../src/game/config.ts';
import type { Game } from '../src/game/Game.ts';

export const DT = 1 / TIMING.simHz;

/** Step the game for `seconds` of sim time. */
export function run(game: Game, seconds: number): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) game.step(DT);
}

/** Step until `done()` or the step budget runs out; returns steps taken. */
export function runUntil(game: Game, done: () => boolean, maxSeconds = 120): number {
  const max = Math.round(maxSeconds / DT);
  for (let i = 0; i < max; i++) {
    if (done()) return i;
    game.step(DT);
  }
  throw new Error(`condition not reached within ${maxSeconds}s (phase ${game.phase}, score ${game.score})`);
}

/** Keep the cat glued to the centre of the next gap: it can never die. */
export function puppetStep(game: Game): void {
  const next = game.upcomingObstacle();
  if (next) {
    game.cat.y = next.gapY;
    game.cat.vy = 0;
  }
  game.step(DT);
}
