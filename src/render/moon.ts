import { OBSTACLE, WORLD } from '../game/config.ts';
import { createRng } from '../game/rng.ts';
import { INK } from './palette.ts';
import { tiles } from './scenery.ts';
import type { Theme } from './themes.ts';
import type { View } from './view.ts';

/*
 * The moon: black sky full of stars, the Earth hanging over the horizon,
 * grey ridges and cratered ground. Obstacles are spires of moon rock.
 */

const C = {
  skyTop: '#05071a',
  skyMid: '#111637',
  skyLow: '#272c58',
  star: '#fff6dc',
  ocean: '#3d7bd9',
  land: '#5dbb63',
  cloud: 'rgba(255,255,255,0.85)',
  farRidge: '#262b52',
  nearRidge: '#363c69',
  ground: '#8f91a8',
  groundTop: '#b9bbcc',
  crater: '#73758e',
  craterRim: '#b4b6c9',
  rock: '#8b8da6',
  rockLight: '#aeb0c4',
  rockShade: '#6c6e88',
  slab: '#a2a4ba',
  slabLight: '#c6c8d8',
} as const;

const rng = createRng(0x300f);
const rand = (a: number, b: number) => a + rng() * (b - a);

const STAR_TILE = 720;
const STARS = Array.from({ length: 150 }, () => ({
  x: rand(0, STAR_TILE), y: rand(-300, 520), size: rng() < 0.12 ? 2 : rng() < 0.5 ? 1.3 : 0.9, phase: rand(0, 6.3), rate: rand(0.6, 2.2),
}));

/** A ridge line: x every `step`, heights above the ground. */
function makeRidge(tile: number, step: number, min: number, max: number): number[] {
  const hs: number[] = [];
  for (let x = 0; x <= tile; x += step) hs.push(rand(min, max));
  hs[hs.length - 1] = hs[0]; // tiles seamlessly
  return hs;
}
const FAR_TILE = 720;
const FAR_STEP = 30;
const FAR_RIDGE = makeRidge(FAR_TILE, FAR_STEP, 40, 120);
const NEAR_TILE = 600;
const NEAR_STEP = 40;
const NEAR_RIDGE = makeRidge(NEAR_TILE, NEAR_STEP, 18, 62);

const CRATER_TILE = 520;
const CRATERS = Array.from({ length: 9 }, () => ({ x: rand(0, CRATER_TILE), y: rand(14, 70), rx: rand(8, 22), ry: rand(3, 6) }));

/** Pits in the rock spires, repeating down the post (anchored to world y). */
const PIT_TILE = 64;
const PITS = Array.from({ length: 4 }, () => ({ fx: rand(0.15, 0.7), y: rand(4, PIT_TILE - 6), r: rand(2.5, 5) }));
const OVERHANG = (OBSTACLE.capWidth - OBSTACLE.postWidth) / 2;

function drawEarth(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const r = 27;
  const glow = ctx.createRadialGradient(x, y, r - 2, x, y, r + 16);
  glow.addColorStop(0, 'rgba(120,180,255,0.45)');
  glow.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - r - 16, y - r - 16, 2 * r + 32, 2 * r + 32);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = C.ocean;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.fillStyle = C.land;
  ctx.beginPath();
  ctx.ellipse(x - 9, y - 6, 10, 13, 0.5, 0, Math.PI * 2);
  ctx.ellipse(x + 12, y + 10, 9, 6, -0.3, 0, Math.PI * 2);
  ctx.ellipse(x + 4, y - 19, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.cloud;
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 2, 16, 3, -0.2, 0, Math.PI * 2);
  ctx.ellipse(x - 10, y + 16, 10, 2.5, 0.1, 0, Math.PI * 2);
  ctx.fill();
  // Night side.
  ctx.fillStyle = 'rgba(5,7,26,0.55)';
  ctx.beginPath();
  ctx.arc(x + 12, y + 6, r + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRidge(ctx: CanvasRenderingContext2D, view: View, hs: number[], tile: number, step: number, offset: number, fill: string): void {
  const base = WORLD.groundY + 2;
  ctx.fillStyle = fill;
  tiles(view, offset, tile, (ox) => {
    ctx.beginPath();
    ctx.moveTo(ox, base);
    for (let i = 0; i < hs.length; i++) ctx.lineTo(ox + i * step, base - hs[i]);
    ctx.lineTo(ox + tile, base);
    ctx.closePath();
    ctx.fill();
  });
}

function drawGround(ctx: CanvasRenderingContext2D, view: View, scroll: number): void {
  const y0 = WORLD.groundY;
  const left = view.left;
  const width = view.right - view.left;
  ctx.fillStyle = C.ground;
  ctx.fillRect(left, y0, width, view.bottom - y0);
  ctx.fillStyle = C.groundTop;
  ctx.fillRect(left, y0, width, 4);
  tiles(view, scroll, CRATER_TILE, (ox) => {
    for (const c of CRATERS) {
      const x = ox + c.x;
      if (x < view.left - 30 || x > view.right + 30) continue;
      ctx.fillStyle = C.craterRim;
      ctx.beginPath();
      ctx.ellipse(x, y0 + c.y + 1.5, c.rx, c.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.crater;
      ctx.beginPath();
      ctx.ellipse(x, y0 + c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const shade = ctx.createLinearGradient(0, y0 + 4, 0, y0 + 110);
  shade.addColorStop(0, 'rgba(10,12,40,0)');
  shade.addColorStop(1, 'rgba(10,12,40,0.5)');
  ctx.fillStyle = shade;
  ctx.fillRect(left, y0 + 4, width, view.bottom - y0 - 4);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(left, y0);
  ctx.lineTo(view.right, y0);
  ctx.stroke();
}

function drawSpire(ctx: CanvasRenderingContext2D, x: number, w: number, top: number, bottom: number): void {
  if (bottom <= top) return;
  ctx.fillStyle = C.rock;
  ctx.fillRect(x, top, w, bottom - top);
  ctx.fillStyle = C.rockLight;
  ctx.fillRect(x + 4, top, 7, bottom - top);
  ctx.fillStyle = C.rockShade;
  ctx.fillRect(x + w - 11, top, 11, bottom - top);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, bottom - top);
  ctx.clip();
  ctx.fillStyle = C.rockShade;
  ctx.beginPath();
  for (let y = Math.floor(top / PIT_TILE) * PIT_TILE; y < bottom; y += PIT_TILE) {
    for (const p of PITS) {
      const px = x + 6 + p.fx * (w - 12);
      ctx.moveTo(px + p.r, y + p.y);
      ctx.ellipse(px, y + p.y, p.r, p.r * 0.7, 0, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
  ctx.moveTo(x + w, top);
  ctx.lineTo(x + w, bottom);
  ctx.stroke();
}

function drawSlab(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, facing: 'up' | 'down'): void {
  ctx.fillStyle = C.slab;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = C.slabLight;
  ctx.fillRect(x + 3, facing === 'up' ? y + 2 : y + h - 5, w - 6, 3);
  ctx.fillStyle = C.rockShade;
  ctx.fillRect(x + w * 0.3, facing === 'up' ? y + h - 5 : y + 3, 5, 2);
  ctx.fillRect(x + w * 0.62, facing === 'up' ? y + h - 6 : y + 4, 3, 2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.stroke();
}

export const MOON_THEME: Theme = {
  backdrop(ctx, view, f) {
    const g = ctx.createLinearGradient(0, view.top, 0, WORLD.groundY);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(0.6, C.skyMid);
    g.addColorStop(1, C.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(view.left, view.top, view.right - view.left, WORLD.groundY - view.top + 1);
    ctx.fillStyle = C.star;
    tiles(view, f.scroll * 0.03, STAR_TILE, (ox) => {
      for (const s of STARS) {
        if (s.y < view.top) continue;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(f.time * s.rate + s.phase);
        ctx.fillRect(ox + s.x, s.y, s.size, s.size);
      }
    });
    ctx.globalAlpha = 1;
    drawEarth(ctx, 74, 150);
    drawRidge(ctx, view, FAR_RIDGE, FAR_TILE, FAR_STEP, f.scroll * 0.12, C.farRidge);
    drawRidge(ctx, view, NEAR_RIDGE, NEAR_TILE, NEAR_STEP, f.scroll * 0.3, C.nearRidge);
    drawGround(ctx, view, f.scroll);
  },
  obstacle(ctx, o, sx, viewTop) {
    const { capHeight } = OBSTACLE;
    const gapTop = o.gapY - o.gap / 2;
    const gapBottom = o.gapY + o.gap / 2;
    const postW = o.width - 2 * OVERHANG;
    drawSpire(ctx, sx + OVERHANG, postW, viewTop - 4, gapTop - capHeight + 2);
    drawSlab(ctx, sx, gapTop - capHeight, o.width, capHeight, 'down');
    drawSpire(ctx, sx + OVERHANG, postW, gapBottom + capHeight - 2, WORLD.groundY);
    drawSlab(ctx, sx, gapBottom, o.width, capHeight, 'up');
  },
};
