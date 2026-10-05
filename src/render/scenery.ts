import { WORLD } from '../game/config.ts';
import { createRng } from '../game/rng.ts';
import { INK, WALL_COLORS, type SkyPalette } from './palette.ts';
import type { View } from './view.ts';

/*
 * Backdrop layers, back to front: sky, stars, sun/moon, clouds, far city,
 * near rooftops, then the garden wall the cat must not touch. Layouts are
 * generated once from a fixed seed and tiled, so nothing is allocated per
 * frame and the skyline is the same every visit.
 */

const rng = createRng(0xca7f1a9);
const rand = (a: number, b: number) => a + rng() * (b - a);

interface Star { x: number; y: number; size: number; phase: number; rate: number }
const STAR_TILE = 720;
const STARS: Star[] = Array.from({ length: 90 }, () => ({
  x: rand(0, STAR_TILE),
  y: rand(-260, 380),
  size: rng() < 0.15 ? 2 : 1.2,
  phase: rand(0, Math.PI * 2),
  rate: rand(0.8, 2.4),
}));

interface Cloud { x: number; y: number; s: number; puffs: [number, number, number][] }
const CLOUD_TILE = 900;
const CLOUDS: Cloud[] = Array.from({ length: 6 }, (_, i) => {
  const n = 4 + Math.floor(rng() * 3);
  const puffs: [number, number, number][] = [];
  for (let k = 0; k < n; k++) {
    const r = rand(10, 18);
    puffs.push([k * 13 - n * 6.5 + rand(-3, 3), -r * 0.45 + rand(-4, 2), r]);
  }
  return { x: (i + rng() * 0.6) * (CLOUD_TILE / 6), y: rand(70, 330), s: rand(0.7, 1.25), puffs };
});

interface Building { x: number; w: number; h: number; windows: number[]; roof: number; chimney: number; antenna: boolean }

function makeSkyline(tile: number, minW: number, maxW: number, minH: number, maxH: number, litChance: number): Building[] {
  const out: Building[] = [];
  let x = 0;
  while (x < tile - minW) {
    const w = Math.min(rand(minW, maxW), tile - x);
    const h = rand(minH, maxH);
    const windows: number[] = [];
    for (let wy = 10; wy < h - 8; wy += 11) {
      for (let wx = 6; wx < w - 8; wx += 9) {
        if (rng() < litChance) windows.push(wx, wy);
      }
    }
    out.push({ x, w, h, windows, roof: rng() < 0.5 ? rand(8, 18) : 0, chimney: rng() < 0.55 ? rand(0.2, 0.7) : -1, antenna: rng() < 0.3 });
    x += w + rand(0, 5);
  }
  return out;
}

const FAR_TILE = 720;
const FAR = makeSkyline(FAR_TILE, 24, 52, 70, 160, 0.3);
const NEAR_TILE = 600;
const NEAR = makeSkyline(NEAR_TILE, 46, 92, 26, 70, 0.06);

interface Ivy { x: number; leaves: [number, number, number][] }
const IVY_TILE = 640;
const IVY: Ivy[] = Array.from({ length: 4 }, (_, i) => ({
  x: (i + rng() * 0.5) * (IVY_TILE / 4),
  leaves: Array.from({ length: 4 + Math.floor(rng() * 4) }, (_, k) => [k * 6 + rand(-2, 2), rand(2, 16 + k * 2), rand(-0.8, 0.8)] as [number, number, number]),
}));

/** Repeat a tiled layer across the visible range. */
export function tiles(view: View, offset: number, tile: number, each: (originX: number) => void): void {
  const start = Math.floor((view.left + offset) / tile) * tile - offset;
  for (let x = start; x < view.right; x += tile) each(x);
}

export function drawSky(ctx: CanvasRenderingContext2D, view: View, sky: SkyPalette): void {
  const g = ctx.createLinearGradient(0, view.top, 0, WORLD.groundY);
  g.addColorStop(0, sky.top);
  g.addColorStop(0.55, sky.mid);
  g.addColorStop(1, sky.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(view.left, view.top, view.right - view.left, WORLD.groundY - view.top + 1);
}

export function drawStars(ctx: CanvasRenderingContext2D, view: View, sky: SkyPalette, time: number, scroll: number): void {
  if (sky.stars < 0.02) return;
  ctx.fillStyle = '#fff6dc';
  tiles(view, scroll * 0.02, STAR_TILE, (ox) => {
    for (const s of STARS) {
      const y = s.y;
      if (y < view.top) continue;
      ctx.globalAlpha = sky.stars * (0.55 + 0.45 * Math.sin(time * s.rate + s.phase));
      ctx.fillRect(ox + s.x, y, s.size, s.size);
    }
  });
  ctx.globalAlpha = 1;
}

/** Left of centre, clear of the title card and the score. */
const MOON_X = 44;
const MOON_Y = 158;

export function drawSunMoon(ctx: CanvasRenderingContext2D, sky: SkyPalette): void {
  if (sky.sun > 0.02) {
    const g = ctx.createRadialGradient(252, 470, 10, 252, 470, 120);
    g.addColorStop(0, 'rgba(255,236,170,0.9)');
    g.addColorStop(0.35, 'rgba(255,190,130,0.35)');
    g.addColorStop(1, 'rgba(255,170,120,0)');
    ctx.globalAlpha = sky.sun;
    ctx.fillStyle = g;
    ctx.fillRect(132, 350, 240, 210);
    ctx.fillStyle = '#ffe8a3';
    ctx.beginPath();
    ctx.arc(252, 470, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (sky.moon > 0.02) {
    ctx.globalAlpha = sky.moon * 0.25;
    ctx.fillStyle = '#fff4d6';
    ctx.beginPath();
    ctx.arc(MOON_X, MOON_Y, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = sky.moon;
    ctx.beginPath();
    ctx.arc(MOON_X, MOON_Y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(214,196,160,0.55)';
    ctx.beginPath();
    ctx.arc(MOON_X - 7, MOON_Y - 6, 4.5, 0, Math.PI * 2);
    ctx.arc(MOON_X + 7, MOON_Y + 7, 3, 0, Math.PI * 2);
    ctx.arc(MOON_X + 4, MOON_Y - 9, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function drawClouds(ctx: CanvasRenderingContext2D, view: View, sky: SkyPalette, time: number, scroll: number): void {
  ctx.fillStyle = sky.cloud;
  ctx.globalAlpha = 0.85;
  tiles(view, scroll * 0.08 + time * 5, CLOUD_TILE, (ox) => {
    for (const c of CLOUDS) {
      const cx = ox + c.x;
      if (cx < view.left - 80 || cx > view.right + 80) continue;
      ctx.beginPath();
      for (const [px, py, r] of c.puffs) {
        ctx.moveTo(cx + px * c.s + r * c.s, c.y + py * c.s);
        ctx.arc(cx + px * c.s, c.y + py * c.s, r * c.s, 0, Math.PI * 2);
      }
      // Flat bottom, like a cartoon cloud.
      ctx.rect(cx + c.puffs[0][0] * c.s, c.y - 6 * c.s, (c.puffs[c.puffs.length - 1][0] - c.puffs[0][0]) * c.s, 8 * c.s);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
}

function drawSkyline(
  ctx: CanvasRenderingContext2D, view: View, layer: Building[], tile: number, offset: number,
  fill: string, windowColor: string, windowAlpha: number,
): void {
  const base = WORLD.groundY + 2;
  tiles(view, offset, tile, (ox) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (const b of layer) {
      const x = ox + b.x;
      if (x > view.right || x + b.w < view.left) continue;
      const top = base - b.h;
      ctx.rect(x, top, b.w, b.h);
      if (b.roof > 0) {
        ctx.moveTo(x - 2, top + 0.5);
        ctx.lineTo(x + b.w / 2, top - b.roof);
        ctx.lineTo(x + b.w + 2, top + 0.5);
      }
      if (b.chimney >= 0) ctx.rect(x + b.w * b.chimney, top - b.roof * 0.6 - 12, 8, 14 + b.roof * 0.6);
      if (b.antenna) {
        const ax = x + b.w * 0.75;
        ctx.rect(ax, top - b.roof - 16, 1.5, 16 + b.roof);
        ctx.rect(ax - 6, top - b.roof - 12, 13, 1.5);
      }
    }
    ctx.fill();
    if (windowAlpha <= 0) return;
    ctx.fillStyle = windowColor;
    ctx.globalAlpha = windowAlpha;
    ctx.beginPath();
    for (const b of layer) {
      const x = ox + b.x;
      if (x > view.right || x + b.w < view.left) continue;
      const top = base - b.h;
      for (let i = 0; i < b.windows.length; i += 2) ctx.rect(x + b.windows[i], top + b.windows[i + 1], 4, 5);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

export function drawCity(ctx: CanvasRenderingContext2D, view: View, sky: SkyPalette, scroll: number): void {
  // Windows light up as it gets dark.
  const lit = 0.35 + 0.65 * Math.min(1, sky.stars + 0.2);
  drawSkyline(ctx, view, FAR, FAR_TILE, scroll * 0.18, sky.far, sky.window, 0.75 * lit);
  drawSkyline(ctx, view, NEAR, NEAR_TILE, scroll * 0.42, sky.near, sky.window, 0.9 * lit);
}

const CAP_H = 12;
const CAP_W = 36;
const BRICK_W = 30;
const BRICK_H = 13;

/** The garden wall: the ground. Scrolls 1:1 with the posts. */
export function drawWall(ctx: CanvasRenderingContext2D, view: View, scroll: number): void {
  const y0 = WORLD.groundY;
  const left = view.left;
  const width = view.right - view.left;

  ctx.fillStyle = WALL_COLORS.mortar;
  ctx.fillRect(left, y0, width, view.bottom - y0);

  // Bricks, staggered per row.
  const top = y0 + CAP_H;
  for (let row = 0, y = top; y < view.bottom; row++, y += BRICK_H) {
    const shift = row % 2 === 0 ? 0 : BRICK_W / 2;
    const first = Math.floor((left + scroll - shift) / BRICK_W);
    for (let col = first; col * BRICK_W + shift - scroll < view.right; col++) {
      const x = col * BRICK_W + shift - scroll;
      ctx.fillStyle = ((col * 7 + row * 13) & 3) === 0 ? WALL_COLORS.brickAlt : WALL_COLORS.brick;
      ctx.fillRect(x + 1.5, y + 1.5, BRICK_W - 3, BRICK_H - 3);
    }
  }
  // Gentle depth: the wall darkens towards the bottom of the screen.
  const shade = ctx.createLinearGradient(0, top, 0, top + 90);
  shade.addColorStop(0, 'rgba(42,27,61,0)');
  shade.addColorStop(1, 'rgba(42,27,61,0.45)');
  ctx.fillStyle = shade;
  ctx.fillRect(left, top, width, view.bottom - top);

  // Coping stones along the top.
  ctx.fillStyle = WALL_COLORS.capShade;
  ctx.fillRect(left, y0, width, CAP_H);
  ctx.fillStyle = WALL_COLORS.cap;
  const firstCap = Math.floor((left + scroll) / CAP_W);
  ctx.beginPath();
  for (let c = firstCap; c * CAP_W - scroll < view.right; c++) {
    ctx.roundRect(c * CAP_W - scroll + 1, y0 + 1, CAP_W - 2, CAP_H - 4, 3);
  }
  ctx.fill();

  drawIvy(ctx, view, scroll);

  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(left, y0);
  ctx.lineTo(view.right, y0);
  ctx.stroke();
}

function drawIvy(ctx: CanvasRenderingContext2D, view: View, scroll: number): void {
  tiles(view, scroll, IVY_TILE, (ox) => {
    for (const ivy of IVY) {
      const x = ox + ivy.x;
      if (x < view.left - 40 || x > view.right + 10) continue;
      ctx.strokeStyle = WALL_COLORS.ivy;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 2, WORLD.groundY + 3);
      ctx.quadraticCurveTo(x + 10, WORLD.groundY + 14, x + 18, WORLD.groundY + 28);
      ctx.stroke();
      ivy.leaves.forEach(([lx, ly, rot], i) => {
        ctx.fillStyle = i % 2 ? WALL_COLORS.ivyLight : WALL_COLORS.ivy;
        ctx.beginPath();
        ctx.ellipse(x + lx, WORLD.groundY + 4 + ly, 4.2, 2.8, rot, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });
}
