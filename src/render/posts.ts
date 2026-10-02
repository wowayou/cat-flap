import { OBSTACLE, WORLD } from '../game/config.ts';
import type { GapShape } from '../game/collision.ts';
import { INK, POST_COLORS } from './palette.ts';

/*
 * Obstacles are cat-tree scratching posts: a sisal-wrapped column with a
 * carpeted platform at the gap edge. The drawn silhouette is exactly the
 * collision silhouette (posts + caps, see collision.ts), so what you see is
 * what you hit, minus a small forgiveness inset.
 */

const ROPE_STEP = 6;
const ROPE_SLANT = 7;
const OUTLINE = 2.5;

function drawPost(ctx: CanvasRenderingContext2D, x: number, top: number, bottom: number): void {
  const w = OBSTACLE.postWidth;
  const h = bottom - top;
  if (h <= 0) return;
  ctx.fillStyle = POST_COLORS.sisal;
  ctx.fillRect(x, top, w, h);
  // Cylinder shading.
  ctx.fillStyle = POST_COLORS.sisalLight;
  ctx.fillRect(x + 5, top, 8, h);
  ctx.fillStyle = POST_COLORS.sisalShade;
  ctx.fillRect(x + w - 12, top, 12, h);

  // Wrapped rope: slanted strands anchored to world y, so the pattern doesn't crawl.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, h);
  ctx.clip();
  ctx.strokeStyle = POST_COLORS.rope;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const first = Math.floor(top / ROPE_STEP) * ROPE_STEP;
  for (let y = first; y < bottom + ROPE_SLANT; y += ROPE_STEP) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y - ROPE_SLANT);
  }
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = INK;
  ctx.lineWidth = OUTLINE;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
  ctx.moveTo(x + w, top);
  ctx.lineTo(x + w, bottom);
  ctx.stroke();
}

/** Carpeted platform. `facing` is the side the cat flies past (the lit, fuzzy edge). */
function drawCap(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, facing: 'up' | 'down'): void {
  ctx.fillStyle = POST_COLORS.carpet;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fill();
  ctx.fillStyle = POST_COLORS.carpetLight;
  ctx.beginPath();
  if (facing === 'up') ctx.roundRect(x + 2, y + 2, w - 4, 5, 3);
  else ctx.roundRect(x + 2, y + h - 7, w - 4, 5, 3);
  ctx.fill();
  // Carpet tufts.
  ctx.fillStyle = POST_COLORS.carpetShade;
  const ty = facing === 'up' ? y + h - 5 : y + 5;
  ctx.beginPath();
  for (let tx = x + 6; tx < x + w - 4; tx += 7) ctx.rect(tx, ty - 1, 2, 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = OUTLINE;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.stroke();
}

/**
 * Draw one obstacle whose cap's left edge is at screen-world x `sx`.
 * `viewTop` lets top posts reach the top of tall screens.
 */
export function drawObstacle(ctx: CanvasRenderingContext2D, o: GapShape, sx: number, viewTop: number): void {
  const { capWidth, capHeight, postWidth } = OBSTACLE;
  const postX = sx + (capWidth - postWidth) / 2;
  const gapTop = o.gapY - o.gap / 2;
  const gapBottom = o.gapY + o.gap / 2;

  drawPost(ctx, postX, viewTop - 4, gapTop - capHeight + 2);
  drawCap(ctx, sx, gapTop - capHeight, capWidth, capHeight, 'down');

  drawPost(ctx, postX, gapBottom + capHeight - 2, WORLD.groundY);
  drawCap(ctx, sx, gapBottom, capWidth, capHeight, 'up');
  // A low carpeted foot standing on the wall.
  drawCap(ctx, sx + 4, WORLD.groundY - 9, capWidth - 8, 9, 'up');
}
