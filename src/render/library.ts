import { OBSTACLE, WORLD } from '../game/config.ts';
import { MAPS } from '../game/maps.ts';
import { createRng } from '../game/rng.ts';
import { INK } from './palette.ts';
import { tiles } from './scenery.ts';
import type { Theme } from './themes.ts';
import type { View } from './view.ts';

/*
 * The library at night: striped wallpaper, tall arched windows with the
 * moon in them, warm hanging lamps, rows of far bookcases and a plank floor.
 * Obstacles are bookcases: a shelf board at each gap edge and shelves of
 * books above and below. Long shelves are just wider bookcases.
 */

const C = {
  wall: '#3b2338',
  stripe: '#442a40',
  windowSky: '#1c2a5e',
  windowSkyLow: '#34407a',
  frame: '#6d4429',
  moon: '#fff1c9',
  lamp: '#e0a948',
  lampShade: '#b27a2c',
  farCase: '#2a1828',
  farShelf: '#3a2335',
  farBooks: ['#4a2d3f', '#40324f', '#523a2c', '#2f3a4a'],
  floor: '#8a5530',
  plank: '#6f4325',
  skirting: '#4a2a18',
  back: '#3b2016',
  wood: '#7a4826',
  woodLight: '#a8683b',
  woodDark: '#563019',
  board: '#9a5b31',
  boardLight: '#c27d48',
  brass: '#e2b65a',
  books: ['#c2453e', '#2f6f8f', '#d9a441', '#3f7d4e', '#7d4b8a', '#e07b39', '#2a4f7a', '#b8ad98', '#8c2f39'],
} as const;

const rng = createRng(0x11b7a7);
const rand = (a: number, b: number) => a + rng() * (b - a);

// ------------------------------------------------------------------ backdrop

const WINDOW_TILE = 560;
const LAMP_TILE = 380;
const CASE_TILE = 640;
const FLOOR_SEAM = 92;

interface Star { x: number; y: number; s: number }
const WINDOW_STARS: Star[] = Array.from({ length: 14 }, () => ({ x: rand(8, 112), y: rand(10, 150), s: rng() < 0.3 ? 2 : 1.2 }));

interface FarCase { x: number; w: number; h: number; books: [number, number, number, number, number][] }
const FAR_CASES: FarCase[] = (() => {
  const out: FarCase[] = [];
  let x = 0;
  while (x < CASE_TILE - 60) {
    const w = Math.min(rand(80, 140), CASE_TILE - x);
    const h = rand(110, 175);
    const books: [number, number, number, number, number][] = [];
    for (let shelf = 0; shelf * 30 + 26 < h - 6; shelf++) {
      for (let bx = 6; bx < w - 10;) {
        const bw = rand(4, 8);
        const bh = rand(14, 22);
        if (rng() < 0.85) books.push([bx, shelf * 30 + 26 - bh, bw, bh, Math.floor(rng() * C.farBooks.length)]);
        bx += bw + rand(0.5, 2);
      }
    }
    out.push({ x, w, h, books });
    x += w + rand(18, 60);
  }
  return out;
})();

function drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const w = 120;
  const h = 230;
  const arch = (inset: number) => {
    ctx.beginPath();
    ctx.moveTo(x + inset, y + h - inset);
    ctx.lineTo(x + inset, y + w / 2);
    ctx.arc(x + w / 2, y + w / 2, w / 2 - inset, Math.PI, 0);
    ctx.lineTo(x + w - inset, y + h - inset);
    ctx.closePath();
  };
  arch(0);
  ctx.fillStyle = C.frame;
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, C.windowSky);
  g.addColorStop(1, C.windowSkyLow);
  arch(7);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = '#fff6dc';
  for (const s of WINDOW_STARS) {
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 1.7 + s.x);
    ctx.fillRect(x + s.x, y + s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.moon;
  ctx.beginPath();
  ctx.arc(x + 82, y + 58, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.windowSky;
  ctx.beginPath();
  ctx.arc(x + 89, y + 53, 13, 0, Math.PI * 2);
  ctx.fill();
  // Mullions and the sill.
  ctx.fillStyle = C.frame;
  ctx.fillRect(x + w / 2 - 3, y + 8, 6, h - 12);
  ctx.fillRect(x + 6, y + 128, w - 12, 6);
  ctx.fillRect(x - 8, y + h - 4, w + 16, 10);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  arch(0);
  ctx.stroke();
}

function drawLamp(ctx: CanvasRenderingContext2D, view: View, x: number, t: number): void {
  const y = 58;
  ctx.strokeStyle = 'rgba(20,10,20,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, view.top);
  ctx.lineTo(x, y);
  ctx.stroke();
  // A warm pool of light that breathes a little, like a real bulb.
  const glow = ctx.createRadialGradient(x, y + 14, 4, x, y + 14, 92);
  glow.addColorStop(0, `rgba(255,205,130,${0.3 + 0.03 * Math.sin(t * 2.3 + x)})`);
  glow.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 92, y - 78, 184, 184);
  ctx.fillStyle = C.lamp;
  ctx.beginPath();
  ctx.moveTo(x - 7, y);
  ctx.lineTo(x + 7, y);
  ctx.lineTo(x + 16, y + 16);
  ctx.lineTo(x - 16, y + 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.lampShade;
  ctx.fillRect(x - 16, y + 13, 32, 3);
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(x, y + 18, 4, 0, Math.PI);
  ctx.fill();
}

function drawFarCases(ctx: CanvasRenderingContext2D, view: View, scroll: number): void {
  const base = WORLD.groundY + 2;
  tiles(view, scroll * 0.5, CASE_TILE, (ox) => {
    for (const c of FAR_CASES) {
      const x = ox + c.x;
      if (x > view.right || x + c.w < view.left) continue;
      ctx.fillStyle = C.farCase;
      ctx.fillRect(x, base - c.h, c.w, c.h);
      ctx.fillStyle = C.farShelf;
      for (let y = base - c.h + 26; y < base - 4; y += 30) ctx.fillRect(x + 3, y, c.w - 6, 4);
      for (const [bx, by, bw, bh, color] of c.books) {
        ctx.fillStyle = C.farBooks[color];
        ctx.fillRect(x + bx, base - c.h + by, bw, bh);
      }
    }
  });
}

function drawFloor(ctx: CanvasRenderingContext2D, view: View, scroll: number): void {
  const y0 = WORLD.groundY;
  const left = view.left;
  const width = view.right - view.left;
  ctx.fillStyle = C.floor;
  ctx.fillRect(left, y0, width, view.bottom - y0);
  ctx.fillStyle = C.skirting;
  ctx.fillRect(left, y0, width, 9);
  ctx.fillStyle = C.plank;
  for (let row = 0, y = y0 + 9 + 15; y < view.bottom; row++, y += 16) {
    ctx.fillRect(left, y, width, 1.5);
    const shift = (row * 37) % FLOOR_SEAM;
    const first = Math.floor((left + scroll - shift) / FLOOR_SEAM);
    for (let col = first; col * FLOOR_SEAM + shift - scroll < view.right; col++) {
      ctx.fillRect(col * FLOOR_SEAM + shift - scroll, y - 15, 1.5, 15);
    }
  }
  const shade = ctx.createLinearGradient(0, y0 + 9, 0, y0 + 100);
  shade.addColorStop(0, 'rgba(42,27,61,0)');
  shade.addColorStop(1, 'rgba(42,27,61,0.5)');
  ctx.fillStyle = shade;
  ctx.fillRect(left, y0 + 9, width, view.bottom - y0 - 9);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(left, y0);
  ctx.lineTo(view.right, y0);
  ctx.stroke();
}

// ------------------------------------------------------------------ bookcases

/** Distance between shelf boards; a tile holds three shelves and repeats down the post. */
const SHELF = 34;
const TILE_H = SHELF * 3;
/** Tile pixels per world unit: crisp on 2× phones without a canvas per obstacle. */
const RES = 3;
const VARIANTS = 3;
const OVERHANG = (OBSTACLE.capWidth - OBSTACLE.postWidth) / 2;
const shelfTiles = new Map<number, HTMLCanvasElement[]>();

/** Pre-drawn bookcase tiles for one post width (drawn once, on first use). */
function tilesFor(postW: number): HTMLCanvasElement[] {
  let found = shelfTiles.get(postW);
  if (found) return found;
  found = [];
  for (let v = 0; v < VARIANTS; v++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(postW * RES);
    canvas.height = TILE_H * RES;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(RES, RES);
      paintShelves(ctx, postW, createRng(postW * 7 + v * 131 + 5));
    }
    found.push(canvas);
  }
  shelfTiles.set(postW, found);
  return found;
}

function paintShelves(ctx: CanvasRenderingContext2D, w: number, r: () => number): void {
  ctx.fillStyle = C.back;
  ctx.fillRect(0, 0, w, TILE_H);
  for (let shelf = 0; shelf < 3; shelf++) {
    const floor = shelf * SHELF + SHELF - 5;
    for (let x = 5; x < w - 6;) {
      const bw = 4 + Math.floor(r() * 5);
      if (x + bw > w - 5) break;
      if (r() < 0.08) {
        x += bw + 2; // a gap on the shelf
        continue;
      }
      const bh = 15 + Math.floor(r() * 12);
      const color = C.books[Math.floor(r() * C.books.length)];
      ctx.fillStyle = color;
      ctx.fillRect(x, floor - bh, bw, bh);
      // Spine bands.
      ctx.fillStyle = 'rgba(255,240,210,0.35)';
      ctx.fillRect(x, floor - bh + 3, bw, 1.2);
      ctx.fillRect(x, floor - 5, bw, 1.2);
      ctx.fillStyle = 'rgba(20,10,20,0.35)';
      ctx.fillRect(x + bw - 1, floor - bh, 1, bh);
      x += bw + (r() < 0.3 ? 1 : 0.4);
    }
    ctx.fillStyle = C.board;
    ctx.fillRect(0, floor, w, 5);
    ctx.fillStyle = C.boardLight;
    ctx.fillRect(0, floor, w, 1.5);
  }
  // The case's sides.
  ctx.fillStyle = C.wood;
  ctx.fillRect(0, 0, 4, TILE_H);
  ctx.fillRect(w - 4, 0, 4, TILE_H);
  ctx.fillStyle = C.woodLight;
  ctx.fillRect(0.5, 0, 1.5, TILE_H);
}

function drawCase(ctx: CanvasRenderingContext2D, x: number, w: number, top: number, bottom: number, variant: number): void {
  if (bottom <= top) return;
  const tile = tilesFor(w)[variant % VARIANTS];
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, bottom - top);
  ctx.clip();
  // Anchored to world y, so the shelves don't crawl as a gap bobs or the screen changes.
  for (let y = Math.floor(top / TILE_H) * TILE_H; y < bottom; y += TILE_H) ctx.drawImage(tile, x, y, w, TILE_H);
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

/** A thick shelf board at a gap edge, lit on the side the cat flies past. */
function drawBoard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, facing: 'up' | 'down'): void {
  ctx.fillStyle = C.board;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.fill();
  ctx.fillStyle = C.boardLight;
  ctx.fillRect(x + 3, facing === 'up' ? y + 2 : y + h - 5, w - 6, 3);
  ctx.fillStyle = C.woodDark;
  ctx.fillRect(x + 3, facing === 'up' ? y + h - 4 : y + 2, w - 6, 2);
  ctx.fillStyle = C.brass;
  ctx.fillRect(x + 6, y + h / 2 - 1.5, 4, 3);
  ctx.fillRect(x + w - 10, y + h / 2 - 1.5, 4, 3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3);
  ctx.stroke();
}

export const LIBRARY_THEME: Theme = {
  backdrop(ctx, view, f) {
    // Paint every bookcase width up front (on the Ready screen), not when the first one scrolls in mid-run.
    for (const width of [OBSTACLE.capWidth, ...(MAPS.library.course.shelves?.widths ?? [])]) tilesFor(width - 2 * OVERHANG);
    ctx.fillStyle = C.wall;
    ctx.fillRect(view.left, view.top, view.right - view.left, WORLD.groundY - view.top + 1);
    ctx.fillStyle = C.stripe;
    tiles(view, f.scroll * 0.12, 26, (x) => ctx.fillRect(x, view.top, 9, WORLD.groundY - view.top));
    tiles(view, f.scroll * 0.22, WINDOW_TILE, (x) => drawWindow(ctx, x + 150, 92, f.time));
    tiles(view, f.scroll * 0.4, LAMP_TILE, (x) => drawLamp(ctx, view, x + 60, f.time));
    drawFarCases(ctx, view, f.scroll);
    drawFloor(ctx, view, f.scroll);
  },
  obstacle(ctx, o, sx, viewTop) {
    const { capHeight } = OBSTACLE;
    const gapTop = o.gapY - o.gap / 2;
    const gapBottom = o.gapY + o.gap / 2;
    const postW = o.width - 2 * OVERHANG;
    drawCase(ctx, sx + OVERHANG, postW, viewTop - 4, gapTop - capHeight + 2, o.index);
    drawBoard(ctx, sx, gapTop - capHeight, o.width, capHeight, 'down');
    drawCase(ctx, sx + OVERHANG, postW, gapBottom + capHeight - 2, WORLD.groundY, o.index + 1);
    drawBoard(ctx, sx, gapBottom, o.width, capHeight, 'up');
    // The plinth the case stands on.
    ctx.fillStyle = C.woodDark;
    ctx.beginPath();
    ctx.roundRect(sx + 4, WORLD.groundY - 9, o.width - 8, 9, 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  },
};
