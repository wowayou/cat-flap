import { describe, expect, it } from 'vitest';
import { circleHitsObstacle } from '../src/game/collision.ts';
import { CAT, FISH, WORLD } from '../src/game/config.ts';
import { Game } from '../src/game/Game.ts';
import { MAP_IDS } from '../src/game/maps.ts';
import { fishY, planNextGap } from '../src/game/obstacles.ts';
import { createRng } from '../src/game/rng.ts';
import { DT, puppetStep } from './helpers.ts';

describe('fish snacks', () => {
  it('never move a post: a garden seed lays out the same gaps as the plain generator', () => {
    for (const seed of [1, 77, 4242]) {
      const game = new Game(seed);
      game.flap();
      const seen = new Map<number, number>();
      while (seen.size < 2) {
        puppetStep(game);
        for (const o of game.obstacles) if (o.active) seen.set(o.index, o.gapY);
      }
      // The first two spawn before any point is scored, so their plan is reproducible directly.
      const rng = createRng(seed);
      const first = planNextGap(CAT.startY, 0, 0, rng).gapY;
      const second = planNextGap(first, 1, 0, rng).gapY;
      expect([seen.get(0), seen.get(1)]).toEqual([first, second]);
    }
  });

  it.each(MAP_IDS)('on the %s, every fish can be eaten without touching anything', (map) => {
    let fish = 0;
    for (const seed of [3, 30, 300]) {
      const game = new Game(seed, map);
      game.flap();
      const checked = new Set<number>();
      while (game.score < 40) {
        puppetStep(game);
        const cx = game.catWorldX;
        for (const o of game.obstacles) {
          if (!o.active || !o.fish || checked.has(o.index) || cx < o.x + o.fishDx) continue;
          checked.add(o.index);
          fish++;
          // The cat can sit right on the fish as the fish passes it.
          const y = fishY(o);
          expect(y - CAT.hitboxRadius).toBeGreaterThan(WORLD.ceilingY);
          expect(y + CAT.hitboxRadius).toBeLessThan(WORLD.groundY);
          for (const other of game.obstacles) {
            if (other.active) expect(circleHitsObstacle(o.x + o.fishDx, y, CAT.hitboxRadius, other)).toBe(false);
          }
        }
      }
    }
    expect(fish).toBeGreaterThan(40);
  });

  it('come with about the configured share of obstacles, in gaps and in the open', () => {
    const game = new Game(11);
    game.flap();
    const seen = new Map<number, { fish: boolean; inGap: boolean }>();
    while (game.score < 200) {
      puppetStep(game);
      for (const o of game.obstacles) if (o.active) seen.set(o.index, { fish: o.fish, inGap: o.fishInGap });
    }
    const all = [...seen.values()];
    const withFish = all.filter((f) => f.fish);
    expect(withFish.length / all.length).toBeGreaterThan(FISH.chance - 0.12);
    expect(withFish.length / all.length).toBeLessThan(FISH.chance + 0.12);
    expect(withFish.some((f) => f.inGap)).toBe(true);
    expect(withFish.some((f) => !f.inGap)).toBe(true);
  });

  it('flying through one eats it once: +1 fish, cape energy back, an event', () => {
    const game = new Game(5);
    game.flap();
    game.cat.energy = 0.2;
    const events: { x: number; y: number }[] = [];
    let target = -1;
    for (let i = 0; i < 120 * 30 && game.fish < 1; i++) {
      // Steer onto the first fish that comes along; otherwise ride the gaps.
      const o = game.obstacles.find((p) => p.active && p.fish && !p.fishTaken && p.x + p.fishDx > game.catWorldX - 4);
      if (o && (target === -1 || target === o.index) && o.x + o.fishDx - game.catWorldX < 60) {
        target = o.index;
        game.cat.y = fishY(o);
        game.cat.vy = 0;
        game.step(DT);
      } else {
        puppetStep(game);
      }
      game.consumeEvents((e) => {
        if (e.type === 'fish') events.push(e);
      });
    }
    expect(game.fish).toBe(1);
    expect(events).toHaveLength(1);
    expect(game.cat.energy).toBeGreaterThan(0.2 + FISH.energy - 0.01);
    const eaten = game.obstacles.find((o) => o.active && o.x + o.fishDx === events[0].x)!;
    expect(eaten.fishTaken).toBe(true);
    expect(fishY(eaten)).toBe(events[0].y);
    // Lingering on the spot doesn't eat it again.
    game.cat.y = fishY(eaten);
    game.step(DT);
    expect(game.fish).toBe(1);
  });

  it('are placed the same way every time for a seed', () => {
    const layout = () => {
      const game = new Game(808, 'library');
      game.flap();
      const out: string[] = [];
      while (game.score < 30) {
        puppetStep(game);
        for (const o of game.obstacles) if (o.active && o.fish) out.push(`${o.index}:${o.fishDx}:${o.fishY}`);
      }
      return out;
    };
    expect(layout()).toEqual(layout());
  });
});
