// Dev-only page: renders the art pieces in isolation for visual review (`npm run dev` → /tools/gallery.html).
import { drawCat, DEFAULT_POSE, type CatPose } from '../src/render/cat.ts';
import { drawObstacle } from '../src/render/posts.ts';
import { skyAt } from '../src/render/palette.ts';
import { drawCity, drawClouds, drawSky, drawStars, drawSunMoon, drawWall } from '../src/render/scenery.ts';
import { computeView } from '../src/render/view.ts';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const W = 1200, H = 760, dpr = 2;
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
  ['flap (wing down, stretch)', { wing: 1, scaleX: 0.9, scaleY: 1.12, legs: -1, tilt: -0.35 }],
  ['rising', { wing: 0.5, legs: -0.8, tilt: -0.3 }],
  ['falling', { wing: 0.1, legs: 1, tilt: 0.7, eyes: 'wide', mouth: 'open' }],
  ['blink', { eyes: 'blink' }],
  ['dead (falling)', { eyes: 'dead', mouth: 'tongue', tilt: 1.8, legs: 1, wing: 0.7 }],
  ['dead (landed)', { eyes: 'dead', mouth: 'tongue', tilt: Math.PI, legs: 1, wing: 0.7, scaleX: 1.1, scaleY: 0.92 }],
  ['tail swing', { tail: 0.5 }],
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
