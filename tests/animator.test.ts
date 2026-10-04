import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game.ts';
import { CatAnimator } from '../src/render/animator.ts';
import { DEFAULT_POSE } from '../src/render/cat.ts';

describe('character presentation', () => {
  it('freezes every layer while paused, including during the resume countdown', () => {
    const game = new Game(7);
    const animator = new CatAnimator();
    game.flap();
    animator.update(game, 1 / 60, 1);
    const frozen = { ...animator.pose };
    game.pause();
    game.flap();
    for (let i = 0; i < 60; i++) {
      game.step(1 / 60);
      animator.update(game, 1 / 60, 2 + i / 60);
    }
    expect(animator.pose).toEqual(frozen);
  });

  it('resets all layers after a crash, including ears and the cape', () => {
    const game = new Game(7);
    const animator = new CatAnimator();
    game.phase = 'dying';
    game.cat.deathAt = 0;
    game.time = 1;
    animator.update(game, 1 / 60, 1);
    expect(animator.pose.eyes).toBe('dead');
    expect(animator.pose.ears).toBe(1);
    animator.reset();
    expect(animator.pose).toEqual(DEFAULT_POSE);
  });

  it('keeps the simulation and recording unchanged while animating', () => {
    const game = new Game(42);
    game.flap();
    const before = JSON.stringify(game);
    const animator = new CatAnimator();
    for (let i = 0; i < 120; i++) animator.update(game, 1 / 60, i / 60);
    expect(JSON.stringify(game)).toBe(before);
    expect(animator.pose.legs).toBeLessThan(-0.8);
  });

  it('communicates a fast fall with wide eyes and paws down', () => {
    const game = new Game(7);
    game.flap();
    game.cat.vy = 650;
    const animator = new CatAnimator();
    for (let i = 0; i < 30; i++) animator.update(game, 1 / 60, i / 60);
    expect(animator.pose.eyes).toBe('wide');
    expect(animator.pose.mouth).toBe('open');
    expect(animator.pose.legs).toBeGreaterThan(0.9);
  });

  it('removes stretch, ambient ripples and the crash spin for reduced motion', () => {
    const game = new Game(7);
    game.flap();
    const animator = new CatAnimator();
    animator.update(game, 1 / 60, 1, true);
    expect(animator.pose.scaleX).toBe(1);
    expect(animator.pose.scaleY).toBe(1);
    expect(animator.pose.billow).toBe(0);
    expect(animator.pose.ripple).toBe(0);
    game.phase = 'dying';
    game.cat.deathAt = game.time;
    animator.update(game, 1 / 60, 2, true);
    expect(animator.pose.tilt).toBe(Math.PI);
    expect(animator.pose.eyes).toBe('dead');
  });
});
