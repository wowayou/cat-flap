import { CAPE_COLORS, GINGER, type CatCoat } from './palette.ts';

/*
 * The cat, drawn with paths (crisp at any DPR, freely rotated/squashed).
 * Local coordinates: origin at the hitbox centre, facing +x, +y down.
 *
 * Built the way an illustrator would build a real cat: a side-view body with
 * a round three-quarter head (big round eyes, full cheeks — see the head
 * section); body about two head lengths; ginger mackerel-tabby markings (forehead "M", eye-corner lines,
 * stripes branching down from the spine, a ringed tail; pale chin, chest and
 * belly). It flies like a superhero: a red cape tied at the throat streams
 * back against the airflow, a forepaw reaches ahead, the hind legs trail;
 * falling, all four reach down for a landing (the righting reflex).
 *
 * The art deliberately overhangs the 13px hitbox — ears, tail, cape, paws,
 * whiskers — so near misses look close, and visual overlap never counts as a hit.
 */

export type EyeState = 'open' | 'blink' | 'wide' | 'dead';
export type MouthState = 'smile' | 'open' | 'tongue';

export interface CatPose {
  /** Rotation in radians; positive = nose down. */
  tilt: number;
  scaleX: number;
  scaleY: number;
  /** Cape angle in radians against the line of the back; positive = the hem lifts. */
  cape: number;
  /** Phase of the ripples running down the cape (radians, advancing with time). */
  ripple: number;
  /** Ripple strength: 0 = lying still, 1 = whipping after a flap. */
  billow: number;
  /** -1 = tucked back (shooting up), 0 = relaxed, 1 = splayed (falling). */
  legs: number;
  eyes: EyeState;
  mouth: MouthState;
  /** Tail swing in radians. */
  tail: number;
}

export const DEFAULT_POSE: CatPose = { tilt: 0, scaleX: 1, scaleY: 1, cape: 0.25, ripple: 0, billow: 0.35, legs: 0, eyes: 'open', mouth: 'smile', tail: 0 };

const TAU = Math.PI * 2;
/** Silhouette outline width (detail lines are thinner). */
const LINE = 1.4;

export function drawCat(ctx: CanvasRenderingContext2D, x: number, y: number, pose: CatPose, coat: CatCoat = GINGER): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(pose.tilt);
  ctx.scale(pose.scaleX, pose.scaleY);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  drawFarLegs(ctx, coat, pose.legs);
  drawTorso(ctx, coat, pose);
  drawCape(ctx, coat, pose);
  drawHead(ctx, coat, pose);
  drawCapeTie(ctx, coat);

  ctx.restore();
}

// ---------------------------------------------------------------- legs

type Pt = readonly [number, number];
/** A leg as a joint chain (top → … → paw) in three poses; the top joint is hidden inside the body. */
interface Leg {
  rest: readonly Pt[];
  tuck: readonly Pt[];
  splay: readonly Pt[];
  widths: readonly number[];
}

const FORE_W = [5.6, 4.1, 3.5];
const HIND_W = [6.4, 4.3, 3.3];

// rest: superhero glide, the near forepaw reaching ahead under the chin, the far one folded to the chest, hind legs trailing.
// tuck: take-off, the near forepaw punching forward, hind legs thrown straight back.
// splay: falling, all four reaching down for a landing.
const NEAR_FORE: Leg = {
  rest: [[2, 5], [8.6, 10], [18.8, 8.8], [23.2, 8]],
  tuck: [[2, 5], [10, 8.8], [21, 7.4], [26, 6.4]],
  splay: [[2, 5], [4.4, 12.4], [6.8, 17.8], [7.4, 20]],
  widths: FORE_W,
};
const FAR_FORE: Leg = {
  rest: [[-1.5, 4], [1.6, 10.6], [8.4, 11.6], [11, 10.4]],
  tuck: [[-1.5, 4], [0.4, 10.6], [6.8, 11.8], [9.4, 10.4]],
  splay: [[-1.5, 4], [1.2, 11.4], [2.8, 16.8], [3.2, 19]],
  widths: FORE_W,
};
const NEAR_HIND: Leg = {
  rest: [[-16, 3], [-13.6, 9.8], [-20.6, 12.4], [-26.2, 12.4]],
  tuck: [[-16, 3], [-15.6, 9.4], [-24.2, 11], [-30.2, 9.4]],
  splay: [[-16, 3], [-12.4, 10.8], [-16.4, 15.8], [-15, 19.6]],
  widths: HIND_W,
};
const FAR_HIND: Leg = {
  rest: [[-19, 1.5], [-17.2, 8.4], [-24.2, 10.4], [-29.4, 9.8]],
  tuck: [[-19, 1.5], [-19.2, 7.8], [-27.4, 8.4], [-32.8, 6.2]],
  splay: [[-19, 1.5], [-15.8, 9.8], [-20.4, 14.6], [-19.4, 18.4]],
  widths: HIND_W,
};

const legPts: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0]];

/** Interpolates a leg's joints for `legs` ∈ [-1, 1] into the shared scratch array. */
function poseLeg(leg: Leg, legs: number): [number, number][] {
  const t = Math.max(-1, Math.min(1, legs));
  const target = t < 0 ? leg.tuck : leg.splay;
  const k = Math.abs(t);
  for (let i = 0; i < leg.rest.length; i++) {
    legPts[i][0] = leg.rest[i][0] + (target[i][0] - leg.rest[i][0]) * k;
    legPts[i][1] = leg.rest[i][1] + (target[i][1] - leg.rest[i][1]) * k;
  }
  return legPts;
}

/** Strokes a posed leg, each segment `extra` wider than its own width (outline pass) or exact (fill pass). */
function strokeLeg(ctx: CanvasRenderingContext2D, leg: Leg, legs: number, extra: number, color: string): void {
  const p = poseLeg(leg, legs);
  ctx.strokeStyle = color;
  for (let i = 0; i < leg.widths.length; i++) {
    ctx.lineWidth = leg.widths[i] + extra;
    ctx.beginPath();
    ctx.moveTo(p[i][0], p[i][1]);
    ctx.lineTo(p[i + 1][0], p[i + 1][1]);
    ctx.stroke();
  }
}

/** The paw at the end of a posed leg, lying along its last segment. */
function pawPath(ctx: CanvasRenderingContext2D, leg: Leg, legs: number): void {
  const p = poseLeg(leg, legs);
  const [ax, ay] = p[2];
  const [bx, by] = p[3];
  ctx.beginPath();
  ctx.ellipse(bx, by, 2.7, 1.9, Math.atan2(by - ay, bx - ax), 0, TAU);
}

function drawFarLegs(ctx: CanvasRenderingContext2D, coat: CatCoat, legs: number): void {
  for (const leg of [FAR_FORE, FAR_HIND]) {
    strokeLeg(ctx, leg, legs, 2 * LINE, coat.line);
    pawPath(ctx, leg, legs);
    ctx.lineWidth = 2 * LINE;
    ctx.stroke();
  }
  for (const leg of [FAR_FORE, FAR_HIND]) {
    strokeLeg(ctx, leg, legs, 0, coat.furShade);
    pawPath(ctx, leg, legs);
    ctx.fillStyle = coat.paw;
    ctx.fill();
    ctx.fillStyle = 'rgba(40,16,40,0.22)';
    ctx.fill();
  }
}

// ---------------------------------------------------------------- body + tail

function bodyPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(5, -8.6);
  ctx.bezierCurveTo(-2, -12, -12.5, -11.6, -19.5, -8.4); // shoulders → back
  ctx.bezierCurveTo(-25.4, -6.2, -28.2, -0.4, -26.2, 4.6); // rump
  ctx.bezierCurveTo(-24.6, 9.6, -18.6, 12, -13.4, 11); // back of the thigh
  ctx.bezierCurveTo(-8, 12.4, -1.4, 13.6, 4, 11.2); // belly
  ctx.bezierCurveTo(8.2, 8.8, 9.4, 2.4, 8.4, -2.6); // chest
  ctx.bezierCurveTo(8.2, -5.6, 7.2, -7.8, 5, -8.6); // neck
  ctx.closePath();
}

/** Tail centre line (cubic) and its width at base and tip: trailing out behind, under the cape. */
const TAIL = { x0: 0, y0: 0, x1: -8, y1: 2.4, x2: -14, y2: 2.6, x3: -19.6, y3: -3.4, w0: 5.4, w1: 3.8 };
const TAIL_BASE_X = -23.5;
const TAIL_BASE_Y = 1;
const TAIL_SAMPLES = 12;

function tailPoint(t: number): [number, number, number, number] {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  const x = a * TAIL.x0 + b * TAIL.x1 + c * TAIL.x2 + d * TAIL.x3;
  const y = a * TAIL.y0 + b * TAIL.y1 + c * TAIL.y2 + d * TAIL.y3;
  const dx = 3 * u * u * (TAIL.x1 - TAIL.x0) + 6 * u * t * (TAIL.x2 - TAIL.x1) + 3 * t * t * (TAIL.x3 - TAIL.x2);
  const dy = 3 * u * u * (TAIL.y1 - TAIL.y0) + 6 * u * t * (TAIL.y2 - TAIL.y1) + 3 * t * t * (TAIL.y3 - TAIL.y2);
  const len = Math.hypot(dx, dy) || 1;
  return [x, y, -dy / len, dx / len];
}

const tailWidth = (t: number) => (TAIL.w0 + (TAIL.w1 - TAIL.w0) * t) / 2;

/** A tapered tail outline with a rounded tip, in tail space (base at the origin). */
function tailPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  for (let i = 0; i <= TAIL_SAMPLES; i++) {
    const t = i / TAIL_SAMPLES;
    const [x, y, nx, ny] = tailPoint(t);
    const w = tailWidth(t);
    if (i === 0) ctx.moveTo(x + nx * w, y + ny * w);
    else ctx.lineTo(x + nx * w, y + ny * w);
  }
  const [tx, ty, nx, ny] = tailPoint(1);
  const tipAngle = Math.atan2(ny, nx);
  ctx.arc(tx, ty, tailWidth(1), tipAngle, tipAngle + Math.PI, true);
  for (let i = TAIL_SAMPLES; i >= 0; i--) {
    const t = i / TAIL_SAMPLES;
    const [x, y, nx2, ny2] = tailPoint(t);
    const w = tailWidth(t);
    ctx.lineTo(x - nx2 * w, y - ny2 * w);
  }
  ctx.closePath();
}

function tailDetails(ctx: CanvasRenderingContext2D, coat: CatCoat): void {
  if (!coat.stripe) return;
  ctx.save();
  tailPath(ctx);
  ctx.clip();
  ctx.strokeStyle = coat.stripe;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const t of [0.3, 0.47, 0.63, 0.78]) {
    const [x, y, nx, ny] = tailPoint(t);
    const w = tailWidth(t) + 1;
    ctx.moveTo(x + nx * w, y + ny * w);
    ctx.lineTo(x - nx * w, y - ny * w);
  }
  ctx.stroke();
  // Dark tip.
  const [x, y] = tailPoint(1);
  ctx.fillStyle = coat.stripe;
  ctx.beginPath();
  ctx.arc(x, y, 3.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Mackerel stripes: thin bands branching down from the spine, tapering towards the belly. */
const STRIPES: readonly [number, number, number][] = [
  // x at the spine, x at the tip, tip y
  [-21.5, -23.5, 3],
  [-16.5, -17.5, 5],
  [-11.5, -12, 5.5],
  [-6.5, -6.5, 4.5],
  [-1.5, -0.8, 1.5],
];

function bodyDetails(ctx: CanvasRenderingContext2D, coat: CatCoat): void {
  ctx.save();
  bodyPath(ctx);
  ctx.clip();

  // Pale chest bib and belly, soft-edged.
  if (coat.cream !== coat.fur) {
    ctx.fillStyle = coat.cream;
    ctx.beginPath();
    ctx.ellipse(-5, 14.2, 14.5, 5.2, -0.04, 0, TAU);
    ctx.ellipse(7.2, 4.5, 4, 7.6, 0.15, 0, TAU);
    ctx.fill();
  }

  if (coat.stripe) {
    // Darker spine line, then the branching stripes.
    const spine = ctx.createLinearGradient(0, -12, 0, -5);
    spine.addColorStop(0, coat.stripe);
    spine.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spine;
    ctx.fillRect(-30, -13, 40, 8);
    ctx.fillStyle = coat.stripe;
    ctx.beginPath();
    for (const [sx, tx, ty] of STRIPES) {
      ctx.moveTo(sx - 1.6, -12);
      ctx.quadraticCurveTo(sx - 0.6 + (tx - sx) * 0.4, (ty - 12) / 2, tx, ty);
      ctx.quadraticCurveTo(sx + 1.6 + (tx - sx) * 0.4, (ty - 12) / 2, sx + 1.8, -12);
      ctx.closePath();
    }
    ctx.fill();
  }

  // Thigh and shoulder contours give the body its muscle and volume.
  ctx.strokeStyle = coat.furShade;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-13, -3.5);
  ctx.bezierCurveTo(-10.4, 0, -10.6, 5.6, -13.6, 9);
  ctx.moveTo(4, -2.4);
  ctx.quadraticCurveTo(1.2, 1.8, 2.6, 6.2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Body, tail and near legs share one outline so they read as one animal. */
function drawTorso(ctx: CanvasRenderingContext2D, coat: CatCoat, pose: CatPose): void {
  const outline = 2 * LINE;
  ctx.strokeStyle = coat.line;
  ctx.lineWidth = outline;

  // Outline pass.
  ctx.save();
  ctx.translate(TAIL_BASE_X, TAIL_BASE_Y);
  ctx.rotate(pose.tail);
  tailPath(ctx);
  ctx.stroke();
  ctx.restore();
  for (const leg of [NEAR_FORE, NEAR_HIND]) {
    strokeLeg(ctx, leg, pose.legs, outline, coat.line);
    pawPath(ctx, leg, pose.legs);
    ctx.lineWidth = outline;
    ctx.stroke();
  }
  bodyPath(ctx);
  ctx.lineWidth = outline;
  ctx.stroke();

  // Fill pass: everything above covers the inner half of the outlines.
  ctx.save();
  ctx.translate(TAIL_BASE_X, TAIL_BASE_Y);
  ctx.rotate(pose.tail);
  tailPath(ctx);
  ctx.fillStyle = coat.fur;
  ctx.fill();
  tailDetails(ctx, coat);
  ctx.restore();

  for (const leg of [NEAR_FORE, NEAR_HIND]) {
    strokeLeg(ctx, leg, pose.legs, 0, coat.fur);
    pawPath(ctx, leg, pose.legs);
    ctx.fillStyle = coat.paw;
    ctx.fill();
  }

  const shade = ctx.createRadialGradient(-6, -5, 2, -6, -3, 24);
  shade.addColorStop(0, coat.furLight);
  shade.addColorStop(0.55, coat.fur);
  shade.addColorStop(1, coat.furShade);
  bodyPath(ctx);
  ctx.fillStyle = shade;
  ctx.fill();
  bodyDetails(ctx, coat);
}

// ---------------------------------------------------------------- cape

/**
 * The cape hangs from the neck (hidden behind the head) along a centre line
 * that leaves the back at a shallow angle and bends to `pose.cape`; ripples
 * travel down it towards the hem. Half-widths are measured from the centre
 * line: a little above it (the far side, over the back) and more below it
 * (draped down the near flank).
 */
const CAPE = { x: 2, y: -9.4, length: 37, neckAngle: 0.1, topNeck: 2.4, topHem: 8.4, botNeck: 6.2, botHem: 10.6 };
const CAPE_SEGS = 10;
/** Ripple wavelength along the cape, as radians of phase over its whole length. */
const CAPE_WAVE = 7.5;
const capeMid: [number, number][] = Array.from({ length: CAPE_SEGS + 1 }, () => [0, 0]);
const capeTop: [number, number][] = Array.from({ length: CAPE_SEGS + 1 }, () => [0, 0]);
const capeBot: [number, number][] = Array.from({ length: CAPE_SEGS + 1 }, () => [0, 0]);
/** Outward direction of the cape at its hem. */
const capeEnd: [number, number] = [0, 0];

/** Lays the cape out for a pose into the shared scratch arrays. */
function layoutCape(pose: CatPose): void {
  const ds = CAPE.length / CAPE_SEGS;
  const amp = 0.08 + 0.32 * pose.billow;
  let x = CAPE.x;
  let y = CAPE.y;
  for (let i = 0; i <= CAPE_SEGS; i++) {
    const u = i / CAPE_SEGS;
    const k = Math.min(1, u / 0.5);
    const bend = k * k * (3 - 2 * k);
    const a = CAPE.neckAngle + (pose.cape - CAPE.neckAngle) * bend + amp * u * Math.sin(pose.ripple - u * CAPE_WAVE);
    // Direction (pointing back along the cape) and the normal on its far side.
    const dx = -Math.cos(a);
    const dy = -Math.sin(a);
    if (i > 0) {
      x += dx * ds;
      y += dy * ds;
    }
    const wt = CAPE.topNeck + (CAPE.topHem - CAPE.topNeck) * u;
    const wb = CAPE.botNeck + (CAPE.botHem - CAPE.botNeck) * u;
    capeMid[i][0] = x;
    capeMid[i][1] = y;
    capeTop[i][0] = x - dy * wt;
    capeTop[i][1] = y + dx * wt;
    capeBot[i][0] = x + dy * wb;
    capeBot[i][1] = y - dx * wb;
    if (i === CAPE_SEGS) {
      capeEnd[0] = dx;
      capeEnd[1] = dy;
    }
  }
}

/**
 * The laid-out cape as one closed subpath: along the top edge, round a
 * scalloped hem, back along the bottom edge. `clockwise` picks the winding.
 */
function capePath(ctx: CanvasRenderingContext2D, clockwise: boolean): void {
  const n = CAPE_SEGS;
  const [ex, ey] = capeEnd;
  const [tx, ty] = capeTop[n];
  const [bx, by] = capeBot[n];
  // The hem: two bulges either side of a shallow notch.
  const mx = (tx + bx) / 2 - ex * 2;
  const my = (ty + by) / 2 - ey * 2;
  // Shoelace sign of top-then-bottom: positive is clockwise on screen (y down).
  let area = 0;
  for (let i = 0; i < n; i++) area += capeTop[i][0] * capeTop[i + 1][1] - capeTop[i + 1][0] * capeTop[i][1];
  area += tx * by - bx * ty;
  for (let i = n; i > 0; i--) area += capeBot[i][0] * capeBot[i - 1][1] - capeBot[i - 1][0] * capeBot[i][1];
  area += capeBot[0][0] * capeTop[0][1] - capeTop[0][0] * capeBot[0][1];
  const [from, to] = area > 0 === clockwise ? [capeTop, capeBot] : [capeBot, capeTop];

  ctx.moveTo(from[0][0], from[0][1]);
  for (let i = 1; i <= n; i++) ctx.lineTo(from[i][0], from[i][1]);
  const [fx, fy] = from[n];
  const [gx, gy] = to[n];
  ctx.quadraticCurveTo((fx + mx) / 2 + ex * 3, (fy + my) / 2 + ey * 3, mx, my);
  ctx.quadraticCurveTo((gx + mx) / 2 + ex * 3, (gy + my) / 2 + ey * 3, gx, gy);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(to[i][0], to[i][1]);
  ctx.closePath();
}

const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const CAPE_LIGHT = rgb(CAPE_COLORS.light);
const CAPE_BASE = rgb(CAPE_COLORS.cape);
const CAPE_SHADE = rgb(CAPE_COLORS.shade);

/** Cape colour for a shading value: 0 = lit, 0.5 = base, 1 = in shadow. */
function capeTone(t: number): string {
  const [a, b, k] = t < 0.5 ? [CAPE_LIGHT, CAPE_BASE, t * 2] : [CAPE_BASE, CAPE_SHADE, t * 2 - 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}

/**
 * A red superhero cape over the back. Its shading follows the ripples (cloth
 * tipping towards the light is lighter), with two fold lines running down it.
 */
function drawCape(ctx: CanvasRenderingContext2D, coat: CatCoat, pose: CatPose): void {
  layoutCape(pose);
  const n = CAPE_SEGS;
  const amp = 0.08 + 0.32 * pose.billow;
  const shade = ctx.createLinearGradient(capeMid[0][0], capeMid[0][1], capeMid[n][0], capeMid[n][1]);
  for (let i = 0; i <= n; i += 2) {
    const u = i / n;
    const tip = amp * u * Math.sin(pose.ripple - u * CAPE_WAVE);
    shade.addColorStop(u, capeTone(Math.max(0, Math.min(1, 0.55 - tip * 3.2))));
  }
  ctx.beginPath();
  capePath(ctx, true);
  ctx.fillStyle = shade;
  ctx.fill();

  ctx.strokeStyle = CAPE_COLORS.shade;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const f of [0.15, 0.6]) {
    for (let i = 2; i < n; i++) {
      const x = capeTop[i][0] + (capeBot[i][0] - capeTop[i][0]) * f;
      const y = capeTop[i][1] + (capeBot[i][1] - capeTop[i][1]) * f;
      if (i === 2) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  capePath(ctx, true);
  ctx.strokeStyle = coat.line;
  ctx.lineWidth = LINE;
  ctx.stroke();
}

/** The cape's tie: a band under the jaw and a small knot at the throat, its ends blown back. */
function drawCapeTie(ctx: CanvasRenderingContext2D, coat: CatCoat): void {
  ctx.strokeStyle = coat.line;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(3.6, 7);
  ctx.quadraticCurveTo(6, 8, 8.4, 7.4);
  ctx.moveTo(8, 8);
  ctx.quadraticCurveTo(7, 9.8, 5.2, 10.6);
  ctx.stroke();
  ctx.strokeStyle = CAPE_COLORS.cape;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(8.6, 7.4, 1.5, 1.2, 0.3, 0, TAU);
  ctx.fillStyle = CAPE_COLORS.cape;
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = coat.line;
  ctx.stroke();
}

// ---------------------------------------------------------------- head

/*
 * A round, cute head in three-quarter view, after the reference superhero
 * cats: a round skull with full cheeks (an Exotic's chubby face), big round
 * eyes that are mostly pupil, and the nose, mouth and whisker pads sitting
 * well inside the outline. The far eye is narrower (foreshortened) and the
 * face's centre line runs near the front of the head.
 */

/** Ears as [base 1, tip, base 2], each (x, y): near ear at the back of the skull, far ear at the front. */
const EAR_NEAR = [1.8, -11.4, 2.4, -24, 10.6, -16.8] as const;
const EAR_FAR = [15.6, -17.6, 22.8, -24.2, 23.8, -12.4] as const;
/** Eye centre, width, height and tilt: the near eye is the bigger one. */
const EYE_NEAR = { x: 10.6, y: -6.8, w: 6.8, h: 7.4, rot: 0.06 } as const;
const EYE_FAR = { x: 19.9, y: -7.1, w: 4.9, h: 7, rot: -0.06 } as const;
/** Bottom tip of the nose leather; the mouth hangs from it. */
const NOSE_X = 22.4;
const NOSE_Y = -1.4;

function headPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(1.2, -11.6);
  ctx.bezierCurveTo(4.4, -16.6, 11, -18.6, 16.6, -17.6); // crown
  ctx.bezierCurveTo(21.6, -16.6, 25, -13, 25.6, -8.8); // forehead
  ctx.bezierCurveTo(25.9, -6.6, 25.6, -5.2, 26.2, -3.8); // brow → top of the muzzle
  ctx.bezierCurveTo(27.8, -2, 27.9, 1.6, 25.8, 3.2); // far whisker pad
  ctx.bezierCurveTo(24.4, 5.2, 21.4, 6.2, 18.4, 6.1); // chin
  ctx.bezierCurveTo(14, 6.8, 9.6, 6.4, 6.4, 5.4); // jaw
  ctx.quadraticCurveTo(5.4, 6, 3.4, 6.6); // cheek ruff tufts
  ctx.quadraticCurveTo(3.6, 5.2, 1.4, 4.6);
  ctx.quadraticCurveTo(1.2, 3.4, -0.6, 2.6);
  ctx.bezierCurveTo(-1.4, -1.6, -1.2, -7.6, 1.2, -11.6); // full cheek → back of the skull
  ctx.closePath();
}

/** An ear: base corners b1, b2 and tip t, edges slightly convex. */
function drawEar(ctx: CanvasRenderingContext2D, coat: CatCoat, b1x: number, b1y: number, tx: number, ty: number, b2x: number, b2y: number, bulge: number): void {
  const edge = (ax: number, ay: number, bx: number, by: number, k: number) => {
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const dx = bx - ax;
    const dy = by - ay;
    ctx.quadraticCurveTo(mx + dy * k, my - dx * k, bx, by);
  };
  ctx.beginPath();
  ctx.moveTo(b1x, b1y);
  edge(b1x, b1y, tx, ty, bulge);
  edge(tx, ty, b2x, b2y, bulge);
  ctx.closePath();
  ctx.fillStyle = coat.fur;
  ctx.fill();
  ctx.strokeStyle = coat.line;
  ctx.lineWidth = LINE;
  ctx.stroke();

  // Inner ear, with pale tufts of fur growing out of it.
  const cx = (b1x + b2x) / 2;
  const cy = (b1y + b2y) / 2;
  const ix1 = cx + (b1x - cx) * 0.55, iy1 = cy + (b1y - cy) * 0.55;
  const ix2 = cx + (b2x - cx) * 0.55, iy2 = cy + (b2y - cy) * 0.55;
  const itx = cx + (tx - cx) * 0.78, ity = cy + (ty - cy) * 0.78;
  ctx.beginPath();
  ctx.moveTo(ix1, iy1);
  ctx.quadraticCurveTo((ix1 + itx) / 2 - 0.6, (iy1 + ity) / 2, itx, ity);
  ctx.quadraticCurveTo((ix2 + itx) / 2 + 0.6, (iy2 + ity) / 2, ix2, iy2);
  ctx.closePath();
  ctx.fillStyle = coat.earInner;
  ctx.fill();
  ctx.strokeStyle = coat.cream;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const f of [0.3, 0.5, 0.7]) {
    const bx = ix1 + (ix2 - ix1) * f;
    const by = iy1 + (iy2 - iy1) * f;
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + (itx - bx) * 0.55 + (f - 0.5) * 1.6, by + (ity - by) * 0.55);
  }
  ctx.stroke();
}

function headDetails(ctx: CanvasRenderingContext2D, coat: CatCoat): void {
  ctx.save();
  headPath(ctx);
  ctx.clip();

  if (coat.stripe) {
    ctx.strokeStyle = coat.stripe;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    // Forehead "M", centred between the eyes and tilted with the face.
    ctx.moveTo(13.4, -18);
    ctx.lineTo(14.2, -13.6);
    ctx.moveTo(16.4, -18.2);
    ctx.lineTo(16.6, -13.8);
    ctx.moveTo(19.4, -17.2);
    ctx.lineTo(18.8, -13.4);
    ctx.moveTo(10.4, -16.8);
    ctx.quadraticCurveTo(11.2, -14.6, 10.8, -12.6);
    ctx.moveTo(22.2, -15);
    ctx.quadraticCurveTo(21.4, -13.4, 21.6, -11.6);
    // Cheek stripes behind the near eye, and the back of the head.
    ctx.moveTo(5.8, -5.6);
    ctx.quadraticCurveTo(3.4, -5.8, 0.6, -4.4);
    ctx.moveTo(6, -2.2);
    ctx.quadraticCurveTo(3.4, -1.8, 0.2, -0.2);
    ctx.moveTo(4.6, -14.6);
    ctx.quadraticCurveTo(4.2, -12.6, 2, -11.2);
    ctx.stroke();
  }

  // Rosy cheek under the near eye.
  ctx.fillStyle = coat.earInner;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(8.6, -0.6, 2.8, 1.5, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Pale whisker pads and chin.
  ctx.fillStyle = coat.cream;
  ctx.beginPath();
  ctx.ellipse(20.2, 0.6, 3.6, 2.8, -0.1, 0, TAU);
  ctx.ellipse(24.6, 0.4, 2.8, 2.7, 0.1, 0, TAU);
  ctx.ellipse(22.4, 3.6, 3, 2, 0, 0, TAU);
  ctx.fill();
  // Whisker spots.
  ctx.fillStyle = coat.furShade;
  ctx.globalAlpha = 0.6;
  for (const [x, y] of [[18.4, 0], [19.8, -0.6], [18.8, 1.4], [25.4, -0.4], [25.8, 1]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 0.35, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * One big round eye: an iris ringing a large round pupil, two catchlights and
 * a heavier upper lid. In a fright the eye opens wider and the pupil shrinks
 * to a dot.
 */
function drawEye(ctx: CanvasRenderingContext2D, coat: CatCoat, eye: typeof EYE_NEAR | typeof EYE_FAR, state: EyeState): void {
  const { w, h } = eye;
  ctx.save();
  ctx.translate(eye.x, eye.y);
  ctx.rotate(eye.rot);
  ctx.strokeStyle = coat.line;

  if (state === 'dead') {
    ctx.lineWidth = 1.4;
    const d = w * 0.36;
    ctx.beginPath();
    ctx.moveTo(-d, -d);
    ctx.lineTo(d, d);
    ctx.moveTo(d, -d);
    ctx.lineTo(-d, d);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (state === 'blink') {
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -0.4);
    ctx.quadraticCurveTo(0, h * 0.42, w / 2, -0.4);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const wide = state === 'wide';
  const rx = (wide ? w * 1.1 : w) / 2;
  const ry = (wide ? h * 1.14 : h) / 2;
  // Looking ahead: the pupil sits a little forward.
  const px = rx * 0.14;

  const iris = ctx.createRadialGradient(px, 0, 0.3, px, 0, ry * 1.05);
  iris.addColorStop(0, coat.irisInner);
  iris.addColorStop(0.55, coat.irisInner);
  iris.addColorStop(1, coat.irisOuter);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fillStyle = iris;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#160c14';
  ctx.beginPath();
  if (wide) ctx.ellipse(px, 0, rx * 0.3, ry * 0.3, 0, 0, TAU);
  else ctx.ellipse(px, ry * 0.04, rx * 0.66, ry * 0.7, 0, 0, TAU);
  ctx.fill();
  // Shadow of the upper lid.
  const lid = ctx.createLinearGradient(0, -ry, 0, -ry * 0.2);
  lid.addColorStop(0, 'rgba(30,12,30,0.35)');
  lid.addColorStop(1, 'rgba(30,12,30,0)');
  ctx.fillStyle = lid;
  ctx.fillRect(-rx, -ry, rx * 2, ry);
  ctx.restore();

  // Catchlights: a big one up and back, a small one low and forward.
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(px - rx * 0.3, -ry * 0.32, Math.max(0.7, rx * 0.3), 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(px + rx * 0.3, ry * 0.3, Math.max(0.4, rx * 0.13), 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.92);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

function drawNoseAndMouth(ctx: CanvasRenderingContext2D, coat: CatCoat, mouth: MouthState): void {
  const nx = NOSE_X;
  const ny = NOSE_Y;
  // Nose leather: a small rounded triangle, point down.
  ctx.beginPath();
  ctx.moveTo(nx - 2, ny - 2.4);
  ctx.quadraticCurveTo(nx, ny - 3.2, nx + 1.9, ny - 2.5);
  ctx.quadraticCurveTo(nx + 1.6, ny - 0.7, nx, ny);
  ctx.quadraticCurveTo(nx - 1.6, ny - 0.7, nx - 2, ny - 2.4);
  ctx.closePath();
  ctx.fillStyle = coat.nose;
  ctx.fill();
  ctx.strokeStyle = coat.line;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(nx - 0.4, ny - 2.2, 0.8, 0.35, -0.1, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = coat.line;
  ctx.lineWidth = 0.9;
  if (mouth === 'smile') {
    // A little "ω".
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(nx, ny + 1.3);
    ctx.quadraticCurveTo(nx - 1.1, ny + 2.7, nx - 2.6, ny + 1.6);
    ctx.moveTo(nx, ny + 1.3);
    ctx.quadraticCurveTo(nx + 1, ny + 2.6, nx + 2.3, ny + 1.6);
    ctx.stroke();
    return;
  }
  if (mouth === 'tongue') {
    ctx.fillStyle = coat.earInner;
    ctx.beginPath();
    ctx.roundRect(nx - 1.2, ny + 1.3, 2.8, 4.6, 1.4);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(nx, ny + 1.3);
    ctx.moveTo(nx - 2.8, ny + 1.4);
    ctx.quadraticCurveTo(nx, ny + 1.8, nx + 2.4, ny + 1.3);
    ctx.stroke();
    return;
  }
  // Open: a startled little "o" under the nose.
  ctx.beginPath();
  ctx.moveTo(nx, ny);
  ctx.lineTo(nx, ny + 1);
  ctx.stroke();
  ctx.fillStyle = '#3a1620';
  ctx.beginPath();
  ctx.ellipse(nx, ny + 2.9, 1.7, 2, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = coat.earInner;
  ctx.beginPath();
  ctx.ellipse(nx, ny + 4, 1.1, 0.8, 0, 0, TAU);
  ctx.fill();
}

function drawWhiskers(ctx: CanvasRenderingContext2D, coat: CatCoat): void {
  ctx.strokeStyle = coat.whisker;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  // Far side: fanning out ahead of the muzzle.
  ctx.moveTo(25.6, -0.6);
  ctx.quadraticCurveTo(30.4, -2.8, 35, -3.2);
  ctx.moveTo(26, 0.6);
  ctx.quadraticCurveTo(30.8, 0.2, 35.6, 1.2);
  ctx.moveTo(25.6, 1.8);
  ctx.quadraticCurveTo(30.2, 3, 34.2, 5.2);
  // Near side: short, sweeping back from the whisker pad.
  ctx.moveTo(17.8, 0);
  ctx.quadraticCurveTo(15, -0.6, 12.2, -0.2);
  ctx.moveTo(17.8, 1.2);
  ctx.quadraticCurveTo(15.2, 1.6, 12.6, 2.8);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHead(ctx: CanvasRenderingContext2D, coat: CatCoat, pose: CatPose): void {
  drawEar(ctx, coat, ...EAR_FAR, 0.12);
  drawEar(ctx, coat, ...EAR_NEAR, 0.12);

  const shade = ctx.createRadialGradient(15, -10, 1, 13, -6, 16);
  shade.addColorStop(0, coat.furLight);
  shade.addColorStop(0.6, coat.fur);
  shade.addColorStop(1, coat.furShade);
  headPath(ctx);
  ctx.fillStyle = shade;
  ctx.fill();
  headDetails(ctx, coat);
  headPath(ctx);
  ctx.strokeStyle = coat.line;
  ctx.lineWidth = LINE;
  ctx.stroke();

  drawEye(ctx, coat, EYE_NEAR, pose.eyes);
  drawEye(ctx, coat, EYE_FAR, pose.eyes);
  drawNoseAndMouth(ctx, coat, pose.mouth);
  drawWhiskers(ctx, coat);
}

// ---------------------------------------------------------------- ghost

/** Adds an ellipse as its own clockwise subpath (no joining line), so every piece winds the same way. */
function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, rot: number): void {
  ctx.moveTo(cx + rx * Math.cos(rot), cy + rx * Math.sin(rot));
  ctx.ellipse(cx, cy, rx, ry, rot, 0, TAU);
}

/** A leg as one blob per segment (overlapping at the joints), ending in the paw. */
function legBlobs(ctx: CanvasRenderingContext2D, leg: Leg, legs: number): void {
  const p = poseLeg(leg, legs);
  for (let i = 0; i < leg.widths.length; i++) {
    const r = leg.widths[i] / 2;
    const dx = p[i + 1][0] - p[i][0];
    const dy = p[i + 1][1] - p[i][1];
    blob(ctx, p[i][0] + dx / 2, p[i][1] + dy / 2, Math.hypot(dx, dy) / 2 + r * 0.7, r, Math.atan2(dy, dx));
  }
  const [ax, ay] = p[2];
  const [bx, by] = p[3];
  blob(ctx, bx, by, 2.7, 1.9, Math.atan2(by - ay, bx - ax));
}

/** Clockwise ear triangle. */
function earBlob(ctx: CanvasRenderingContext2D, b1x: number, b1y: number, tx: number, ty: number, b2x: number, b2y: number): void {
  ctx.moveTo(b1x, b1y);
  ctx.lineTo(tx, ty);
  ctx.lineTo(b2x, b2y);
  ctx.closePath();
}

/**
 * A friend's ghost: the same cat in the same pose, as a single translucent
 * silhouette with a pair of eyes. Every piece is a same-direction subpath of
 * ONE path, filled once, so overlaps don't show through and it costs one fill.
 */
export function drawGhostCat(ctx: CanvasRenderingContext2D, x: number, y: number, pose: CatPose, fur: string, alpha: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(pose.tilt);
  ctx.scale(pose.scaleX, pose.scaleY);

  ctx.beginPath();
  for (const leg of [FAR_FORE, FAR_HIND, NEAR_FORE, NEAR_HIND]) legBlobs(ctx, leg, pose.legs);
  // Tail: overlapping blobs, each spanning a quarter of its length.
  const tc = Math.cos(pose.tail);
  const ts = Math.sin(pose.tail);
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = tailPoint(i / 4);
    const [bx, by] = tailPoint((i + 1) / 4);
    const r = tailWidth((i + 0.5) / 4);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const rot = Math.atan2(by - ay, bx - ax) + pose.tail;
    blob(ctx, TAIL_BASE_X + mx * tc - my * ts, TAIL_BASE_Y + mx * ts + my * tc, Math.hypot(bx - ax, by - ay) / 2 + r, r, rot);
  }
  blob(ctx, -9, 1.2, 17.2, 10.8, 0.02); // torso
  blob(ctx, -18.8, 3.4, 7.8, 8.4, 0); // haunch
  blob(ctx, 3, 2, 6.4, 9.4, -0.2); // chest
  earBlob(ctx, ...EAR_FAR);
  earBlob(ctx, ...EAR_NEAR);
  blob(ctx, 12.6, -6, 13.4, 12, 0); // head
  blob(ctx, 5.2, 1.6, 6, 5, 0); // cheek ruff
  blob(ctx, 24.4, 0.6, 3.4, 3.2, 0); // muzzle
  layoutCape(pose);
  capePath(ctx, true);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fur;
  ctx.fill('nonzero');

  // Eyes, so it still looks where it's going.
  ctx.globalAlpha = Math.min(1, alpha + 0.3);
  if (pose.eyes === 'dead' || pose.eyes === 'blink') {
    ctx.strokeStyle = '#fff6e6';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const e of [EYE_NEAR, EYE_FAR]) {
      ctx.moveTo(e.x - e.w / 2, e.y);
      ctx.lineTo(e.x + e.w / 2, e.y);
    }
    ctx.stroke();
  } else {
    ctx.fillStyle = '#fff6e6';
    ctx.beginPath();
    for (const e of [EYE_NEAR, EYE_FAR]) blob(ctx, e.x, e.y, e.w / 2, e.h / 2, e.rot);
    ctx.fill();
    ctx.fillStyle = '#1c1420';
    ctx.beginPath();
    for (const e of [EYE_NEAR, EYE_FAR]) blob(ctx, e.x + e.w * 0.07, e.y + 0.2, e.w * 0.3, e.h * 0.34, 0);
    ctx.fill();
  }
  ctx.restore();
}
