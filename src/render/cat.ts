import atlasUrl from '../assets/cat.svg';

export type EyeState = 'open' | 'blink' | 'wide' | 'dead';
export type MouthState = 'smile' | 'open' | 'tongue';

/** Presentation only; the pivot is the unchanged collision-circle centre. */
export interface CatPose {
  tilt: number;
  scaleX: number;
  scaleY: number;
  /** Cape lift and wave phase/strength. */
  cape: number;
  ripple: number;
  billow: number;
  /** -1: reaching forward, 0: gliding, 1: paws down. */
  legs: number;
  eyes: EyeState;
  mouth: MouthState;
  tail: number;
  /** Ears fold outwards on impact. */
  ears: number;
}

export const DEFAULT_POSE: CatPose = {
  tilt: 0, scaleX: 1, scaleY: 1, cape: 0.18, ripple: 0, billow: 0.3,
  legs: 0, eyes: 'open', mouth: 'smile', tail: 0, ears: 0,
};

const HEAD_RIG = {
  near: { x: 2, y: -18, droop: -0.8 },
  far: { x: 24, y: -20, droop: 0.7 },
} as const;

// Rasterize the source SVG once, then retain the occupied bounds of each layer.
// No SVG decoding, filters or new canvases inside the frame loop.
const CELL_W = 96;
const CELL_H = 80;
// One source pixel covers two world units. Rotate and stretch on this grid,
// then enlarge with nearest-neighbour sampling so every pose stays pixel art.
const ART_SCALE = 0.5;
const ORIGIN_X = 48;
const ORIGIN_Y = 40;
// Includes the whole tilted cat, even during the stretched belly-up landing.
const SPRITE_W = 144;
const SPRITE_H = 144;
const EYES: Record<EyeState, number> = { open: 6, blink: 7, wide: 8, dead: 9 };
const MOUTH: Record<MouthState, number> = { smile: 10, open: 11, tongue: 12 };
let atlasPixels: Uint32Array | null = null;
let frame: ImageData | null = null;
let framePixels: Uint32Array | null = null;
let sprite: CanvasRenderingContext2D | null = null;
let loading: Promise<void> | null = null;
interface LayerRect { sx: number; sy: number; w: number; h: number; x: number; y: number }
const layers: LayerRect[] = [];

/** Await before enabling input or drawing, so the player is never invisible. */
export function loadCatArt(): Promise<void> {
  return loading ??= (async () => {
    const image = new Image();
    image.src = atlasUrl;
    await image.decode();
    const sheet = document.createElement('canvas');
    sheet.width = CELL_W * 4 * ART_SCALE;
    sheet.height = CELL_H * 4 * ART_SCALE;
    const ctx = sheet.getContext('2d');
    if (!ctx) throw new Error('Cannot prepare character artwork');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, sheet.width, sheet.height);
    // Most cells are transparent. Crop once at load time so six animated
    // cats don't resample full 96×80 cells for every tiny paw and eye.
    const pixels = ctx.getImageData(0, 0, sheet.width, sheet.height).data;
    atlasPixels = new Uint32Array(pixels.buffer);
    const cellW = CELL_W * ART_SCALE, cellH = CELL_H * ART_SCALE;
    for (let cell = 0; cell < 16; cell++) {
      const sx = (cell % 4) * cellW, sy = Math.floor(cell / 4) * cellH;
      let left = cellW, top = cellH, right = -1, bottom = -1;
      for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) {
        if (pixels[((sy + y) * sheet.width + sx + x) * 4 + 3] === 0) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      if (right < left) throw new Error(`Empty character layer: ${cell}`);
      // Keep a transparent pixel around each crop for rotated layer edges.
      left = Math.max(0, left - 1); top = Math.max(0, top - 1);
      right = Math.min(cellW - 1, right + 1); bottom = Math.min(cellH - 1, bottom + 1);
      layers.push({ sx: sx + left, sy: sy + top, w: right - left + 1, h: bottom - top + 1,
        x: left / ART_SCALE - ORIGIN_X, y: top / ART_SCALE - ORIGIN_Y });
    }
    const composite = document.createElement('canvas');
    composite.width = SPRITE_W * ART_SCALE;
    composite.height = SPRITE_H * ART_SCALE;
    sprite = composite.getContext('2d');
    if (!sprite) throw new Error('Cannot prepare character composite');
    sprite.imageSmoothingEnabled = false;
    frame = sprite.createImageData(composite.width, composite.height);
    framePixels = new Uint32Array(frame.data.buffer);
  })();
}

function layer(ctx: CanvasRenderingContext2D, cell: number): void {
  const r = layers[cell];
  const m = ctx.getTransform();
  const a = m.a / ART_SCALE, b = m.b / ART_SCALE, c = m.c / ART_SCALE, d = m.d / ART_SCALE;
  const tx = m.a * r.x + m.c * r.y + m.e, ty = m.b * r.x + m.d * r.y + m.f;
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const left = Math.max(0, Math.floor(Math.min(tx, tx + a * r.w, tx + c * r.h, tx + a * r.w + c * r.h)));
  const right = Math.min(w, Math.ceil(Math.max(tx, tx + a * r.w, tx + c * r.h, tx + a * r.w + c * r.h)));
  const top = Math.max(0, Math.floor(Math.min(ty, ty + b * r.w, ty + d * r.h, ty + b * r.w + d * r.h)));
  const bottom = Math.min(h, Math.ceil(Math.max(ty, ty + b * r.w, ty + d * r.h, ty + b * r.w + d * r.h)));
  const determinant = a * d - b * c;
  // Sample each destination pixel's centre ourselves. Firefox antialiases
  // rotated drawImage edges even with imageSmoothingEnabled=false; copying
  // whole source pixels preserves the exact palette and binary alpha everywhere.
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const dx = x + 0.5 - tx, dy = y + 0.5 - ty;
    const u = Math.floor((d * dx - c * dy) / determinant);
    const v = Math.floor((a * dy - b * dx) / determinant);
    if (u < 0 || u >= r.w || v < 0 || v >= r.h) continue;
    const pixel = atlasPixels![(r.sy + v) * CELL_W * 4 * ART_SCALE + r.sx + u];
    if (pixel !== 0) framePixels![y * w + x] = pixel;
  }
}

function paw(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, far = false): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (far) ctx.scale(0.8, 0.8);
  layer(ctx, far ? 5 : 4);
  ctx.restore();
}

/** Two hand-drawn pixel frames; the same airflow still drives cape lift. */
function cape(ctx: CanvasRenderingContext2D, pose: CatPose): void {
  ctx.save();
  ctx.translate(-2, -7);
  ctx.rotate(pose.cape * 0.65);
  layer(ctx, Math.sin(pose.ripple) * pose.billow > 0.15 ? 15 : 14);
  ctx.restore();
}

/** Both the player and the silhouette use exactly these layers and joints. */
function drawLayers(ctx: CanvasRenderingContext2D, pose: CatPose): void {
  const legs = Math.max(-1, Math.min(1, pose.legs));
  ctx.save();
  ctx.translate(-22, 2);
  ctx.rotate(pose.tail);
  layer(ctx, 3);
  ctx.restore();
  paw(ctx, -13, 3, 3.35 - Math.max(0, legs) * 1.45, true);
  paw(ctx, 9, 1, -0.45 + Math.max(0, legs) * 1.4, true);
  cape(ctx, pose);
  layer(ctx, 0);
  paw(ctx, -16, 8, 3.2 - Math.max(0, legs) * 1.35);
  for (const ear of [HEAD_RIG.far, HEAD_RIG.near]) {
    ctx.save();
    ctx.translate(ear.x, ear.y);
    ctx.rotate(pose.ears * ear.droop);
    layer(ctx, 2);
    ctx.restore();
  }
  layer(ctx, 1);
  layer(ctx, EYES[pose.eyes]);
  layer(ctx, MOUTH[pose.mouth]);
  layer(ctx, 13);
  paw(ctx, 15 - Math.min(0, legs) * 4, 9, -0.16 + legs * (legs < 0 ? 0.18 : 1.05));
}

export function drawCat(ctx: CanvasRenderingContext2D, x: number, y: number, pose: CatPose): void {
  const art = compose(pose);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art.canvas, x - SPRITE_W / 2, y - SPRITE_H / 2, SPRITE_W, SPRITE_H);
  ctx.restore();
}

/** Compose every transform before scaling: player and ghost share exact pixels. */
function compose(pose: CatPose): CanvasRenderingContext2D {
  if (!sprite || !frame || !framePixels) throw new Error('Character artwork must be loaded before drawing');
  framePixels.fill(0);
  sprite.save();
  sprite.setTransform(ART_SCALE, 0, 0, ART_SCALE, SPRITE_W / 2 * ART_SCALE, SPRITE_H / 2 * ART_SCALE);
  sprite.rotate(pose.tilt);
  sprite.scale(pose.scaleX, pose.scaleY);
  drawLayers(sprite, pose);
  sprite.restore();
  sprite.putImageData(frame, 0, 0);
  return sprite;
}

/** Apply alpha once to the complete cat: overlapping limbs never turn darker. */
export function drawGhostCat(ctx: CanvasRenderingContext2D, x: number, y: number, pose: CatPose, fur: string, alpha: number): void {
  const art = compose(pose);
  art.globalCompositeOperation = 'source-in';
  art.fillStyle = fur;
  art.fillRect(0, 0, art.canvas.width, art.canvas.height);
  art.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha *= alpha;
  ctx.drawImage(art.canvas, x - SPRITE_W / 2, y - SPRITE_H / 2, SPRITE_W, SPRITE_H);
  ctx.restore();
}
