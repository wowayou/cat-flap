/**
 * Performance + memory soak: lets the autopilot play (dying and retrying
 * forever) and reports per-frame main-thread cost and JS heap growth.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node tools/perf.mjs [seconds=60] [url=http://localhost:4173/?bot]
 *   node tools/perf.mjs 60 http://localhost:4173/?bot --ghosts
 */
import { chromium } from '@playwright/test';
import { Game } from '../src/game/Game.ts';
import { Autopilot } from '../src/game/autopilot.ts';
import { encodeChallenge, MAX_GHOSTS, verifyGhosts } from '../src/social/link.ts';

const seconds = Number(process.argv[2] ?? 60);
const url = new URL(process.argv[3] ?? 'http://localhost:4173/?bot');
const withGhosts = process.argv.includes('--ghosts');
if (withGhosts) {
  // Five valid, long recordings keep the maximum squad visible throughout
  // the sample. Distinct IDs keep all five entries after link validation.
  const game = new Game(9001), bot = new Autopilot();
  game.flap();
  const flightSeconds = seconds + 15;
  for (let i = 0; i < 120 * (flightSeconds + 10) && game.phase === 'playing'; i++) {
    if (game.time < flightSeconds) bot.update(game);
    game.step(1 / 120);
  }
  if (game.time < flightSeconds) throw new Error('Performance recording ended too soon');
  const ghosts = Array.from({ length: MAX_GHOSTS }, (_, i) => ({
    pid: i + 1, name: `Ghost ${i + 1}`, score: game.score, record: game.record,
  }));
  if (verifyGhosts(ghosts).valid.length !== MAX_GHOSTS) throw new Error('Invalid performance recordings');
  url.searchParams.set('c', encodeChallenge({ seed: game.seed, ghosts }));
  url.searchParams.set('bot', '');
}

const browser = await chromium.launch();
const results = [];
for (const [name, viewport, dpr] of [['desktop 1280×800 @1x', { width: 1280, height: 800 }, 1], ['phone 390×844 @3x', { width: 390, height: 844 }, 3]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr });
  // Time every animation-frame callback (simulation + drawing) without touching app code.
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    const costs = (window.__costs = []);
    const cats = (window.__cats = []);
    let drawn = 0;
    // Only complete character composites are blitted to the stage. Count
    // actual draws, so a short/failed replay cannot report a five-ghost run.
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (this.canvas.id === 'stage') drawn++;
      return Reflect.apply(drawImage, this, args);
    };
    window.requestAnimationFrame = (cb) => raf((t) => {
      drawn = 0;
      const s = performance.now();
      cb(t);
      costs.push(performance.now() - s);
      cats.push(drawn);
    });
  });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(url.href);
  await page.locator('#app[data-phase="playing"]').waitFor();
  if (withGhosts && await page.locator('.challenge-list li').count() !== MAX_GHOSTS) {
    throw new Error('The production page did not accept all five ghosts');
  }
  await page.waitForTimeout(3000);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576;
  };
  const heapStart = await heap();
  await page.evaluate(() => { window.__costs.length = 0; window.__cats.length = 0; });
  await page.waitForTimeout(seconds * 1000);
  const { costs, cats } = await page.evaluate(() => ({ costs: window.__costs.slice(), cats: window.__cats.slice() }));
  if (!costs.length || (withGhosts && cats.some((count) => count !== MAX_GHOSTS + 1))) {
    throw new Error('The full squad was not drawn in every sampled frame');
  }
  const heapEnd = await heap();
  const runs = await page.evaluate(() => document.querySelector('.quip')?.textContent ?? '');
  costs.sort((a, b) => a - b);
  const pct = (p) => costs[Math.min(costs.length - 1, Math.floor(p * costs.length))].toFixed(2);
  results.push({
    profile: name,
    frames: costs.length,
    'cats/frame min': Math.min(...cats),
    'fps': (costs.length / seconds).toFixed(1),
    'median ms': pct(0.5),
    'p95 ms': pct(0.95),
    'p99 ms': pct(0.99),
    'max ms': costs[costs.length - 1].toFixed(2),
    'heap start MB': heapStart.toFixed(2),
    'heap end MB': heapEnd.toFixed(2),
    'last quip': runs,
  });
  await page.close();
}
console.table(results);
await browser.close();
