// Dev-only visual review, always using the production renderer and artwork.
import { drawCat, drawFish, drawGhostCat, loadCatArt, paintCat, DEFAULT_POSE, GINGER_COLORS, type CatPose } from '../src/render/cat.ts';
import { drawObstacle } from '../src/render/posts.ts';
import { GHOST_COLORS, skyAt } from '../src/render/palette.ts';
import { drawCity, drawClouds, drawSky, drawStars, drawSunMoon, drawWall } from '../src/render/scenery.ts';
import { computeView } from '../src/render/view.ts';

const canvas = document.getElementById('c') as HTMLCanvasElement;
export const W = 1200, H = 1050;
const dpr = 2;
canvas.width = W * dpr;
canvas.height = H * dpr;
canvas.style.width = `${W}px`;
canvas.style.maxWidth = '100%';
canvas.style.height = 'auto';
const ctx = canvas.getContext('2d')!;
await loadCatArt();
ctx.scale(dpr, dpr);
ctx.fillStyle = '#f8efdd';
ctx.fillRect(0, 0, W, H);
const params = new URLSearchParams(location.search);

/** A pose's drawn bounds in world units around its pivot, so every cell centres the art itself. */
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
probe.canvas.width = probe.canvas.height = 160;
function bounds(pose: CatPose): { cx: number; cy: number; w: number; h: number } {
  probe.setTransform(1, 0, 0, 1, 0, 0);
  probe.clearRect(0, 0, 160, 160);
  probe.translate(80, 80);
  paintCat(probe, pose, GINGER_COLORS);
  const pixels = probe.getImageData(0, 0, 160, 160).data;
  let x0 = 160, x1 = 0, y0 = 160, y1 = 0;
  for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
    if (pixels[(y * 160 + x) * 4 + 3] < 8) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
  }
  return { cx: (x0 + x1) / 2 - 80, cy: (y0 + y1) / 2 - 80, w: x1 - x0, h: y1 - y0 };
}

/** Draw a pose scaled to fit (at most `k`), centred on (x, y). */
function fit(pose: CatPose, x: number, y: number, w: number, h: number, k: number, ghost?: string): void {
  const b = bounds(pose);
  const s = Math.min(k, w / b.w, h / b.h);
  ctx.save();
  ctx.translate(x - b.cx * s, y - b.cy * s);
  ctx.scale(s, s);
  if (ghost) drawGhostCat(ctx, 0, 0, pose, ghost, 0.5);
  else drawCat(ctx, 0, 0, pose);
  if (params.has('debug') && !ghost) {
    ctx.strokeStyle = '#ff3b6b'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function label(text: string, x: number, y: number, size = 13, color = '#6b5671'): void {
  ctx.font = `${size >= 20 ? 700 : 500} ${size}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

label('CAT FLAP / CHARACTER', 32, 38, 12);
label('小小身躯，也敢迎风。', 32, 84, 30, '#2a1b3d');
label('圆球小飞猫 · 豆豆眼 · 燕尾红披风 · 画出来的圆就是碰撞判定', 32, 113, 15);
label('实际游戏尺寸', 32, 154, 14);
label('姿态与表情 / 约 2×', 424, 154, 14);

// One unscaled scene. Switch the existing day cycle with ?sky=22.
ctx.save();
ctx.beginPath(); ctx.roundRect(32, 170, 360, 640, 16); ctx.clip();
ctx.translate(32, 170);
const sky = skyAt(Number(params.get('sky') ?? 0));
const view = computeView(360, 640, 1);
drawSky(ctx, view, sky);
drawStars(ctx, view, sky, 1, 0);
drawSunMoon(ctx, sky);
drawClouds(ctx, view, sky, 0, 0);
drawCity(ctx, view, sky, 0);
drawWall(ctx, view, 0);
drawObstacle(ctx, { x: 0, gapY: 270, gap: 172 }, 230, view.top);
drawCat(ctx, 104, 270, { ...DEFAULT_POSE, ripple: 1 });
drawFish(ctx, 170, 300);
ctx.restore();

const glide: Partial<CatPose> = { spread: 1, billow: 0.6, cape: 0, legs: -1, tilt: 0.06, tail: -0.15 };
const crash: Partial<CatPose> = { eyes: 'dead', mouth: 'tongue', ears: 1, legs: 1, tail: 0.5, cape: 0.9, billow: 0.9 };
const poses: [string, string, Partial<CatPose>][] = [
  ['01 / 巡航', '圆滚滚 · 前爪领飞', { ripple: 1 }],
  ['02 / 起飞', '点一下：沿着冲劲拉长', { tilt: -0.4, scaleX: 0.9, scaleY: 1.12, legs: -1, cape: -0.2, billow: 1, ripple: 2 }],
  ['03 / 下落', '前爪放下 · 披风扬起', { tilt: 0.5, legs: 0.8, cape: 0.7, billow: 0.5, ripple: 1, tail: -0.2 }],
  ['04 / 俯冲', '睁大眼 · 张嘴', { tilt: 0.85, legs: 1, cape: 1.1, billow: 0.5, ripple: 3, eyes: 'wide', mouth: 'open', tail: -0.3 }],
  ['05 / 撞到天花板', '眯眼 · 压扁 · 耳朵一缩', { eyes: 'squint', ears: 0.7, scaleX: 1.14, scaleY: 0.86, ripple: 1 }],
  ['06 / 披风滑翔', '按住不放 · 披风张开', { ...glide, ripple: 1 }],
  ['07 / 叼到小鱼干', '张嘴一口 · 能量回来了', { ...glide, ripple: 4, mouth: 'open' }],
  ['08 / 撞到啦', '失控翻滚', { ...crash, tilt: 1.6, ripple: 1 }],
  ['09 / 再来一次', '翻肚皮 · 还有下一条命', { ...crash, tilt: Math.PI, cape: -0.1, billow: 0, scaleX: 1.12, scaleY: 0.9 }],
];
for (const [i, [name, hint, pose]] of poses.entries()) {
  const x = 424 + (i % 3) * 250, y = 170 + Math.floor(i / 3) * 210;
  ctx.fillStyle = '#eee0cc';
  ctx.beginPath(); ctx.roundRect(x, y, 234, 196, 16); ctx.fill();
  label(name, x + 16, y + 28, 15, '#2a1b3d');
  label(hint, x + 16, y + 180, 12);
  fit({ ...DEFAULT_POSE, ...pose }, x + 117, y + 102, 206, 122, 2);
}

const row = 170 + 3 * 210 + 14;
label('小鱼干', 32, row + 20, 15);
ctx.fillStyle = '#eee0cc';
ctx.beginPath(); ctx.roundRect(32, row + 34, 360, 170, 16); ctx.fill();
ctx.save(); ctx.translate(212, row + 119); ctx.scale(5, 5); drawFish(ctx, 0, 0); ctx.restore();
label('好友的幽灵猫 / 同一只猫换一身毛色，整只半透明', 424, row + 20, 15);
for (const [i, color] of GHOST_COLORS.entries()) {
  const x = 424 + i * 150;
  for (const [j, bg] of ['#7a4f8f', '#1f2a64'].entries()) {
    const y = row + 34 + j * 87;
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(x, y, 138, 80, 10); ctx.fill();
    fit({ ...DEFAULT_POSE, ripple: 1 + i }, x + 69, y + 40, 122, 64, 1.5, color);
  }
}
canvas.dataset.ready = 'true';
