import { describe, expect, it } from 'vitest';
import { CAT, DIFFICULTY, OBSTACLE, PHYSICS, TIMING, WORLD } from '../src/game/config.ts';
import { Game, type GameEvent } from '../src/game/Game.ts';
import { DT, puppetStep, run, runUntil } from './helpers.ts';

function drain(game: Game): GameEvent['type'][] {
  const types: GameEvent['type'][] = [];
  game.consumeEvents((e) => types.push(e.type));
  return types;
}

describe('READY', () => {
  it('hovers the cat, scrolls the ground, has no obstacles and no gravity', () => {
    const game = new Game(1);
    run(game, 3);
    expect(game.phase).toBe('ready');
    expect(Math.abs(game.cat.y - CAT.startY)).toBeLessThanOrEqual(CAT.readyBobAmplitude + 1e-9);
    expect(game.scroll).toBeGreaterThan(0);
    expect(game.obstacles.some((o) => o.active)).toBe(false);
  });

  it('first action starts the run AND flaps', () => {
    const game = new Game(1);
    game.flap();
    expect(game.phase).toBe('playing');
    expect(game.cat.vy).toBe(PHYSICS.flapVelocity);
    expect(drain(game)).toEqual(['start', 'flap']);
  });
});

describe('PLAYING → DYING → GAMEOVER', () => {
  it('falling to the ground kills, the cat comes to rest, then Game Over appears', () => {
    const game = new Game(1);
    game.flap();
    drain(game);
    runUntil(game, () => game.phase !== 'playing', 5);
    expect(game.phase).toBe('dying');
    expect(game.deathCause).toBe('ground');
    expect(game.cat.landed).toBe(true);
    expect(game.cat.y + CAT.hitboxRadius).toBeCloseTo(WORLD.groundY);
    expect(drain(game)).toEqual(['hit', 'land']);

    const scrollAtDeath = game.scroll;
    run(game, TIMING.gameOverDelay + DT * 2);
    expect(game.phase).toBe('gameover');
    expect(game.scroll).toBe(scrollAtDeath); // the world stops on death
    expect(drain(game)).toEqual(['gameover']);
  });

  it('hitting an obstacle kills, stops scoring, and ignores further flaps', () => {
    const game = new Game(3);
    game.flap();
    // Hold the cat high so it flies into the first top post.
    runUntil(game, () => {
      if (game.phase === 'playing') {
        game.cat.y = 40;
        game.cat.vy = 0;
      }
      return game.phase !== 'playing';
    });
    expect(game.deathCause).toBe('obstacle');
    const score = game.score;
    const vy = game.cat.vy;
    game.flap();
    expect(game.cat.vy).toBe(vy);
    runUntil(game, () => game.phase === 'gameover', 5);
    expect(game.score).toBe(score);
    expect(game.cat.landed).toBe(true);
  });

  it('the ceiling bonks instead of killing', () => {
    const game = new Game(1);
    game.flap();
    drain(game);
    const types: string[] = [];
    // Flap as fast as possible for a second, before the first obstacle arrives.
    for (let i = 0; i < 120; i++) {
      if (i % 6 === 0) game.flap();
      game.step(DT);
      game.consumeEvents((e) => types.push(e.type));
      expect(game.cat.y).toBeGreaterThanOrEqual(WORLD.ceilingY + CAT.hitboxRadius);
    }
    expect(game.phase).toBe('playing');
    expect(types).toContain('bonk');
  });
});

describe('GAMEOVER → READY (restart)', () => {
  function deadGame(): Game {
    const game = new Game(5);
    game.flap();
    for (let i = 0; i < 60 * 30 && game.score < 3; i++) puppetStep(game);
    runUntil(game, () => game.phase === 'gameover', 10);
    return game;
  }

  it('ignores input during the retry lockout', () => {
    const game = deadGame();
    game.flap();
    expect(game.phase).toBe('gameover');
  });

  it('resets everything without reloading', () => {
    const game = deadGame();
    expect(game.score).toBe(3);
    run(game, TIMING.retryLockout);
    game.flap();
    expect(game.phase).toBe('ready');
    expect(game.score).toBe(0);
    expect(game.speed).toBe(DIFFICULTY.baseSpeed);
    expect(game.obstacles.some((o) => o.active)).toBe(false);
    expect(game.cat.vy).toBe(0);
    expect(game.cat.landed).toBe(false);
    expect(game.deathCause).toBe(null);
    expect(Math.abs(game.cat.y - CAT.startY)).toBeLessThanOrEqual(CAT.readyBobAmplitude + 1e-9);

    game.flap();
    expect(game.phase).toBe('playing');
  });
});

describe('scoring', () => {
  it('awards exactly one point per obstacle, once the whole hitbox is past it', () => {
    const game = new Game(11);
    game.flap();
    let events = 0;
    for (let i = 0; i < 120 * 40; i++) {
      puppetStep(game);
      game.consumeEvents((e) => {
        if (e.type === 'score') events++;
      });
      for (const o of game.obstacles) {
        if (!o.active) continue;
        const past = game.catWorldX - CAT.hitboxRadius > o.x + OBSTACLE.capWidth;
        expect(o.scored).toBe(past);
      }
    }
    expect(game.score).toBeGreaterThan(20);
    expect(events).toBe(game.score);
  });

  it('speeds up with score, capped', () => {
    const game = new Game(12);
    game.flap();
    const speeds: number[] = [];
    while (game.score < 60) {
      puppetStep(game);
      speeds.push(game.speed);
    }
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1]);
    expect(speeds[0]).toBe(DIFFICULTY.baseSpeed);
    expect(Math.max(...speeds)).toBe(DIFFICULTY.maxSpeed);
  });

  it('keeps obstacle spacing constant in world space as speed rises', () => {
    const game = new Game(13);
    game.flap();
    const xs = new Map<number, number>();
    while (game.score < 50) {
      puppetStep(game);
      for (const o of game.obstacles) if (o.active) xs.set(o.index, o.x);
    }
    const sorted = [...xs.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => x);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeCloseTo(OBSTACLE.spacing, 6);
  });
});

describe('pause', () => {
  it('freezes the world, resumes after a countdown, and can be cancelled', () => {
    const game = new Game(2);
    game.flap();
    run(game, 0.3);
    game.pause();
    expect(game.phase).toBe('paused');
    const y = game.cat.y;
    const scroll = game.scroll;
    run(game, 2);
    expect(game.cat.y).toBe(y);
    expect(game.scroll).toBe(scroll);

    game.flap(); // starts the countdown
    expect(game.countdown).toBe(TIMING.resumeCountdown);
    run(game, TIMING.resumeCountdown / 2);
    game.togglePause(); // cancel
    expect(game.countdown).toBe(0);
    run(game, TIMING.resumeCountdown);
    expect(game.phase).toBe('paused');

    game.togglePause();
    run(game, TIMING.resumeCountdown + DT);
    expect(game.phase).toBe('playing');
    expect(game.cat.y).toBe(y); // nothing moved during the countdown... until this step
  });

  it('pause() only acts while playing', () => {
    const game = new Game(2);
    game.pause();
    expect(game.phase).toBe('ready');
  });
});

describe('resources and determinism', () => {
  it('never needs more obstacles than the pool holds', () => {
    const game = new Game(21);
    game.flap();
    let maxActive = 0;
    while (game.score < 200) {
      puppetStep(game);
      maxActive = Math.max(maxActive, game.obstacles.filter((o) => o.active).length);
    }
    expect(game.obstacles.length).toBe(OBSTACLE.poolSize);
    expect(maxActive).toBeLessThan(OBSTACLE.poolSize);
  });

  it('same seed + same inputs = same run, across resets', () => {
    const play = () => {
      const game = new Game(99);
      const log: number[] = [];
      for (let round = 0; round < 3; round++) {
        game.flap();
        while (game.score < 8) {
          puppetStep(game);
          for (const o of game.obstacles) if (o.active) log.push(o.gapY);
        }
        game.cat.y = 1000; // crash
        runUntil(game, () => game.phase === 'gameover', 10);
        run(game, TIMING.retryLockout);
        game.flap();
      }
      return log;
    };
    expect(play()).toEqual(play());
  });
});
