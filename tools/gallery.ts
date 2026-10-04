// Dev-only visual review, always using the production renderer and artwork.
import { drawCat, drawGhostCat, loadCatArt, DEFAULT_POSE, type CatPose } from '../src/render/cat.ts';
import { drawObstacle } from '../src/render/posts.ts';
import { GHOST_COLORS, skyAt } from '../src/render/palette.ts';
import { drawCity, drawClouds, drawSky, drawStars, drawSunMoon, drawWall } from '../src/render/scenery.ts';
import { computeView } from '../src/render/view.ts';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const W = 1200, H = 1090, dpr = 2;
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

function label(text: string, x: number, y: number, size = 13, color = '#6b5671'): void {
  ctx.font = `${size >= 20 ? 700 : 500} ${size}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

label('CAT FLAP / PIXEL CHARACTER', 32, 38, 12);
label('小小身躯，也敢迎风。', 32, 84, 30, '#493047');
label('像素小飞猫 · 向前的眼神 · 迎风的红披风', 32, 113, 15);
label('实际游戏尺寸', 32, 154, 14);
label('动作与表情 / 2.4×', 424, 154, 14);

// One unscaled scene. Switch the existing day cycle with ?sky=22.
ctx.save();
ctx.beginPath(); ctx.roundRect(32, 170, 360, 640, 16); ctx.clip();
ctx.translate(32, 170);
const sky = skyAt(Number(new URLSearchParams(location.search).get('sky') ?? 0));
const view = computeView(360, 640, 1);
drawSky(ctx, view, sky);
drawStars(ctx, view, sky, 1, 0);
drawSunMoon(ctx, sky);
drawClouds(ctx, view, sky, 0, 0);
drawCity(ctx, view, sky, 0);
drawWall(ctx, view, 0);
drawObstacle(ctx, { x: 0, gapY: 270, gap: 172 }, 230, view.top);
drawCat(ctx, 104, 270, DEFAULT_POSE);
ctx.restore();

const poses: [string, string, Partial<CatPose>][] = [
  ['01 / 巡航', '前爪领飞 · 目光朝向下一道关卡', {}],
  ['02 / 起飞', '伸爪 · 尾巴与披风跟随', { cape: 0, billow: 1, ripple: 2, scaleX: 0.92, scaleY: 1.1, legs: -1, tilt: -0.35 }],
  ['03 / 下落', '睁大眼 · 张爪准备落地', { cape: 0.75, billow: 0.3, ripple: 1, legs: 1, tilt: 0.7, eyes: 'wide', mouth: 'open' }],
  ['04 / 眨眼', '偶尔放松一下', { eyes: 'blink', ripple: 3 }],
  ['05 / 撞到啦', '耳朵耷拉 · 失控翻身', { eyes: 'dead', mouth: 'tongue', tilt: 1.8, legs: 1, cape: 0.9, billow: 0.7, ears: 1 }],
  ['06 / 再来一次', '翻肚皮 · 还有下一条命', { eyes: 'dead', mouth: 'tongue', tilt: Math.PI, legs: 1, cape: 0, billow: 0, scaleX: 1.1, scaleY: 0.92, ears: 1 }],
];
for (const [i, [name, hint, pose]] of poses.entries()) {
  const x = 424 + (i % 3) * 250, y = 170 + Math.floor(i / 3) * 328;
  ctx.fillStyle = '#eee0cc';
  ctx.beginPath(); ctx.roundRect(x, y, 234, 312, 16); ctx.fill();
  label(name, x + 16, y + 29, 15, '#493047');
  label(hint, x + 16, y + 290, 12);
  ctx.save();
  ctx.translate(x + 121, y + 159);
  ctx.scale(2.4, 2.4);
  drawCat(ctx, 0, 0, { ...DEFAULT_POSE, ...pose });
  if (new URLSearchParams(location.search).has('debug')) {
    ctx.strokeStyle = '#528983'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

label('好友的幽灵猫 / 同一轮廓，整只半透明', 32, 856, 15);
for (const [i, color] of GHOST_COLORS.entries()) {
  const x = 32 + i * 234;
  for (const [j, bg] of ['#7a4f8f', '#1f2a64'].entries()) {
    const y = 877 + j * 89;
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(x, y, 218, 81, 10); ctx.fill();
    ctx.save(); ctx.translate(x + 110, y + 44); ctx.scale(1.35, 1.35);
    drawGhostCat(ctx, 0, 0, DEFAULT_POSE, color, 0.5);
    ctx.restore();
  }
}
canvas.dataset.ready = 'true';
