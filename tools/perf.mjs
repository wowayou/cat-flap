/**
 * Performance + memory soak: lets the autopilot play (dying and retrying
 * forever) and reports per-frame main-thread cost and JS heap growth.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node tools/perf.mjs [seconds=60] [url=http://localhost:4173/?bot]
 */
import { chromium } from '@playwright/test';

const seconds = Number(process.argv[2] ?? 60);
const url = process.argv[3] ?? 'http://localhost:4173/?bot';

const browser = await chromium.launch();
const results = [];
for (const [name, viewport, dpr] of [['desktop 1280×800 @1x', { width: 1280, height: 800 }, 1], ['phone 390×844 @3x', { width: 390, height: 844 }, 3]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr });
  // Time every animation-frame callback (simulation + drawing) without touching app code.
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    const costs = (window.__costs = []);
    window.requestAnimationFrame = (cb) => raf((t) => {
      const s = performance.now();
      cb(t);
      costs.push(performance.now() - s);
    });
  });
  const cdp = await page.context().newCDPSession(page);
  await page.goto(url);
  await page.waitForTimeout(3000);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576;
  };
  const heapStart = await heap();
  await page.evaluate(() => (window.__costs.length = 0));
  await page.waitForTimeout(seconds * 1000);
  const costs = await page.evaluate(() => window.__costs.slice());
  const heapEnd = await heap();
  const runs = await page.evaluate(() => document.querySelector('.quip')?.textContent ?? '');
  costs.sort((a, b) => a - b);
  const pct = (p) => costs[Math.min(costs.length - 1, Math.floor(p * costs.length))].toFixed(2);
  results.push({
    profile: name,
    frames: costs.length,
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
