/**
 * Difficulty calibration: plays many runs with "human-ish" players and prints
 * score distributions, so tuning changes can be judged by numbers rather
 * than by one person's feel on one evening.
 *
 * A simulated player is the Autopilot's decisions plus imperfection:
 *  - timing: each intended tap lands late by a random delay. Like a person,
 *    it anticipates its *average* lateness; only the jitter surprises it;
 *  - drift: the height it aims for wobbles slowly (attention);
 *  - safety: it keeps some clearance from the caps instead of skimming them.
 * These are crude, but they move in the right direction and are consistent
 * across tuning changes, which is all a calibration rig needs.
 *
 *   npm run calibrate            # all profiles, 200 runs each
 *   npm run calibrate -- 500     # more runs
 */
import { Autopilot } from '../src/game/autopilot.ts';
import { TIMING } from '../src/game/config.ts';
import { Game } from '../src/game/Game.ts';
import { createRng } from '../src/game/rng.ts';

interface Profile {
  name: string;
  /** Mean / spread of tap lateness (seconds). */
  delayMean: number;
  delaySd: number;
  /** Amplitude (px) of the slowly drifting aim error. */
  drift: number;
  /** Clearance (px) kept from caps. */
  safety: number;
}

export const PROFILES: Profile[] = [
  { name: 'first-timer', delayMean: 0.07, delaySd: 0.04, drift: 18, safety: 4 },
  { name: 'casual', delayMean: 0.05, delaySd: 0.03, drift: 12, safety: 6 },
  { name: 'practised', delayMean: 0.04, delaySd: 0.02, drift: 8, safety: 8 },
  { name: 'expert', delayMean: 0.03, delaySd: 0.012, drift: 5, safety: 8 },
];

const DT = 1 / TIMING.simHz;
const CAP = 300;

export function playOnce(seed: number, p: Profile): number {
  const game = new Game(seed);
  const brain = new Autopilot({ safety: p.safety });
  const rng = createRng(seed ^ 0x9e3779b9);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-9))) * Math.cos(2 * Math.PI * rng());
  const minTapInterval = 0.12;
  let lastTap = 0;
  let pendingAt = -1;
  let driftPhase = rng() * Math.PI * 2;
  game.flap();

  while (game.phase === 'playing' && game.score < CAP) {
    driftPhase += DT * 0.9;
    // Where it believes the cat will be when its tap lands: drift + anticipated mean delay.
    const offset = Math.sin(driftPhase) * p.drift + game.cat.vy * p.delayMean;
    if (pendingAt < 0 && game.time - lastTap >= minTapInterval && brain.wants(game, offset)) {
      pendingAt = game.time + Math.max(0, p.delayMean + gauss() * p.delaySd);
    }
    if (pendingAt >= 0 && game.time >= pendingAt) {
      game.flap();
      lastTap = game.time;
      pendingAt = -1;
    }
    game.step(DT);
  }
  return game.score;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

// Run as a script (not when imported by tests).
declare const process: { argv: string[] } | undefined;
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('calibrate.ts')) {
  const runs = Number(process.argv[2] ?? 200);
  console.log(`runs per profile: ${runs}   (scores capped at ${CAP})`);
  console.log('profile        p10  median  p90   mean   ≥10    ≥25    ≥50');
  for (const p of PROFILES) {
    const scores: number[] = [];
    for (let i = 0; i < runs; i++) scores.push(playOnce(1000 + i, p));
    scores.sort((a, b) => a - b);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const share = (t: number) => `${((scores.filter((s) => s >= t).length / runs) * 100).toFixed(0)}%`.padStart(5);
    console.log(
      `${p.name.padEnd(13)} ${String(percentile(scores, 0.1)).padStart(4)} ${String(percentile(scores, 0.5)).padStart(7)} ` +
        `${String(percentile(scores, 0.9)).padStart(4)} ${mean.toFixed(1).padStart(6)}  ${share(10)}  ${share(25)}  ${share(50)}`,
    );
  }
}
