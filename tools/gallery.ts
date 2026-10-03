// Dev-only page: renders the art pieces in isolation for visual review (`npm run dev` → /tools/gallery.html).
import { drawCat, drawGhostCat, DEFAULT_POSE, type CatPose } from '../src/render/cat.ts';
import { drawObstacle } from '../src/render/posts.ts';
import { GHOST_COLORS, skyAt } from '../src/render/palette.ts';
import { drawCity, drawClouds, drawSky, drawStars, drawSunMoon, drawWall } from '../src/render/scenery.ts';
import { computeView } from '../src/render/view.ts';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const W = 1200, H = 1000, dpr = 2;
canvas.width = W * dpr; canvas.height = H * dpr;
canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
const ctx = canvas.getContext('2d')!;

// Left: a 360×640 scene at 1×, with sky position from the URL (?sky=22).
const sky = skyAt(Number(new URLSearchParams(location.search).get('sky') ?? 0));
const view = computeView(360, 640, dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 60);
drawSky(ctx, view, sky);
drawStars(ctx, view, sky, 1, 0);
drawSunMoon(ctx, sky);
drawClouds(ctx, view, sky, 0, 0);
drawCity(ctx, view, sky, 0);
drawWall(ctx, view, 0);
drawObstacle(ctx, { x: 0, gapY: 250, gap: 172 }, 210, view.top);
drawCat(ctx, 104, 270, DEFAULT_POSE);

// Right: poses at 3×.
const poses: [string, Partial<CatPose>][] = [
  ['default', {}],
  ['flap (cape whips, stretch)', { cape: 0, billow: 1, ripple: 2, scaleX: 0.9, scaleY: 1.12, legs: -1, tilt: -0.35 }],
  ['rising', { cape: -0.05, billow: 0.6, ripple: 4, legs: -0.8, tilt: -0.3 }],
  ['falling', { cape: 0.75, billow: 0.3, ripple: 1, legs: 1, tilt: 0.7, eyes: 'wide', mouth: 'open' }],
  ['blink', { eyes: 'blink', ripple: 3 }],
  ['dead (falling)', { eyes: 'dead', mouth: 'tongue', tilt: 1.8, legs: 1, cape: 0.9, billow: 0.7 }],
  ['dead (landed)', { eyes: 'dead', mouth: 'tongue', tilt: Math.PI, legs: 1, cape: 0, billow: 0, scaleX: 1.1, scaleY: 0.92 }],
  ['tail swing', { tail: 0.5, ripple: 5 }],
];
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
ctx.font = '13px sans-serif';
poses.forEach(([name, p], i) => {
  const col = i % 4, row = Math.floor(i / 4);
  const ox = 420 + col * 195, oy = 60 + row * 330;
  ctx.fillStyle = '#5b3f8c';
  ctx.fillRect(ox, oy, 180, 300);
  ctx.fillStyle = '#fff';
  ctx.fillText(name, ox + 6, oy + 18);
  ctx.save();
  ctx.translate(ox + 90, oy + 160);
  ctx.scale(3, 3);
  drawCat(ctx, 0, 0, { ...DEFAULT_POSE, ...p });
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
});

// Bottom: friends' ghost silhouettes at 2×, over a dusk and a night sky, the player alongside for contrast.
GHOST_COLORS.forEach((color, i) => {
  const ox = 30 + i * 230, oy = 720;
  for (const [j, bg] of (['#7a4f8f', '#1f2a64'] as const).entries()) {
    ctx.fillStyle = bg;
    ctx.fillRect(ox, oy + j * 135, 215, 125);
    ctx.save();
    ctx.translate(ox + 120, oy + j * 135 + 68);
    ctx.scale(2, 2);
    if (i === 0 && j === 0) drawCat(ctx, -30, 0, DEFAULT_POSE);
    drawGhostCat(ctx, 0, 0, j === 0 ? DEFAULT_POSE : { ...DEFAULT_POSE, cape: 0, billow: 1, legs: -1, tilt: -0.35 }, color, 0.5);
    ctx.restore();
  }
});

