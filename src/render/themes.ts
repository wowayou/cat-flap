import type { MapId } from '../game/maps.ts';
import type { Obstacle } from '../game/obstacles.ts';
import { CLOUDS_THEME } from './clouds.ts';
import { LIBRARY_THEME } from './library.ts';
import { MOON_THEME } from './moon.ts';
import { skyAt, type SkyPalette } from './palette.ts';
import { drawObstacle } from './posts.ts';
import { drawCity, drawClouds, drawSky, drawStars, drawSunMoon, drawWall } from './scenery.ts';
import type { View } from './view.ts';

/*
 * Each map's look: a backdrop (sky, scenery and the ground the cat must not
 * touch) and how its obstacles are drawn. Obstacles are always drawn as
 * exactly their collision silhouette — narrow posts plus wider caps at the
 * gap edges (collision.ts) — whatever they are dressed up as, so what you
 * see is what you hit, minus the small forgiveness inset.
 */

export interface ThemeFrame {
  /** Smoothed score: slow ambient change (the garden's sky drifts through the night with it). */
  progress: number;
  /** Seconds of animation (frozen while paused). */
  time: number;
  /** World x of the screen's left edge. */
  scroll: number;
}

export interface Theme {
  /** Everything behind the obstacles, ground included. */
  backdrop(ctx: CanvasRenderingContext2D, view: View, f: ThemeFrame): void;
  /** One obstacle whose left edge is at screen-world x `sx`; top posts reach up to `viewTop`. */
  obstacle(ctx: CanvasRenderingContext2D, o: Obstacle, sx: number, viewTop: number): void;
  /** Drawn over the obstacles' feet, under the cats (optional). */
  foreground?(ctx: CanvasRenderingContext2D, view: View, f: ThemeFrame): void;
}

let sky: SkyPalette = skyAt(0);
let skyAtProgress = 0;

/** The original: sunset to night over the city, the garden wall, cat-tree posts. */
const GARDEN_THEME: Theme = {
  backdrop(ctx, view, f) {
    if (Math.abs(f.progress - skyAtProgress) > 0.002) {
      sky = skyAt(f.progress);
      skyAtProgress = f.progress;
    }
    drawSky(ctx, view, sky);
    drawStars(ctx, view, sky, f.time, f.scroll);
    drawSunMoon(ctx, sky);
    drawClouds(ctx, view, sky, f.time, f.scroll);
    drawCity(ctx, view, sky, f.scroll);
    drawWall(ctx, view, f.scroll);
  },
  obstacle(ctx, o, sx, viewTop) {
    drawObstacle(ctx, o, sx, viewTop);
  },
};

export const THEMES: Readonly<Record<MapId, Theme>> = {
  garden: GARDEN_THEME,
  library: LIBRARY_THEME,
  clouds: CLOUDS_THEME,
  moon: MOON_THEME,
};
