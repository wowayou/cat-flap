import { CAT_COLORS, INK } from './palette.ts';

/*
 * The cat, drawn with paths (crisp at any DPR, freely rotated/squashed).
 * Local coordinates: origin at the hitbox centre, facing +x, +y down.
 * The art deliberately overhangs the 13px hitbox — ears, tail, wings, paws,
 * muzzle — so near misses look close, and visual overlap never counts as a hit.
 */

export type EyeState = 'open' | 'blink' | 'wide' | 'dead';
export type MouthState = 'smile' | 'open' | 'tongue';

export interface CatPose {
  /** Rotation in radians; positive = nose down. */
  tilt: number;
  scaleX: number;
  scaleY: number;
  /** Wing position: 0 = raised, 1 = fully down. */
  wing: number;
  /** -1 = tucked back (shooting up), 0 = relaxed, 1 = splayed (falling). */
  legs: number;
  eyes: EyeState;
  mouth: MouthState;
  /** Tail swing in radians. */
  tail: number;
}

export const DEFAULT_POSE: CatPose = { tilt: 0, scaleX: 1, scaleY: 1, wing: 0.3, legs: 0, eyes: 'open', mouth: 'smile', tail: 0 };

const LINE = 2.2;
const TAU = Math.PI * 2;
/** Art offset from the hitbox centre, so the circle sits on the visual mass (body + head), not the tail. */
const ART_X = -4;
const ART_Y = 1;

export function drawCat(ctx: CanvasRenderingContext2D, x: number, y: number, pose: CatPose): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(pose.tilt);
  ctx.scale(pose.scaleX, pose.scaleY);
  ctx.translate(ART_X, ART_Y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawTail(ctx, pose.tail);
  drawLegs(ctx, pose.legs);
  drawWing(ctx, -1, -9, pose.wing, true);
  drawBody(ctx);
  drawWing(ctx, -4, -8, pose.wing, false);
  drawHead(ctx, pose);

  ctx.restore();
}

function drawTail(ctx: CanvasRenderingContext2D, swing: number): void {
  ctx.save();
  ctx.translate(-16, 3);
  ctx.rotate(swing);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-10, 2, -14, -4, -15, -16);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 8.4;
  ctx.stroke();
  ctx.strokeStyle = CAT_COLORS.fur;
  ctx.lineWidth = 4.4;
  ctx.stroke();
  // Darker tip.
  ctx.beginPath();
  ctx.moveTo(-14.4, -11);
  ctx.lineTo(-15, -16);
  ctx.strokeStyle = CAT_COLORS.furShade;
  ctx.stroke();
  ctx.restore();
}

/** Leg anchors (on the body) and their end offsets for tucked / relaxed / splayed. */
const LEGS: { ax: number; ay: number; tuck: [number, number]; rest: [number, number]; splay: [number, number] }[] = [
  { ax: -11, ay: 9, tuck: [-8, 3], rest: [-1, 7], splay: [-8, 6] },
  { ax: -5, ay: 11, tuck: [-8, 2], rest: [0, 7], splay: [-5, 7] },
  { ax: 4, ay: 11, tuck: [-7, 4], rest: [1, 7], splay: [6, 7] },
  { ax: 9, ay: 9, tuck: [-6, 5], rest: [2, 7], splay: [8, 5] },
];

function drawLegs(ctx: CanvasRenderingContext2D, legs: number): void {
  const t = Math.max(-1, Math.min(1, legs));
  for (let i = 0; i < LEGS.length; i++) {
    const l = LEGS[i];
    const [fx, fy] = t < 0 ? l.tuck : l.splay;
    const k = Math.abs(t);
    const ex = l.ax + l.rest[0] + (fx - l.rest[0]) * k;
    const ey = l.ay + l.rest[1] + (fy - l.rest[1]) * k;
    ctx.beginPath();
    ctx.moveTo(l.ax, l.ay);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 7.6;
    ctx.stroke();
    ctx.strokeStyle = i === 0 || i === 3 ? CAT_COLORS.furShade : CAT_COLORS.fur;
    ctx.lineWidth = 3.6;
    ctx.stroke();
    ctx.fillStyle = CAT_COLORS.cream;
    ctx.beginPath();
    ctx.arc(ex, ey, 1.9, 0, TAU);
    ctx.fill();
  }
}

function bodyPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.ellipse(-2, 3, 17, 12.5, 0, 0, TAU);
}

function drawBody(ctx: CanvasRenderingContext2D): void {
  bodyPath(ctx);
  ctx.fillStyle = CAT_COLORS.fur;
  ctx.fill();
  ctx.save();
  bodyPath(ctx);
  ctx.clip();
  ctx.fillStyle = CAT_COLORS.cream;
  ctx.beginPath();
  ctx.ellipse(2, 11, 12, 6, 0, 0, TAU);
  ctx.fill();
  // Tabby stripes across the back.
  ctx.strokeStyle = CAT_COLORS.furShade;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  for (const sx of [-13, -7.5, -2]) {
    ctx.moveTo(sx, -10);
    ctx.quadraticCurveTo(sx + 2.5, -5, sx + 1, 0);
  }
  ctx.stroke();
  ctx.restore();
  bodyPath(ctx);
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.stroke();
}

/** A small feathered wing hinged at (sx, sy). Downstroke rotates the tip down and back. */
function drawWing(ctx: CanvasRenderingContext2D, sx: number, sy: number, down: number, far: boolean): void {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(0.3 - 1.35 * Math.max(0, Math.min(1, down)));
  if (far) ctx.scale(0.82, 0.82);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-5, -15, -21, -17);
  ctx.quadraticCurveTo(-18, -11, -22, -8.5);
  ctx.quadraticCurveTo(-15, -6.5, -17.5, -2.5);
  ctx.quadraticCurveTo(-10, -2.5, -11, 1.5);
  ctx.quadraticCurveTo(-5, 2.5, 0, 0);
  ctx.closePath();
  ctx.fillStyle = far ? CAT_COLORS.wingShade : CAT_COLORS.wing;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = far ? 1.8 : 2;
  ctx.stroke();
  if (!far) {
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.quadraticCurveTo(-11, -9, -16, -10);
    ctx.strokeStyle = CAT_COLORS.wingShade;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.restore();
}

function ear(ctx: CanvasRenderingContext2D, bx1: number, by1: number, tx: number, ty: number, bx2: number, by2: number): void {
  ctx.beginPath();
  ctx.moveTo(bx1, by1);
  ctx.lineTo(tx, ty);
  ctx.lineTo(bx2, by2);
  ctx.closePath();
  ctx.fillStyle = CAT_COLORS.fur;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.stroke();
  const cx = (bx1 + bx2) / 2;
  const cy = (by1 + by2) / 2;
  const k = 0.55;
  ctx.beginPath();
  ctx.moveTo(cx + (bx1 - cx) * k, cy + (by1 - cy) * k);
  ctx.lineTo(cx + (tx - cx) * k * 1.1, cy + (ty - cy) * k * 1.1);
  ctx.lineTo(cx + (bx2 - cx) * k, cy + (by2 - cy) * k);
  ctx.closePath();
  ctx.fillStyle = CAT_COLORS.pink;
  ctx.fill();
}

const HEAD_X = 11;
const HEAD_Y = -6;
const HEAD_R = 11.5;

function drawHead(ctx: CanvasRenderingContext2D, pose: CatPose): void {
  ear(ctx, 1.5, -11, 1.5, -24.5, 8.5, -16.5);
  ear(ctx, 11.5, -17.5, 18.5, -25.5, 19.5, -11);

  ctx.beginPath();
  ctx.arc(HEAD_X, HEAD_Y, HEAD_R, 0, TAU);
  ctx.fillStyle = CAT_COLORS.fur;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.stroke();

  // Forehead "M".
  ctx.strokeStyle = CAT_COLORS.furShade;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(7.5, -15.5);
  ctx.lineTo(8.5, -12.5);
  ctx.moveTo(11.5, -17);
  ctx.lineTo(11.5, -13.5);
  ctx.moveTo(15.5, -15.5);
  ctx.lineTo(14.5, -12.5);
  ctx.stroke();

  // Muzzle, blush, nose.
  ctx.fillStyle = CAT_COLORS.cream;
  ctx.beginPath();
  ctx.ellipse(18.5, -1.2, 5.8, 4.3, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(244,143,160,0.55)';
  ctx.beginPath();
  ctx.ellipse(10, -1, 2.8, 1.7, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = CAT_COLORS.pink;
  ctx.beginPath();
  ctx.moveTo(20.6, -4.6);
  ctx.lineTo(24.4, -4.6);
  ctx.lineTo(22.5, -2.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawMouth(ctx, pose.mouth);
  drawEye(ctx, 8.2, -8, pose.eyes, 0.88);
  drawEye(ctx, 15.6, -8.2, pose.eyes, 1);

  // Whiskers.
  ctx.strokeStyle = INK;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(22, -1.5);
  ctx.lineTo(31, -4);
  ctx.moveTo(22, 0.2);
  ctx.lineTo(31, 1.2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawMouth(ctx: CanvasRenderingContext2D, mouth: MouthState): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1;
  if (mouth === 'smile') {
    ctx.beginPath();
    ctx.moveTo(20, -0.6);
    ctx.quadraticCurveTo(21.3, 1.2, 22.5, -0.6);
    ctx.quadraticCurveTo(23.7, 1.2, 25, -0.6);
    ctx.stroke();
    return;
  }
  if (mouth === 'tongue') {
    ctx.fillStyle = CAT_COLORS.pink;
    ctx.beginPath();
    ctx.roundRect(21, -1, 3.6, 6.2, 1.8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(19.6, -0.8);
    ctx.lineTo(25.6, -0.8);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(22.5, 1, 2.1, 2.6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = CAT_COLORS.pink;
  ctx.beginPath();
  ctx.ellipse(22.5, 2.4, 1.4, 1, 0, 0, TAU);
  ctx.fill();
}

function drawEye(ctx: CanvasRenderingContext2D, ex: number, ey: number, state: EyeState, s: number): void {
  ctx.strokeStyle = INK;
  if (state === 'dead') {
    ctx.lineWidth = 1.6;
    const d = 2.4 * s;
    ctx.beginPath();
    ctx.moveTo(ex - d, ey - d);
    ctx.lineTo(ex + d, ey + d);
    ctx.moveTo(ex + d, ey - d);
    ctx.lineTo(ex - d, ey + d);
    ctx.stroke();
    return;
  }
  if (state === 'blink') {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ex - 3 * s, ey + 0.6);
    ctx.quadraticCurveTo(ex, ey + 2.6, ex + 3 * s, ey + 0.6);
    ctx.stroke();
    return;
  }
  const wide = state === 'wide';
  const rx = (wide ? 3.9 : 3.3) * s;
  const ry = (wide ? 4.6 : 4) * s;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(ex, ey, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.stroke();
  if (wide) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(ex + 0.4, ey + 0.4, 1.3 * s, 0, TAU);
    ctx.fill();
    return;
  }
  ctx.fillStyle = CAT_COLORS.iris;
  ctx.beginPath();
  ctx.arc(ex + 0.8 * s, ey + 0.4, 2.5 * s, 0, TAU);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(ex + 1 * s, ey + 0.4, 1 * s, 2.2 * s, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ex - 0.2 * s, ey - 1.4 * s, 0.9 * s, 0, TAU);
  ctx.fill();
}
