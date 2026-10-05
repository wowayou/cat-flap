import { OBSTACLE, WORLD } from '../game/config.ts';
import { createRng } from '../game/rng.ts';
import { INK } from './palette.ts';
import { tiles } from './scenery.ts';
import type { Theme } from './themes.ts';
import type { View } from './view.ts';

/*
 * Above the clouds by day: a bright sky, the sun, banks of cloud drifting by,
 * a few birds, and a sea of cloud below (fall into it and that's the run).
 * Obstacles are cloud pillars; the ones that bob are tinted lavender, so a
 * player can tell which will move before they start to.
 */

const C = {
  skyTop: '#3d93dc',
  skyMid: '#86c8f1',
  skyLow: '#dff3ff',
  sun: '#fff6cf',
  farCloud: 'rgba(255,255,255,0.55)',
  midCloud: 'rgba(255,255,255,0.88)',
  bird: '#2f5a80',
  sea: '#f7fcff',
  seaShade: 'rgba(120,175,225,0.45)',
  puff: '#ffffff',
  puffShade: '#d3e8f7',
  moving: '#f6e8ff',
  movingShade: '#d8bff0',
} as const;

const rng = createRng(0xc10d5);
const rand = (a: number, b: number) => a + rng() * (b - a);

interface Bank { x: number; y: number; puffs: [number, number, number][] }

function makeBanks(count: number, tile: number, yMin: number, yMax: number, size: number): Bank[] {
  return Array.from({ length: count }, (_, i) => {
    const n = 4 + Math.floor(rng() * 4);
    const puffs: [number, number, number][] = [];
    for (let k = 0; k < n; k++) {
      const r = rand(0.6, 1) * size;
      puffs.push([k * size * 0.8 - n * size * 0.4 + rand(-4, 4), -r * 0.4 + rand(-5, 3), r]);
    }
    return { x: (i + rng() * 0.6) * (tile / count), y: rand(yMin, yMax), puffs };
  });
}

const FAR_TILE = 960;
const FAR_BANKS = makeBanks(5, FAR_TILE, 390, 500, 30);
const MID_TILE = 780;
const MID_BANKS = makeBanks(5, MID_TILE, 110, 360, 17);
const BIRD_TILE = 1100;
const BIRDS = Array.from({ length: 4 }, () => ({ x: rand(0, BIRD_TILE), y: rand(90, 300), s: rand(0.8, 1.2), phase: rand(0, 6) }));

/** Bumps along the top of the cloud sea, one per column. */
const SEA_STEP = 24;
const seaRadius = (col: number) => 15 + ((col * 7919) % 9);

function drawBanks(ctx: CanvasRenderingContext2D, view: View, banks: Bank[], tile: number, offset: number, fill: string): void {
  ctx.fillStyle = fill;
  tiles(view, offset, tile, (ox) => {
    ctx.beginPath();
    for (const b of banks) {
      const cx = ox + b.x;
      if (cx < view.left - 160 || cx > view.right + 160) continue;
      for (const [px, py, r] of b.puffs) {
        ctx.moveTo(cx + px + r, b.y + py);
        ctx.arc(cx + px, b.y + py, r, 0, Math.PI * 2);
      }
      const first = b.puffs[0];
      const last = b.puffs[b.puffs.length - 1];
      ctx.rect(cx + first[0], b.y - 4, last[0] - first[0], 10);
    }
    ctx.fill();
  });
}

function drawBirds(ctx: CanvasRenderingContext2D, view: View, f: { time: number; scroll: number }): void {
  ctx.strokeStyle = C.bird;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.55;
  tiles(view, f.scroll * 0.3 - f.time * 18, BIRD_TILE, (ox) => {
    ctx.beginPath();
    for (const b of BIRDS) {
      const x = ox + b.x;
      if (x < view.left - 20 || x > view.right + 20) continue;
      const flap = Math.sin(f.time * 7 + b.phase) * 3 * b.s;
      ctx.moveTo(x - 6 * b.s, b.y - flap);
      ctx.lineTo(x, b.y + 2 * b.s);
      ctx.lineTo(x + 6 * b.s, b.y - flap);
    }
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

function drawSea(ctx: CanvasRenderingContext2D, view: View, scroll: number): void {
  const y0 = WORLD.groundY;
  const first = Math.floor((view.left + scroll) / SEA_STEP) - 1;
  const bumps = (grow: number) => {
    ctx.beginPath();
    for (let col = first; col * SEA_STEP - scroll < view.right + SEA_STEP; col++) {
      const x = col * SEA_STEP - scroll;
      const r = seaRadius(col) + grow;
      ctx.moveTo(x + r, y0 + 14);
      ctx.arc(x, y0 + 14, r, 0, Math.PI * 2);
    }
  };
  // Outline first, then the fill over it: only the outer edge of the bumps stays inked.
  bumps(2.5);
  ctx.fillStyle = INK;
  ctx.fill();
  bumps(0);
  ctx.fillStyle = C.sea;
  ctx.fill();
  ctx.fillRect(view.left, y0 + 14, view.right - view.left, view.bottom - y0 - 14);
  const shade = ctx.createLinearGradient(0, y0 + 10, 0, y0 + 90);
  shade.addColorStop(0, 'rgba(120,175,225,0)');
  shade.addColorStop(1, C.seaShade);
  ctx.fillStyle = shade;
  ctx.fillRect(view.left, y0 + 10, view.right - view.left, view.bottom - y0 - 10);
}

// ------------------------------------------------------------------ pillars

const PUFF_STEP = 12;
const PUFF_R = 4;
const OVERHANG = (OBSTACLE.capWidth - OBSTACLE.postWidth) / 2;

/**
 * Outlines are an inked copy of the shape grown by this much, filled first
 * and then covered: only the outer edge stays ink. Much cheaper to raster
 * than stroking every bump.
 */
const LINE = 2.5;

/** A cloud column: a soft post with scalloped sides (bumps reach 2px past the collision edge). */
function pillarPath(ctx: CanvasRenderingContext2D, x: number, w: number, top: number, bottom: number, grow: number): void {
  ctx.beginPath();
  ctx.rect(x - grow, top - grow, w + 2 * grow, bottom - top + 2 * grow);
  const r = PUFF_R + grow;
  const first = Math.floor(top / PUFF_STEP) * PUFF_STEP;
  for (let y = first; y < bottom; y += PUFF_STEP) {
    if (y < top + 2 || y > bottom - 2) continue;
    ctx.moveTo(x + 2 + r, y);
    ctx.arc(x + 2, y, r, 0, Math.PI * 2);
    ctx.moveTo(x + w - 2 + r, y);
    ctx.arc(x + w - 2, y, r, 0, Math.PI * 2);
  }
}

function drawPillar(ctx: CanvasRenderingContext2D, x: number, w: number, top: number, bottom: number, fill: string, shade: string): void {
  if (bottom <= top) return;
  pillarPath(ctx, x, w, top, bottom, LINE);
  ctx.fillStyle = INK;
  ctx.fill();
  pillarPath(ctx, x, w, top, bottom, 0);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = shade;
  ctx.fillRect(x + w * 0.64, top, w * 0.36 - 1, bottom - top);
}

/** The flat side faces the gap; puffs bulge on the pillar side only, never into the gap. */
function drawPlatform(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, facing: 'up' | 'down', fill: string, shade: string): void {
  const py = facing === 'up' ? y + h : y;
  const shape = (grow: number) => {
    ctx.beginPath();
    ctx.roundRect(x - grow, y - grow, w + 2 * grow, h + 2 * grow, h / 2 + grow);
    for (let k = 1; k <= 3; k++) {
      const cx = x + (w * k) / 4;
      ctx.moveTo(cx + 7 + grow, py);
      ctx.arc(cx, py, 7 + grow, 0, Math.PI * 2);
    }
  };
  shape(LINE);
  ctx.fillStyle = INK;
  ctx.fill();
  shape(0);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = shade;
  ctx.fillRect(x + 4, facing === 'up' ? y + h - 5 : y + 2, w - 8, 3);
}

export const CLOUDS_THEME: Theme = {
  backdrop(ctx, view, f) {
    const g = ctx.createLinearGradient(0, view.top, 0, WORLD.groundY);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(0.55, C.skyMid);
    g.addColorStop(1, C.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(view.left, view.top, view.right - view.left, WORLD.groundY - view.top + 1);

    const glow = ctx.createRadialGradient(292, 104, 8, 292, 104, 120);
    glow.addColorStop(0, 'rgba(255,250,220,0.95)');
    glow.addColorStop(0.3, 'rgba(255,244,200,0.35)');
    glow.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(292 - 120, 104 - 120, 240, 240);
    ctx.fillStyle = C.sun;
    ctx.beginPath();
    ctx.arc(292, 104, 26, 0, Math.PI * 2);
    ctx.fill();

    drawBanks(ctx, view, FAR_BANKS, FAR_TILE, f.scroll * 0.06 + f.time * 3, C.farCloud);
    drawBirds(ctx, view, f);
    drawBanks(ctx, view, MID_BANKS, MID_TILE, f.scroll * 0.2 + f.time * 7, C.midCloud);
    // Beside the frame on wide screens; the frame's own strip is drawn in front of the pillars.
    if (view.left < -0.5) drawSea(ctx, view, f.scroll);
  },
  // In front of the pillars: they rise out of the cloud sea.
  foreground(ctx, view, f) {
    drawSea(ctx, view, f.scroll);
  },
  obstacle(ctx, o, sx, viewTop) {
    const { capHeight } = OBSTACLE;
    const fill = o.amp > 0 ? C.moving : C.puff;
    const shade = o.amp > 0 ? C.movingShade : C.puffShade;
    const gapTop = o.gapY - o.gap / 2;
    const gapBottom = o.gapY + o.gap / 2;
    const postW = o.width - 2 * OVERHANG;
    drawPillar(ctx, sx + OVERHANG, postW, viewTop - 4, gapTop - capHeight + 2, fill, shade);
    drawPlatform(ctx, sx, gapTop - capHeight, o.width, capHeight, 'down', fill, shade);
    drawPillar(ctx, sx + OVERHANG, postW, gapBottom + capHeight - 2, WORLD.groundY + 10, fill, shade);
    drawPlatform(ctx, sx, gapBottom, o.width, capHeight, 'up', fill, shade);
  },
};
