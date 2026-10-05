import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/game/autopilot.ts';
import { CAT, FAIRNESS, OBSTACLE } from '../src/game/config.ts';
import { Game } from '../src/game/Game.ts';
import { MAP_IDS } from '../src/game/maps.ts';
import { provePassable, recordCourse, type Course } from '../tools/oracle.ts';
import { DT } from './helpers.ts';

describe('every generated course is passable at a human tap rate (oracle proof)', () => {
  it.each(Array.from({ length: 24 }, (_, i) => i + 1))('seed %i, to 100 points', (seed) => {
    const course = recordCourse(seed * 7919, 100);
    const result = provePassable(course, FAIRNESS.assumedTapInterval);
    expect(result.passable).toBe(true);
  });

  it('still passable for a slower tapper (≤ 3.3 taps/s) on several seeds', () => {
    for (const seed of [101, 202, 303, 404]) {
      expect(provePassable(recordCourse(seed, 80), 0.3).passable).toBe(true);
    }
  });
});

describe.each(MAP_IDS.filter((m) => m !== 'garden'))('the %s too', (map) => {
  it.each(Array.from({ length: 16 }, (_, i) => i + 1))('seed %i, to 100 points', (seed) => {
    const course = recordCourse(seed * 6007, 100, map);
    expect(provePassable(course, FAIRNESS.assumedTapInterval).passable).toBe(true);
  });

  it('still passable for a slower tapper (≤ 3.3 taps/s)', () => {
    for (const seed of [101, 202, 303]) {
      expect(provePassable(recordCourse(seed, 80, map), 0.3).passable).toBe(true);
    }
  });

  it('the autopilot clears 60 points on 20 seeds', () => {
    for (let seed = 500; seed < 520; seed++) {
      const game = new Game(seed, map);
      const bot = new Autopilot();
      game.flap();
      while (game.phase === 'playing' && game.score < 60) {
        bot.update(game);
        game.step(DT);
      }
      expect({ seed, score: game.score }).toEqual({ seed, score: 60 });
    }
  });
});

describe('the oracle itself', () => {
  function syntheticCourse(gaps: number[]): Course {
    const steps = 1200;
    const scroll = new Float64Array(steps);
    for (let k = 0; k < steps; k++) scroll[k] = (k + 1) * DT * 150;
    return {
      map: 'garden',
      seed: 0,
      startY: CAT.startY,
      scroll,
      obstacles: gaps.map((passY, index) => ({
        index, x: 300 + index * 120, passY, gap: 150, width: OBSTACLE.capWidth, amp: 0, phase: 0, wavelength: 1,
      })),
    };
  }

  it('accepts an easy course', () => {
    expect(provePassable(syntheticCourse([272, 272, 272]), FAIRNESS.assumedTapInterval).passable).toBe(true);
  });

  it('rejects an impossible one (huge jump between close obstacles)', () => {
    const result = provePassable(syntheticCourse([272, 120, 470]), FAIRNESS.assumedTapInterval);
    expect(result.passable).toBe(false);
    expect(result.furthestStep).toBeLessThan(result.totalSteps);
  });

  it('is sensitive to tap rate (a course needing fast taps fails for a slow tapper)', () => {
    // A steep climb: fine at 5.5 taps/s, impossible at 1 tap/s.
    const course = syntheticCourse([400, 400 - OBSTACLE.maxShiftUp, 400 - 2 * OBSTACLE.maxShiftUp]);
    expect(provePassable(course, FAIRNESS.assumedTapInterval).passable).toBe(true);
    expect(provePassable(course, 1).passable).toBe(false);
  });
});

describe('end to end with the real game', () => {
  it('the autopilot clears 60 points on every one of 40 seeds', () => {
    for (let seed = 500; seed < 540; seed++) {
      const game = new Game(seed);
      const bot = new Autopilot();
      game.flap();
      while (game.phase === 'playing' && game.score < 60) {
        bot.update(game);
        game.step(DT);
      }
      expect({ seed, score: game.score, phase: game.phase }).toEqual({ seed, score: 60, phase: 'playing' });
    }
  });
});
