import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game.ts';
import { CatAnimator } from '../src/render/animator.ts';
import { DEFAULT_POSE, ghostColors, GINGER_COLORS } from '../src/render/cat.ts';

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

  it('stretches along a flap and tilts up into the climb', () => {
    const game = new Game(7);
    game.flap();
    const animator = new CatAnimator();
    for (let i = 0; i < 4; i++) animator.update(game, 1 / 60, i / 60);
    expect(animator.pose.scaleY).toBeGreaterThan(1.05);
    expect(animator.pose.scaleX).toBeLessThan(0.95);
    expect(animator.pose.tilt).toBeLessThan(-0.2);
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

  it('squints and squashes on a ceiling bonk', () => {
    const game = new Game(7);
    game.flap();
    game.cat.bonkAt = game.time;
    const animator = new CatAnimator();
    animator.update(game, 1 / 60, 1);
    expect(animator.pose.eyes).toBe('squint');
    expect(animator.pose.scaleX).toBeGreaterThan(1);
    expect(animator.pose.ears).toBeGreaterThan(0.5);
  });

  it('spreads the cape and reaches both paws ahead in a glide, chomps a fish', () => {
    const game = new Game(7);
    game.flap();
    game.cat.gliding = true;
    game.cat.fishAt = game.time;
    const animator = new CatAnimator();
    for (let i = 0; i < 10; i++) animator.update(game, 1 / 60, i / 60);
    expect(animator.pose.spread).toBeGreaterThan(0.9);
    expect(animator.pose.legs).toBeLessThan(-0.9);
    expect(animator.pose.mouth).toBe('open');
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

describe('ghost coats', () => {
  it('turn the ginger fur into the coat colour and keep ink darker than cream', () => {
    const luma = (hex: string) => parseInt(hex.slice(1, 3), 16) * 0.299 + parseInt(hex.slice(3, 5), 16) * 0.587 + parseInt(hex.slice(5, 7), 16) * 0.114;
    for (const coat of ['#3a3340', '#b9bdc7', '#f4f1ec', '#76839a', '#9a7454']) {
      const c = ghostColors(coat);
      expect(c.fur).toBe(coat);
      expect(luma(c.ink)).toBeLessThan(luma(c.fur));
      expect(luma(c.cream)).toBeGreaterThanOrEqual(luma(c.fur));
      expect(Object.keys(c)).toEqual(Object.keys(GINGER_COLORS));
    }
  });
});
