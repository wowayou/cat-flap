/**
 * The flying cat: a round ginger cat-ball in a red cape, drawn as flat vector
 * shapes with the scenery's ink outline. Every part is simple geometry
 * (circles, rounded triangles, a ribbon cape), so it turns, squashes and
 * stretches without losing its shape. The ball is centred on the hitbox and
 * a little larger than it: what you see is what collides.
 */

export type EyeState = 'open' | 'blink' | 'wide' | 'squint' | 'dead';
export type MouthState = 'smile' | 'open' | 'tongue';

/** Presentation only; the pivot is the unchanged collision-circle centre. */
export interface CatPose {
  tilt: number;
  scaleX: number;
  scaleY: number;
  /** Cape lift above the line behind the cat (radians), and its wave phase/strength. */
  cape: number;
  ripple: number;
  billow: number;
  /** 0: the cape streams behind; 1: spread wide into a glide. */
  spread: number;
  /** -1: paws reaching ahead, 0: relaxed, 1: paws down. */
  legs: number;
  eyes: EyeState;
  mouth: MouthState;
  /** Tail swing (radians). */
  tail: number;
  /** 0: ears up, 1: folded flat. */
  ears: number;
}

export const DEFAULT_POSE: CatPose = {
  tilt: 0, scaleX: 1, scaleY: 1, cape: 0.15, ripple: 0, billow: 0.4, spread: 0,
  legs: -0.2, eyes: 'open', mouth: 'smile', tail: 0, ears: 0,
};

export interface CatColors {
  ink: string;
  fur: string;
  shade: string;
  cream: string;
  creamShade: string;
  pink: string;
  cape: string;
  capeDark: string;
  capeLight: string;
  gold: string;
  goldLight: string;
}

export const GINGER_COLORS: CatColors = {
  ink: '#2a1b3d',
  fur: '#f29a38',
  shade: '#d36f22',
  cream: '#fff4e0',
  creamShade: '#ecd2b4',
  pink: '#f58c95',
  cape: '#e0393f',
  capeDark: '#a61f3b',
  capeLight: '#ff7a63',
  gold: '#ffd256',
  goldLight: '#ffe9a0',
};

/** Ball radius; the hitbox (13) sits inside it with a little forgiveness all round. */
const R = 17;
const LINE = 2.5;
const TAU = Math.PI * 2;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Draw the whole cat at the origin, facing right, in world units. */
export function paintCat(ctx: CanvasRenderingContext2D, pose: CatPose, c: CatColors): void {
  ctx.save();
  ctx.rotate(pose.tilt);
  ctx.scale(pose.scaleX, pose.scaleY);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  cape(ctx, pose, c);
  tail(ctx, pose, c);
  paws(ctx, pose, c, false);
  body(ctx, pose, c);
  face(ctx, pose, c);
  paws(ctx, pose, c, true);
  ctx.restore();
}

/**
 * A friend's ghost: the same shapes as one flat, translucent silhouette in
 * their coat, with dark eyes and mouth. Drawn straight onto the scene (fast
 * everywhere), so every shape gets the alpha: the parts behind the ball stay
 * outside it and nothing else is layered, so no spot turns opaque.
 */
export function paintGhost(ctx: CanvasRenderingContext2D, pose: CatPose, c: CatColors): void {
  ctx.save();
  ctx.rotate(pose.tilt);
  ctx.scale(pose.scaleX, pose.scaleY);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.save();
  ctx.beginPath();
  ctx.rect(-2 * R - CAPE_REACH, -2 * R - CAPE_REACH, 4 * R + 2 * CAPE_REACH, 4 * R + 2 * CAPE_REACH);
  ctx.arc(0, 0, R + LINE / 2, 0, TAU);
  ctx.clip('evenodd');
  capeShape(ctx, pose);
  ctx.fillStyle = c.capeDark;
  ctx.fill();
  tailPath(ctx, pose);
  ctx.strokeStyle = c.fur;
  ctx.lineWidth = 4.4 + LINE;
  ctx.stroke();
  ctx.restore();
  silhouette(ctx, clamp(pose.ears, 0, 1), R + LINE / 2);
  ctx.fillStyle = c.fur;
  ctx.fill();
  pawStrokes(ctx, pose, true);
  ctx.strokeStyle = c.cream;
  ctx.lineWidth = 4.6;
  ctx.stroke();
  for (const [p, w, side] of GHOST_EYES) {
    if (pose.eyes === 'open' || pose.eyes === 'wide') {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 2.9 * w, 3.8, 0, 0, TAU);
      ctx.fillStyle = c.ink;
      ctx.fill();
    } else eye(ctx, pose.eyes, p, w, side, c);
  }
  ctx.save();
  ctx.translate(MUZZLE.x, MUZZLE.y);
  mouth(ctx, pose.mouth === 'open' ? 'open' : 'smile', c, true);
  ctx.restore();
  ctx.restore();
}

// Cape samples along its length, reused every frame: x, y pairs.
const CAPE_STEPS = 8;
const TOP = new Float64Array((CAPE_STEPS + 1) * 2);
const BOTTOM = new Float64Array((CAPE_STEPS + 1) * 2);
const MID = new Float64Array((CAPE_STEPS + 1) * 2);
const SHEEN = new Float64Array((CAPE_STEPS + 1) * 2);

/** A smooth curve through points `from`..`to` (either direction), quadratic between midpoints. */
function curve(ctx: CanvasRenderingContext2D, p: Float64Array, from: number, to: number, start: boolean): void {
  const step = to >= from ? 1 : -1;
  if (start) ctx.moveTo(p[from * 2], p[from * 2 + 1]);
  else ctx.lineTo(p[from * 2], p[from * 2 + 1]);
  for (let i = from + step; i !== to; i += step) {
    const j = i + step;
    ctx.quadraticCurveTo(p[i * 2], p[i * 2 + 1], (p[i * 2] + p[j * 2]) / 2, (p[i * 2 + 1] + p[j * 2 + 1]) / 2);
  }
  ctx.lineTo(p[to * 2], p[to * 2 + 1]);
}

/** How far past the ball any cape can reach (for the ghost's clip). */
const CAPE_REACH = 40;
let notchX = 0, notchY = 0;

/** Lay out the cape for a pose: a ribbon from the back of the head with a swallowtail hem, rippling as it streams. */
function layCape(pose: CatPose): void {
  const s = clamp(pose.spread, 0, 1);
  const length = lerp(35, 29, s);
  const rootW = lerp(11, 16, s);
  const hemW = lerp(21, 34, s);
  const amp = lerp(2.6, 1.6, s) * clamp(pose.billow, 0, 1.2);
  const dir = Math.PI + lerp(pose.cape, 0.42, s);
  const sag = lerp(-0.12, 0.25, s);
  const notch = lerp(5.5, 8, s);
  let x = -6, y = -7;
  for (let i = 0; i <= CAPE_STEPS; i++) {
    const t = i / CAPE_STEPS;
    const a = dir + sag * t;
    if (i > 0) {
      x += Math.cos(a) * (length / CAPE_STEPS);
      y += Math.sin(a) * (length / CAPE_STEPS);
    }
    const wave = amp * t * Math.sin(t * 2.4 * Math.PI - pose.ripple);
    const w = lerp(rootW, hemW, t * t * (3 - 2 * t)) / 2;
    // Normal to the left of the direction of travel: "up" for a cape streaming back.
    const nx = Math.sin(a), ny = -Math.cos(a);
    const k = i * 2;
    TOP[k] = x + nx * (w + wave); TOP[k + 1] = y + ny * (w + wave);
    BOTTOM[k] = x + nx * (wave - w); BOTTOM[k + 1] = y + ny * (wave - w);
    MID[k] = lerp(BOTTOM[k], TOP[k], 0.32); MID[k + 1] = lerp(BOTTOM[k + 1], TOP[k + 1], 0.32);
    SHEEN[k] = lerp(TOP[k], BOTTOM[k], 0.16); SHEEN[k + 1] = lerp(TOP[k + 1], BOTTOM[k + 1], 0.16);
  }
  const n = CAPE_STEPS, end = dir + sag;
  notchX = (TOP[n * 2] + BOTTOM[n * 2]) / 2 - Math.cos(end) * notch;
  notchY = (TOP[n * 2 + 1] + BOTTOM[n * 2 + 1]) / 2 - Math.sin(end) * notch;
}

/** The cape's outline as the current path (after layCape). */
function capeOutline(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  curve(ctx, TOP, 0, CAPE_STEPS, true);
  ctx.lineTo(notchX, notchY);
  curve(ctx, BOTTOM, CAPE_STEPS, 0, false);
  ctx.closePath();
}

/** Lay out the cape for a pose and make its outline the current path. */
function capeShape(ctx: CanvasRenderingContext2D, pose: CatPose): void {
  layCape(pose);
  capeOutline(ctx);
}

function cape(ctx: CanvasRenderingContext2D, pose: CatPose, c: CatColors): void {
  const n = CAPE_STEPS;
  // The dark underside shows along the lower edge...
  capeShape(ctx, pose);
  ctx.fillStyle = c.capeDark;
  ctx.fill();
  // ...under the bright outer face, which ends on the far side of the notch.
  ctx.beginPath();
  curve(ctx, TOP, 0, n, true);
  ctx.lineTo(notchX, notchY);
  ctx.lineTo(lerp(notchX, BOTTOM[n * 2], 0.36), lerp(notchY, BOTTOM[n * 2 + 1], 0.36));
  curve(ctx, MID, n - 1, 0, false);
  ctx.closePath();
  ctx.fillStyle = c.cape;
  ctx.fill();
  ctx.beginPath();
  curve(ctx, SHEEN, 0, n - 1, true);
  ctx.strokeStyle = c.capeLight;
  ctx.lineWidth = 2;
  ctx.stroke();
  capeOutline(ctx);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = LINE;
  ctx.stroke();
}

const TAIL_RINGS = [[-9.6, 1.4, -10.6, 5.4], [-15.2, -0.6, -18.8, 1.2]] as const;

/** The tail as the current path: a tapering S-curve that curls up behind, swinging by the pose. */
function tailPath(ctx: CanvasRenderingContext2D, pose: CatPose): void {
  const a = pose.tail, cos = Math.cos(a), sin = Math.sin(a);
  const at = (x: number, y: number): [number, number] => [-13.5 + x * cos - y * sin, 8 + x * sin + y * cos];
  ctx.beginPath();
  ctx.moveTo(...at(0, 0));
  ctx.bezierCurveTo(...at(-8, 4.5), ...at(-15, 4), ...at(-17.5, -1.5));
  ctx.quadraticCurveTo(...at(-19.5, -6.5), ...at(-16, -9.5));
}

function tail(ctx: CanvasRenderingContext2D, pose: CatPose, c: CatColors): void {
  tailPath(ctx, pose);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 4.4 + 2 * LINE;
  ctx.stroke();
  ctx.strokeStyle = c.fur;
  ctx.lineWidth = 4.4;
  ctx.stroke();
  ctx.save();
  ctx.translate(-13.5, 8);
  ctx.rotate(pose.tail);
  ctx.strokeStyle = c.shade;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of TAIL_RINGS) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
  ctx.restore();
}

/** Where each paw sits on the rim (degrees), its direction offset and length. */
const NEAR_PAWS = [[62, 0, 3.4, true], [118, 0, 3.2, false]] as const;
const FAR_PAWS = [[44, -0.12, 3, true], [136, 0.1, 2.8, false]] as const;

/** The near or far pair of paws as the current path (strokes from the rim). */
function pawStrokes(ctx: CanvasRenderingContext2D, pose: CatPose, near: boolean): void {
  const l = clamp(pose.legs, -1, 1);
  const reach = Math.max(0, -l), down = Math.max(0, l);
  const front = 0.55 - 0.75 * reach + 0.85 * down;
  const back = Math.PI - 0.35 + 0.25 * reach - 0.95 * down;
  ctx.beginPath();
  for (const [deg, offset, len, isFront] of near ? NEAR_PAWS : FAR_PAWS) {
    const a = (deg * Math.PI) / 180;
    const angle = (isFront ? front : back) + offset;
    const bx = Math.cos(a) * (R - 1.5), by = Math.sin(a) * (R - 1.5);
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(angle) * len, by + Math.sin(angle) * len);
  }
}

/** Small round paws: the front pair reaches ahead in flight, the back pair trails. */
function paws(ctx: CanvasRenderingContext2D, pose: CatPose, c: CatColors, near: boolean): void {
  pawStrokes(ctx, pose, near);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 4.6 + 2 * LINE;
  ctx.stroke();
  ctx.strokeStyle = near ? c.cream : c.creamShade;
  ctx.lineWidth = 4.6;
  ctx.stroke();
}

const EARS = [
  { deg: -118, fold: -0.9, scale: 1 },
  { deg: -62, fold: 0.9, scale: 0.92 },
] as const;

/** Place an ear's own frame: on the rim at its angle, pointing outwards, folding by `ears`. */
function earFrame(ctx: CanvasRenderingContext2D, e: (typeof EARS)[number], ears: number): void {
  const a = (e.deg * Math.PI) / 180;
  ctx.translate(Math.cos(a) * (R - 4), Math.sin(a) * (R - 4));
  ctx.rotate(a + e.fold * ears + Math.PI / 2);
  ctx.scale(e.scale, e.scale);
}

/** An ear's outline in its own frame (three quadratic curves): base corners inside the ball, tip outside. */
const EAR = [-6.5, 2, -4.5, -6, -1.2, -11.5, 0, -13, 1.2, -11.5, 4.5, -6, 6.5, 2] as const;
/** How far the ear's sides run on into the head, so its ends stay inside the ball however far it folds. */
const EAR_ROOT = 7;
const EAR_STEPS = 8;
const earPoints = new Float64Array((3 * EAR_STEPS + 3) * 2);

/** Sample one ear's outline into ball coordinates, from its back corner over the tip to its front corner. */
function sampleEar(e: (typeof EARS)[number], ears: number): number {
  const a = (e.deg * Math.PI) / 180;
  const bx = Math.cos(a) * (R - 4), by = Math.sin(a) * (R - 4);
  const r = a + e.fold * ears + Math.PI / 2;
  const cos = Math.cos(r) * e.scale, sin = Math.sin(r) * e.scale;
  let n = 0;
  const put = (x: number, y: number) => {
    earPoints[n * 2] = bx + x * cos - y * sin;
    earPoints[n * 2 + 1] = by + x * sin + y * cos;
    n++;
  };
  put(EAR[0], EAR[1] + EAR_ROOT);
  put(EAR[0], EAR[1]);
  for (let seg = 0; seg < 3; seg++) {
    const i = seg * 4;
    for (let k = 1; k <= EAR_STEPS; k++) {
      const t = k / EAR_STEPS, u = 1 - t;
      put(u * u * EAR[i] + 2 * u * t * EAR[i + 2] + t * t * EAR[i + 4], u * u * EAR[i + 1] + 2 * u * t * EAR[i + 3] + t * t * EAR[i + 5]);
    }
  }
  put(EAR[12], EAR[13] + EAR_ROOT);
  return n;
}

/** Where segment i→j of the sampled ear crosses the rim (one end inside the ball, the other outside). */
function rimCrossing(i: number, j: number, rim: number): [number, number] {
  const x = earPoints[i * 2], y = earPoints[i * 2 + 1];
  const dx = earPoints[j * 2] - x, dy = earPoints[j * 2 + 1] - y;
  const qa = dx * dx + dy * dy, qb = x * dx + y * dy, qc = x * x + y * y - rim * rim;
  const root = Math.sqrt(Math.max(0, qb * qb - qa * qc));
  const t = (qc < 0 ? -qb + root : -qb - root) / qa;
  return [x + dx * t, y + dy * t];
}

/**
 * The outer outline of ball and ears as one contour: round the rim, out over
 * each ear and back. Stroking it never draws the ears' bases inside the head
 * (which a translucent ghost would show).
 */
function silhouette(ctx: CanvasRenderingContext2D, ears: number, rim = R): void {
  ctx.beginPath();
  ctx.moveTo(rim, 0);
  let angle = 0;
  for (const e of EARS) {
    const n = sampleEar(e, ears);
    let first = -1, last = -1;
    for (let i = 0; i < n; i++) {
      if (Math.hypot(earPoints[i * 2], earPoints[i * 2 + 1]) <= rim) continue;
      if (first < 0) first = i;
      last = i;
    }
    if (first <= 0 || last >= n - 1) continue;
    const [inX, inY] = rimCrossing(first - 1, first, rim);
    const [outX, outY] = rimCrossing(last + 1, last, rim);
    let from = Math.atan2(inY, inX);
    while (from < angle) from += TAU;
    ctx.arc(0, 0, rim, angle, from);
    // A folded ear can dip back inside on the way: keep the contour on the rim there.
    for (let i = first; i <= last; i++) {
      const x = earPoints[i * 2], y = earPoints[i * 2 + 1], d = Math.hypot(x, y);
      if (d >= rim) ctx.lineTo(x, y);
      else ctx.lineTo((x / d) * rim, (y / d) * rim);
    }
    ctx.lineTo(outX, outY);
    angle = Math.atan2(outY, outX);
    while (angle < from) angle += TAU;
  }
  ctx.arc(0, 0, rim, angle, TAU);
  ctx.closePath();
}

// The lit part of the ball is a slightly smaller circle nudged up and forward:
// the shade is the crescent between the two, built from their two arcs.
const LIT = { x: 2.2, y: -2.4, r: R - 0.4 };
const CRESCENT = (() => {
  const d = Math.hypot(LIT.x, LIT.y);
  const a = (R * R - LIT.r * LIT.r + d * d) / (2 * d);
  const h = Math.sqrt(R * R - a * a);
  const ux = LIT.x / d, uy = LIT.y / d;
  const p1 = [ux * a - uy * h, uy * a + ux * h], p2 = [ux * a + uy * h, uy * a - ux * h];
  const outer0 = Math.atan2(p1[1], p1[0]);
  let outer1 = Math.atan2(p2[1], p2[0]);
  if (outer1 < outer0) outer1 += TAU;
  let inner0 = Math.atan2(p2[1] - LIT.y, p2[0] - LIT.x);
  const inner1 = Math.atan2(p1[1] - LIT.y, p1[0] - LIT.x);
  if (inner0 < inner1) inner0 += TAU;
  return { outer0, outer1, inner0, inner1 };
})();
/** The cream belly: the rim between these angles, closed by a curve across the front. */
const BELLY = { from: 0.28, to: 2.1, cx: 3, cy: 3.5 };

const STRIPES = [[1.4, -16.6, 2, -13.4], [5.4, -16.8, 5.4, -12.6], [9.4, -16, 8.8, -12.8]] as const;

function body(ctx: CanvasRenderingContext2D, pose: CatPose, c: CatColors): void {
  const ears = clamp(pose.ears, 0, 1);
  // One outline round ears and ball, then the fill on top.
  silhouette(ctx, ears);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 2 * LINE;
  ctx.stroke();
  ctx.fillStyle = c.fur;
  ctx.fill();
  ctx.beginPath();
  for (const e of EARS) {
    ctx.save();
    earFrame(ctx, e, ears);
    ctx.moveTo(-3.4, -1);
    ctx.quadraticCurveTo(-2, -6, -0.6, -8.6);
    ctx.quadraticCurveTo(0, -9.4, 0.6, -8.6);
    ctx.quadraticCurveTo(2, -6, 3.4, -1);
    ctx.closePath();
    ctx.restore();
  }
  ctx.fillStyle = c.pink;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, R, CRESCENT.outer0, CRESCENT.outer1);
  ctx.arc(LIT.x, LIT.y, LIT.r, CRESCENT.inner0, CRESCENT.inner1, true);
  ctx.closePath();
  ctx.fillStyle = c.shade;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, R, BELLY.from, BELLY.to);
  ctx.quadraticCurveTo(BELLY.cx, BELLY.cy, Math.cos(BELLY.from) * R, Math.sin(BELLY.from) * R);
  ctx.fillStyle = c.cream;
  ctx.fill();
  // Tabby stripes on the crown.
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of STRIPES) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.strokeStyle = c.shade;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

const NEAR_EYE = { x: 1.8, y: -2.4 };
const FAR_EYE = { x: 10.8, y: -2.8 };
/** Ghost eyes: position, width (the far eye is narrower) and squint direction. */
const GHOST_EYES = [[NEAR_EYE, 1, 1], [FAR_EYE, 0.84, -1]] as const;
/** Muzzle, nose and mouth sit centred between the eyes. */
const MUZZLE = { x: -1.5, y: 0.3 };

/** Face on the front of the ball: forward-looking eyes, muzzle, blush. */
function face(ctx: CanvasRenderingContext2D, pose: CatPose, c: CatColors): void {
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * 0.55;
  ctx.beginPath();
  ctx.ellipse(0.2, 3.4, 2.6, 1.5, 0, 0, TAU);
  ctx.moveTo(15.4, 2.9);
  ctx.ellipse(13.4, 2.9, 2, 1.4, 0, 0, TAU);
  ctx.fillStyle = c.pink;
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.save();
  ctx.translate(MUZZLE.x, MUZZLE.y);
  ctx.beginPath();
  ctx.arc(6.4, 3.9, 2.9, 0, TAU);
  ctx.moveTo(13.3, 3.7);
  ctx.arc(10.4, 3.7, 2.9, 0, TAU);
  ctx.fillStyle = c.cream;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(7.2, 1.4);
  ctx.quadraticCurveTo(8.4, 1, 9.6, 1.3);
  ctx.quadraticCurveTo(9.2, 2.9, 8.4, 3.1);
  ctx.quadraticCurveTo(7.6, 2.9, 7.2, 1.4);
  ctx.fillStyle = c.pink;
  ctx.fill();
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 0.9;
  ctx.stroke();
  mouth(ctx, pose.mouth, c);
  ctx.restore();
  eye(ctx, pose.eyes, NEAR_EYE, 1, 1, c);
  eye(ctx, pose.eyes, FAR_EYE, 0.84, -1, c);
}

/** One eye; `w` narrows the far eye, `side` mirrors the squint. */
function eye(ctx: CanvasRenderingContext2D, state: EyeState, p: { x: number; y: number }, w: number, side: number, c: CatColors): void {
  ctx.strokeStyle = c.ink;
  ctx.fillStyle = c.ink;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  switch (state) {
    case 'open':
      ctx.ellipse(p.x, p.y, 2.9 * w, 3.8, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x - 0.8 * w, p.y - 1.4, 1.25, 0, TAU);
      ctx.moveTo(p.x + w + 0.6, p.y + 1.5);
      ctx.arc(p.x + w, p.y + 1.5, 0.6, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      return;
    case 'blink':
      ctx.moveTo(p.x - 2.6 * w, p.y);
      ctx.quadraticCurveTo(p.x, p.y + 2.2, p.x + 2.6 * w, p.y);
      ctx.stroke();
      return;
    case 'wide':
      ctx.ellipse(p.x, p.y - 0.4, 3.1 * w, 3.7, 0, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x + 0.6 * w, p.y + 0.1, 1.5, 0, TAU);
      ctx.fillStyle = c.ink;
      ctx.fill();
      return;
    case 'squint':
      ctx.moveTo(p.x - 2 * side * w, p.y - 2.2);
      ctx.lineTo(p.x + 1.8 * side * w, p.y);
      ctx.lineTo(p.x - 2 * side * w, p.y + 2.2);
      ctx.stroke();
      return;
    case 'dead':
      ctx.moveTo(p.x - 2 * w, p.y - 2);
      ctx.lineTo(p.x + 2 * w, p.y + 2);
      ctx.moveTo(p.x + 2 * w, p.y - 2);
      ctx.lineTo(p.x - 2 * w, p.y + 2);
      ctx.stroke();
      return;
  }
}

function mouth(ctx: CanvasRenderingContext2D, state: MouthState, c: CatColors, ghost = false): void {
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.1;
  if (state === 'open') {
    ctx.beginPath();
    ctx.moveTo(6.6, 4.6);
    ctx.quadraticCurveTo(8.4, 4, 10.2, 4.6);
    ctx.quadraticCurveTo(10, 8.4, 8.4, 8.6);
    ctx.quadraticCurveTo(6.8, 8.4, 6.6, 4.6);
    ctx.fillStyle = c.ink;
    ctx.fill();
    if (ghost) return;
    ctx.beginPath();
    ctx.ellipse(8.4, 7.4, 1.4, 0.9, 0, 0, TAU);
    ctx.fillStyle = c.pink;
    ctx.fill();
    return;
  }
  if (state === 'tongue') {
    ctx.beginPath();
    ctx.ellipse(9.2, 6.6, 1.5, 2, 0.2, 0, TAU);
    ctx.fillStyle = c.pink;
    ctx.fill();
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.lineWidth = 1.1;
  }
  // ω
  ctx.beginPath();
  ctx.moveTo(8.4, 3.1);
  ctx.lineTo(8.4, 4.2);
  ctx.moveTo(6.4, 4.4);
  ctx.quadraticCurveTo(7.4, 5.8, 8.4, 4.2);
  ctx.quadraticCurveTo(9.4, 5.8, 10.4, 4.4);
  ctx.stroke();
}

/** A golden fish snack facing left, about 20×10 world units at scale 1, centred on the origin. */
export function paintFish(ctx: CanvasRenderingContext2D, scale = 1, c: CatColors = GINGER_COLORS): void {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.bezierCurveTo(-8, -5, 0, -5.5, 4.5, -1.2);
    ctx.lineTo(9.5, -4.6);
    ctx.quadraticCurveTo(8.4, 0, 9.5, 4.6);
    ctx.lineTo(4.5, 1.2);
    ctx.bezierCurveTo(0, 5.5, -8, 5, -10, 0);
    ctx.closePath();
  };
  shape();
  ctx.fillStyle = c.gold;
  ctx.fill();
  // A pale belly and a gill line.
  ctx.beginPath();
  ctx.moveTo(-9.2, 1.4);
  ctx.bezierCurveTo(-6, 4.4, 0, 4.5, 3.6, 1.6);
  ctx.bezierCurveTo(0, 2.8, -6, 2.8, -9.2, 1.4);
  ctx.fillStyle = c.goldLight;
  ctx.fill();
  shape();
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-3.8, -2.8);
  ctx.quadraticCurveTo(-2.4, 0, -3.8, 2.8);
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-6.4, -0.6, 1.1, 0, TAU);
  ctx.fillStyle = c.ink;
  ctx.fill();
  ctx.restore();
}

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const luma = ([r, g, b]: [number, number, number]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const toHex = (v: number[]) => `#${v.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;

/**
 * A friend's ghost is the same cat in another coat: every colour keeps its
 * lightness, re-tinted so fur becomes the coat, ink a darker coat and cream a
 * paler one. Face, cape and paws stay readable.
 */
export function ghostColors(coat: string): CatColors {
  const base = rgb(coat);
  const fur = luma(rgb(GINGER_COLORS.fur));
  const map = (hex: string) => {
    const l = luma(rgb(hex));
    if (l <= fur) return toHex(base.map((v) => v * (0.3 + 0.7 * (l / fur))));
    const t = Math.min(1, ((l - fur) / (1 - fur)) * 0.85);
    return toHex(base.map((v) => v + (255 - v) * t));
  };
  return Object.fromEntries(Object.entries(GINGER_COLORS).map(([k, v]) => [k, map(v)])) as unknown as CatColors;
}
const ghostPalettes = new Map<string, CatColors>();

let ready = false;
let fishIcon = '';

/** Await before enabling input or drawing, so the player is never invisible. */
export function loadCatArt(): Promise<void> {
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return Promise.reject(new Error('Cannot prepare character artwork'));
  ready = true;
  return Promise.resolve();
}

export function drawCat(ctx: CanvasRenderingContext2D, x: number, y: number, pose: CatPose): void {
  if (!ready) throw new Error('Character artwork must be loaded before drawing');
  ctx.save();
  ctx.translate(x, y);
  paintCat(ctx, pose, GINGER_COLORS);
  ctx.restore();
}

/** A friend's translucent ghost in its own coat colour. */
export function drawGhostCat(ctx: CanvasRenderingContext2D, x: number, y: number, pose: CatPose, coat: string, alpha: number): void {
  if (!ready) throw new Error('Character artwork must be loaded before drawing');
  let colors = ghostPalettes.get(coat);
  if (!colors) ghostPalettes.set(coat, colors = ghostColors(coat));
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= alpha;
  paintGhost(ctx, pose, colors);
  ctx.restore();
}

/** A fish snack centred on (x, y). */
export function drawFish(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
  ctx.save();
  ctx.translate(x, y);
  paintFish(ctx, scale);
  ctx.restore();
}

/** The fish as an image URL, for the HUD's fish counter (drawn large enough for any screen). */
export function fishIconUrl(): string {
  if (!fishIcon) {
    const canvas = document.createElement('canvas');
    canvas.width = 156;
    canvas.height = 72;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.translate(78, 36);
    paintFish(ctx, 6.6);
    fishIcon = canvas.toDataURL();
  }
  return fishIcon;
}
