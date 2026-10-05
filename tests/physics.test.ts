import { describe, expect, it } from 'vitest';
import { GLIDE, PHYSICS, TIMING } from '../src/game/config.ts';
import { Game } from '../src/game/Game.ts';
import { FixedStepLoop } from '../src/game/loop.ts';
import { glide, integrate, reachOver } from '../src/game/physics.ts';

describe('integrate', () => {
  it('accelerates downward and caps fall speed', () => {
    const body = { y: 0, vy: 0 };
    for (let i = 0; i < 1000; i++) integrate(body, 1 / 120);
    expect(body.vy).toBe(PHYSICS.maxFallSpeed);
    expect(body.y).toBeGreaterThan(0);
  });
});

describe('flap', () => {
  it('sets (not adds) vertical speed, so rapid taps never stack', () => {
    const game = new Game(1);
    game.flap();
    expect(game.cat.vy).toBe(PHYSICS.flapVelocity);
    game.flap();
    game.flap();
    expect(game.cat.vy).toBe(PHYSICS.flapVelocity);
  });

  it('rises a fixed, readable height', () => {
    const game = new Game(1);
    const y0 = game.cat.y;
    game.flap();
    let top = y0;
    for (let i = 0; i < 120; i++) {
      game.step(1 / 120);
      top = Math.min(top, game.cat.y);
    }
    const rise = y0 - top;
    const ideal = (PHYSICS.flapVelocity * PHYSICS.flapVelocity) / (2 * PHYSICS.gravity);
    expect(rise).toBeGreaterThan(ideal - 2);
    expect(rise).toBeLessThan(ideal + 2);
  });
});

describe('frame-rate independence', () => {
  /** Play one flap and 1.2s of fall, fed through the loop at a given display rate. */
  function trajectory(frameDts: () => number): number[] {
    const game = new Game(7);
    const loop = new FixedStepLoop();
    const samples: number[] = [];
    game.flap();
    let t = 0;
    while (t < 1.2) {
      const dt = frameDts();
      t += dt;
      loop.advance(dt, (s) => {
        game.step(s);
        samples.push(game.cat.y);
      });
    }
    return samples;
  }

  it('produces bit-identical physics at 30, 60, 144 and jittery frame rates', () => {
    const at30 = trajectory(() => 1 / 30);
    const at60 = trajectory(() => 1 / 60);
    const at144 = trajectory(() => 1 / 144);
    let seed = 1;
    const jitter = trajectory(() => {
      seed = (seed * 16807) % 2147483647;
      return 0.004 + (seed / 2147483647) * 0.03;
    });
    const n = Math.min(at30.length, at60.length, at144.length, jitter.length);
    expect(n).toBeGreaterThan(130);
    expect(at60.slice(0, n)).toEqual(at30.slice(0, n));
    expect(at144.slice(0, n)).toEqual(at30.slice(0, n));
    expect(jitter.slice(0, n)).toEqual(at30.slice(0, n));
  });

  it('drops time beyond maxFrameDt instead of simulating a huge jump', () => {
    const loop = new FixedStepLoop();
    let steps = 0;
    loop.advance(5, () => steps++);
    expect(steps).toBe(Math.round(TIMING.maxFrameDt * TIMING.simHz));
  });

  it('returns an interpolation factor in [0, 1)', () => {
    const loop = new FixedStepLoop();
    for (const dt of [0.001, 0.0123, 1 / 60, 1 / 144, 0.05]) {
      const a = loop.advance(dt, () => {});
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });
});

describe('reach model', () => {
  it('grows with time and is positive', () => {
    const short = reachOver(0.4);
    const long = reachOver(0.8);
    expect(short.climb).toBeGreaterThan(0);
    expect(short.drop).toBeGreaterThan(0);
    expect(long.climb).toBeGreaterThan(short.climb);
    expect(long.drop).toBeGreaterThan(short.drop);
  });
});

describe('glide (holding on past the top of a flap)', () => {
  /** Flap once, then step `seconds`, holding the whole time or not at all. Returns the y per step. */
  function flight(hold: boolean, seconds: number): { ys: number[]; game: Game } {
    const game = new Game(1);
    game.setHold(hold);
    game.flap();
    const ys: number[] = [];
    for (let i = 0; i < Math.round(seconds * 120); i++) {
      game.step(1 / 120);
      ys.push(game.cat.y);
    }
    return { ys, game };
  }

  it('leaves the flap itself untouched: the rise is identical with or without holding', () => {
    const tap = flight(false, 0.3).ys;
    const held = flight(true, 0.3).ys;
    expect(held).toEqual(tap); // still rising after 0.3s: holding hasn't done anything yet
  });

  it('past the top, the cape opens and the cat sinks at the glide speed instead of falling', () => {
    const tap = flight(false, 0.8);
    const held = flight(true, 0.8);
    expect(held.game.cat.gliding).toBe(true);
    expect(held.game.cat.vy).toBe(GLIDE.fallSpeed);
    expect(tap.game.cat.vy).toBeGreaterThan(GLIDE.fallSpeed * 2);
    expect(held.game.cat.y).toBeLessThan(tap.game.cat.y - 40);
  });

  it('brakes a fast fall down to the glide speed', () => {
    const body = { y: 0, vy: PHYSICS.maxFallSpeed };
    for (let i = 0; i < 12; i++) glide(body, 1 / 120);
    expect(body.vy).toBeLessThan(PHYSICS.maxFallSpeed);
    for (let i = 0; i < 60; i++) glide(body, 1 / 120);
    expect(body.vy).toBe(GLIDE.fallSpeed);
  });
});
