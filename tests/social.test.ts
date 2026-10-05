import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/game/autopilot.ts';
import { Game, type RunRecord } from '../src/game/Game.ts';
import type { MapId } from '../src/game/maps.ts';
import { createRng } from '../src/game/rng.ts';
import {
  cleanName, decodeChallenge, encodeChallenge, MAX_GHOSTS, mergeGhosts, SIM_SIGNATURE, verifyGhosts, type Ghost,
} from '../src/social/link.ts';
import { Replay, simulate } from '../src/social/replay.ts';
import { GHOST_COAT_COUNT, Squad } from '../src/social/squad.ts';
import { GHOST_COLORS } from '../src/render/palette.ts';
import { DT, run } from './helpers.ts';

/**
 * Plays a real run with the autopilot until it stops tapping at `stopAt`
 * points and crashes. `idle` seconds in READY first, so runs start from
 * different scroll positions and bob heights.
 */
function playRun(seed: number, stopAt: number, idle = 0.7): { game: Game; record: RunRecord; score: number; ticks: number } {
  const game = new Game(seed);
  const bot = new Autopilot({ minTapInterval: 0.2 });
  run(game, idle);
  game.flap();
  for (let i = 0; i < 120 * 600 && game.phase === 'playing'; i++) {
    if (game.score < stopAt) {
      if (bot.update(game)) game.flap();
    }
    game.step(DT);
  }
  const record = { ...game.record, flaps: game.record.flaps.slice() };
  return { game, record, score: game.score, ticks: game.runTicks };
}

const ghost = (pid: number, name: string, seed: number, stopAt: number, idle?: number): Ghost => {
  const r = playRun(seed, stopAt, idle);
  return { pid, name, score: r.score, record: r.record };
};

describe('run recording', () => {
  it('records the take-off at step 0 and every later flap once', () => {
    const { record } = playRun(11, 3);
    expect(record.flaps[0]).toBe(0);
    for (let i = 1; i < record.flaps.length; i++) expect(record.flaps[i]).toBeGreaterThan(record.flaps[i - 1]);
  });

  it('a fixed seed makes every retry fly the same course', () => {
    const game = new Game(5);
    game.fixedSeed = 777;
    game.reset();
    expect(game.seed).toBe(777);
    game.flap();
    run(game, 6);
    run(game, 2);
    game.flap(); // retry after the lockout
    expect(game.phase).toBe('ready');
    expect(game.seed).toBe(777);
  });
});

describe('replay', () => {
  it('reproduces score and crash step exactly, whatever the scroll and bob height at take-off', () => {
    for (const [seed, stopAt, idle] of [[1, 6, 0.3], [42, 12, 2.9], [9001, 20, 7.1]] as const) {
      const live = playRun(seed, stopAt, idle);
      expect(live.score).toBe(stopAt);
      const replay = simulate(live.record);
      expect(replay).toEqual({ score: live.score, ticks: live.ticks });
    }
  });

  it('flies the same path step by step', () => {
    const live = playRun(3, 5);
    const ys: number[] = [];
    const game = new Game(3);
    run(game, 0.7);
    game.flap();
    const bot = new Autopilot({ minTapInterval: 0.2 });
    while (game.phase === 'playing') {
      if (game.score < 5 && bot.update(game)) game.flap();
      game.step(DT);
      ys.push(game.cat.y);
    }
    const r = new Replay(live.record);
    for (const y of ys) {
      r.step();
      expect(r.game.cat.y).toBe(y);
    }
  });

  it('a ghost keeps flying after the live player has stopped stepping it', () => {
    const r = new Replay(playRun(8, 4).record);
    for (let i = 0; i < 120; i++) r.step();
    expect(r.distance).toBeGreaterThan(0);
    expect(r.game.phase).toBe('playing');
  });

  it('rejects records that do not start with a take-off or go back in time', () => {
    const base = playRun(2, 2).record;
    expect(simulate({ ...base, flaps: [] })).toBeNull();
    expect(simulate({ ...base, flaps: [5, 10] })).toBeNull();
    expect(simulate({ ...base, flaps: [0, 50, 40] })).toBeNull();
    expect(simulate({ ...base, startY: Number.NaN })).toBeNull();
    expect(simulate({ ...base, startY: -500 })).toBeNull();
  });
});

describe('challenge links', () => {
  it('round-trips seed, names, scores and exact floats', () => {
    const a = ghost(0xdeadbeef, '小明', 77, 4);
    const b = ghost(12345, 'Ann', 77, 9, 2.2);
    const text = encodeChallenge({ map: 'garden', seed: 77, ghosts: [a, b] });
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = decodeChallenge(text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.challenge.seed).toBe(77);
    expect(back.challenge.ghosts).toEqual([a, b]);
  });

  it('is compact: about a byte per flap', () => {
    const g = ghost(1, 'x', 5, 30);
    const text = encodeChallenge({ map: 'garden', seed: 5, ghosts: [g] });
    expect(text.length).toBeLessThan(40 + g.record.flaps.length * 2);
  });

  it('verification keeps honest ghosts and drops doctored ones', () => {
    const honest = ghost(1, 'a', 21, 7);
    const inflated = { ...ghost(2, 'b', 21, 3), score: 50 };
    const { valid, rejected } = verifyGhosts([honest, inflated]);
    expect(valid).toEqual([honest]);
    expect(rejected).toBe(1);
  });

  it('rejects garbage, truncation, trailing bytes and links from other rules', () => {
    const text = encodeChallenge({ map: 'garden', seed: 3, ghosts: [ghost(1, 'a', 3, 2)] });
    for (const bad of ['', '!!!', 'AAAA', text.slice(0, -3), `${text}AA`, 'x'.repeat(20_000)]) {
      expect(decodeChallenge(bad).ok).toBe(false);
    }
    // Same bytes with a different signature.
    const bytes = Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
    bytes[1] ^= 0xff;
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const other = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeChallenge(other)).toEqual({ ok: false, reason: 'outdated' });
    expect(SIM_SIGNATURE).toBeGreaterThanOrEqual(0);
  });

  it('cleans names: whitespace, control characters, length', () => {
    expect(cleanName('  a\u0000b \n  c​ ')).toBe('ab c');
    expect(cleanName('一二三四五六七八九十十一十二十三')).toHaveLength(12);
    expect(Array.from(cleanName('🐱'.repeat(20)))).toHaveLength(12);
  });
});

describe('merging ghosts for a share', () => {
  const g = (pid: number, score: number, name = `p${pid}`): Ghost => ({ pid, name, score, record: { map: 'garden', seed: 1, startScroll: 0, startY: 272, flaps: [0], holds: [] } });

  it('adds me, sorted by score', () => {
    expect(mergeGhosts([g(1, 5), g(2, 9)], g(3, 7)).map((x) => x.pid)).toEqual([2, 3, 1]);
  });

  it('keeps only my better run, under my current name', () => {
    const merged = mergeGhosts([g(1, 5), g(3, 12, 'old')], g(3, 7, 'new'));
    expect(merged.map((x) => [x.pid, x.score, x.name])).toEqual([[3, 12, 'new'], [1, 5, 'p1']]);
    expect(mergeGhosts([g(3, 4)], g(3, 7))[0].score).toBe(7);
  });

  it('drops the lowest scorers beyond the cap, never me', () => {
    const others = [g(1, 50), g(2, 40), g(4, 30), g(5, 20), g(6, 10)];
    const merged = mergeGhosts(others, g(9, 0));
    expect(merged).toHaveLength(MAX_GHOSTS);
    expect(merged.map((x) => x.pid)).toEqual([1, 2, 4, 5, 9]);
  });
});

describe('squad (ghosts flying with the player)', () => {
  /** Drives a player game plus squad the way main.ts does, with optional pause in the middle. */
  function fly(squad: Squad, seed: number, stopAt: number, pauseAtTick = -1) {
    const player = new Game(seed);
    player.fixedSeed = seed;
    const bot = new Autopilot({ minTapInterval: 0.2 });
    run(player, 1.3);
    player.flap();
    const passedAt: [string, number][] = [];
    let paused = false;
    for (let i = 0; i < 120 * 300 && player.phase !== 'gameover'; i++) {
      if (player.runTicks === pauseAtTick && !paused) {
        paused = true;
        player.pause();
        player.togglePause(); // start the 3-2-1 countdown
      }
      if (player.phase === 'playing' && player.score < stopAt && bot.update(player)) player.flap();
      squad.beforeStep(player);
      const before = player.phase;
      player.step(DT);
      squad.afterStep(player, before);
      player.consumeEvents((e) => {
        if (e.type === 'score') for (const r of squad.overtaken(e.score)) passedAt.push([r.ghost.name, e.score]);
      });
    }
    return { player, passedAt };
  }

  it('ghosts crash exactly where their owners did, even if the player pauses', () => {
    const a = ghost(1, 'a', 50, 3);
    const b = ghost(2, 'b', 50, 8, 2.5);
    const squad = new Squad([a, b]);
    const { player, passedAt } = fly(squad, 50, 12, 200);
    expect(player.score).toBe(12);
    for (const r of squad.rivals) {
      expect(r.replay!.game.phase).toBe('gameover');
      expect(r.replay!.game.score).toBe(r.ghost.score);
    }
    expect(passedAt).toEqual([['a', 4], ['b', 9]]);
  });

  it('while both fly, a ghost is level with the player; after its crash it falls behind', () => {
    const squad = new Squad([ghost(1, 'a', 60, 2)]);
    const player = new Game(60);
    player.fixedSeed = 60;
    run(player, 0.4);
    player.flap();
    const bot = new Autopilot({ minTapInterval: 0.2 });
    const r = squad.rivals[0];
    for (let i = 0; i < 120 * 20; i++) {
      if (bot.update(player)) player.flap();
      squad.beforeStep(player);
      const before = player.phase;
      player.step(DT);
      squad.afterStep(player, before);
      if (r.replay!.game.phase === 'playing') expect(Math.abs(squad.screenX(r, player, 1) - 104)).toBeLessThan(1e-6);
    }
    expect(r.replay!.game.phase).toBe('gameover');
    expect(squad.screenX(r, player, 1)).toBeLessThan(-100);
  });

  it('a retry starts fresh replays and re-arms overtakes', () => {
    const squad = new Squad([ghost(1, 'a', 70, 1)]);
    fly(squad, 70, 3);
    const gen = squad.generation;
    const { passedAt } = fly(squad, 70, 3);
    expect(squad.generation).toBe(gen + 1);
    expect(passedAt).toEqual([['a', 2]]);
  });

  it('has a colour for every coat it hands out', () => {
    expect(GHOST_COLORS).toHaveLength(GHOST_COAT_COUNT);
  });

  it('gives each ghost its own coat and ranks the player ahead on a tie', () => {
    const squad = new Squad([1, 6, 11].map((pid) => ({ ...ghost(pid, `p${pid}`, 80, 2), pid })));
    expect(new Set(squad.rivals.map((r) => r.coat)).size).toBe(3);
    const rows = squad.standings('me', 2);
    expect(rows[0]).toMatchObject({ name: 'me', me: true });
  });
});

/**
 * A run with gliding: the autopilot taps, and after each tap holds on for a
 * pseudo-random while (often past the top of the flap, so the cape opens).
 */
function playGlideRun(seed: number, stopAt: number, map: MapId = 'garden') {
  const game = new Game(seed, map);
  const bot = new Autopilot({ minTapInterval: 0.2 });
  const rng = createRng(seed ^ 0x51ed);
  let letGoAt = -1;
  run(game, 0.5);
  game.setHold(true);
  game.flap();
  letGoAt = game.time + 0.6;
  for (let i = 0; i < 120 * 600 && game.phase === 'playing'; i++) {
    if (game.score < stopAt && bot.update(game)) {
      game.setHold(true);
      letGoAt = game.time + 0.1 + rng() * 0.6;
    }
    if (game.held && game.time >= letGoAt) game.setHold(false);
    game.step(DT);
  }
  const record = { ...game.record, flaps: game.record.flaps.slice(), holds: game.record.holds.slice() };
  return { record, score: game.score, ticks: game.runTicks, game };
}

describe('gliding in replays and links', () => {
  it('replays a run with holds bit-for-bit', () => {
    let glides = 0;
    for (const seed of [5, 17, 99]) {
      const live = playGlideRun(seed, 8);
      glides += live.record.holds.length;
      expect(simulate(live.record)).toEqual({ score: live.score, ticks: live.ticks });
    }
    expect(glides).toBeGreaterThan(6); // the runs really did glide
  });

  it('a replay records the same holds it was given', () => {
    const live = playGlideRun(23, 6);
    const r = new Replay(live.record);
    while (r.game.phase === 'playing') r.step();
    expect(r.game.record.holds).toEqual(live.record.holds);
    expect(r.game.record.flaps).toEqual(live.record.flaps);
  });

  it('links carry the map and the holds', () => {
    const live = playGlideRun(31, 5);
    const me: Ghost = { pid: 9, name: 'glider', score: live.score, record: live.record };
    const back = decodeChallenge(encodeChallenge({ map: 'garden', seed: 31, ghosts: [me] }));
    expect(back.ok && back.challenge.ghosts[0].record.holds).toEqual(live.record.holds);
    expect(back.ok && back.challenge.map).toBe('garden');
  });

  it('rejects hold toggles that do not move forward', () => {
    const base = playGlideRun(41, 3).record;
    expect(simulate({ ...base, holds: [10, 10] })).toBeNull();
    expect(simulate({ ...base, holds: [30, 20] })).toBeNull();
    expect(simulate({ ...base, holds: [-1] })).toBeNull();
    expect(simulate({ ...base, map: 'atlantis' as MapId })).toBeNull();
  });

  it('an unknown map number is malformed', () => {
    const text = encodeChallenge({ map: 'garden', seed: 3, ghosts: [ghost(1, 'a', 3, 2)] });
    const bytes = Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
    bytes[3] = 200; // map byte
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    expect(decodeChallenge(btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('links from before maps and gliding (format 1)', () => {
  /** The same three-player garden link as e2e/social.spec.ts: recorded before maps existed. */
  const GOLDEN_V1 = 'AcWeAAAQkgMAAAADBuWwj-aYjgxATgAAAAAAAEBxVkwn27_6HQBRSUJJT0lWSUlOSUFJJ0JATUlJSUlOWUlXSUlEAAAAAQbpmL_oirEIQGSgAAAAAABAcPj3q5PNvxUAU0lBSVFJVUhJTkk-STI_QFBJR0kAAAAHDOeFpOeQg-Wkp-eOixRAcsAAAAAAAEBwlXtOvJDWLgBUSURJTEhZSUhNSUVJMz45TUlLSU1IWUlYSEhJRUxXSTNBUExPRTQ6SU5JMzM';

  it('still open as a garden course and replay to the scores they claim', () => {
    const decoded = decodeChallenge(GOLDEN_V1);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.challenge.map).toBe('garden');
    expect(decoded.challenge.seed).toBe(4242);
    const { valid, rejected } = verifyGhosts(decoded.challenge.ghosts);
    expect(rejected).toBe(0);
    expect(valid.map((g) => [g.name, g.score])).toEqual([['小明', 12], ['阿花', 8], ['煤球大王', 20]]);
    for (const g of valid) expect(g.record.holds).toEqual([]);
  });

  it('re-sharing one writes the current format, which decodes to the same runs', () => {
    const decoded = decodeChallenge(GOLDEN_V1);
    if (!decoded.ok) throw new Error('golden link must decode');
    const again = decodeChallenge(encodeChallenge(decoded.challenge));
    expect(again).toEqual(decoded);
    expect(encodeChallenge(decoded.challenge).startsWith('AcWe')).toBe(false);
  });
});
