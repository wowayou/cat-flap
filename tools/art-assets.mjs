/** Export icons and documentation pictures (character sheet, challenge preview, the four maps) from the production game.
 * Start npm run dev, then run: npm run art-assets [http://localhost:5173]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:5173';
const root = new URL('../', import.meta.url);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1050 }, deviceScaleFactor: 1, locale: 'zh-CN' });
  await page.goto(`${base}/tools/gallery.html`);
  await page.locator('canvas[data-ready="true"]').waitFor();
  await page.screenshot({ path: new URL('docs/character.png', root).pathname });
  const icon = await page.evaluate(async () => {
    const moduleUrl = '/src/render/cat.ts';
    const { paintCat, DEFAULT_POSE, GINGER_COLORS } = await import(moduleUrl);
    // Record the game's own drawing calls as SVG paths, so the icon is the
    // production cat as true vectors and can never drift from it. Covers the
    // subset of the Canvas 2D API that paintCat uses; transforms are baked
    // into the coordinates, arcs become Bézier curves.
    class SvgPen {
      constructor() { this.out = []; this.stack = []; this.m = [1, 0, 0, 1, 0, 0]; this.d = []; this.cur = null; this.start = null; this.clips = 0; this.open = [];
        Object.assign(this, { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', globalAlpha: 1 }); }
      save() { this.stack.push({ m: [...this.m], fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, lineCap: this.lineCap, lineJoin: this.lineJoin, globalAlpha: this.globalAlpha, depth: this.open.length }); }
      restore() {
        const { depth, ...s } = this.stack.pop();
        while (this.open.length > depth) { this.open.pop(); this.out.push('</g>'); }
        Object.assign(this, s);
      }
      transform(a, b, c, d, e, f) { const m = this.m; this.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; }
      translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
      scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
      rotate(a) { this.transform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0); }
      p(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
      f(v) { return Math.round(v * 1000) / 1000; }
      pt(x, y) { const [px, py] = this.p(x, y); return `${this.f(px)} ${this.f(py)}`; }
      beginPath() { this.d = []; this.cur = null; this.start = null; }
      moveTo(x, y) { this.d.push(`M${this.pt(x, y)}`); this.cur = this.start = [x, y]; }
      lineTo(x, y) { if (!this.cur) return this.moveTo(x, y); this.d.push(`L${this.pt(x, y)}`); this.cur = [x, y]; }
      quadraticCurveTo(cx, cy, x, y) { this.d.push(`Q${this.pt(cx, cy)} ${this.pt(x, y)}`); this.cur = [x, y]; }
      bezierCurveTo(a, b, c, d, x, y) { this.d.push(`C${this.pt(a, b)} ${this.pt(c, d)} ${this.pt(x, y)}`); this.cur = [x, y]; }
      closePath() { this.d.push('Z'); this.cur = this.start; }
      ellipse(x, y, rx, ry, rot, a0, a1) {
        const at = (a) => [x + rx * Math.cos(a) * Math.cos(rot) - ry * Math.sin(a) * Math.sin(rot), y + rx * Math.cos(a) * Math.sin(rot) + ry * Math.sin(a) * Math.cos(rot)];
        const tangent = (a) => [-rx * Math.sin(a) * Math.cos(rot) - ry * Math.cos(a) * Math.sin(rot), -rx * Math.sin(a) * Math.sin(rot) + ry * Math.cos(a) * Math.cos(rot)];
        const [sx, sy] = at(a0);
        if (this.cur) this.lineTo(sx, sy); else this.moveTo(sx, sy);
        const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2)));
        const step = (a1 - a0) / n, k = (4 / 3) * Math.tan(step / 4);
        for (let i = 0; i < n; i++) {
          const b0 = a0 + i * step, b1 = b0 + step;
          const [x0, y0] = at(b0), [x1, y1] = at(b1), [t0x, t0y] = tangent(b0), [t1x, t1y] = tangent(b1);
          this.bezierCurveTo(x0 + k * t0x, y0 + k * t0y, x1 - k * t1x, y1 - k * t1y, x1, y1);
        }
      }
      arc(x, y, r, a0, a1) { this.ellipse(x, y, r, r, 0, a0, a1); }
      fillRect(x, y, w, h) { this.beginPath(); this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); this.fill(); }
      alpha() { return this.globalAlpha < 1 ? ` opacity="${this.f(this.globalAlpha)}"` : ''; }
      fill() { this.out.push(`<path d="${this.d.join('')}" fill="${this.fillStyle}"${this.alpha()}/>`); }
      stroke() {
        const w = this.lineWidth * Math.sqrt(Math.abs(this.m[0] * this.m[3] - this.m[1] * this.m[2]));
        this.out.push(`<path d="${this.d.join('')}" fill="none" stroke="${this.strokeStyle}" stroke-width="${this.f(w)}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"${this.alpha()}/>`);
      }
      clip() {
        const id = `c${this.clips++}`;
        this.out.push(`<clipPath id="${id}"><path d="${this.d.join('')}"/></clipPath><g clip-path="url(#${id})">`);
        this.open.push(id);
      }
    }
    const pen = new SvgPen();
    // Fit the cruising cat in the 48×48 icon.
    pen.translate(26.5, 25.5);
    pen.scale(0.7, 0.7);
    paintCat(pen, { ...DEFAULT_POSE, ripple: 1.2, billow: 0.6 }, GINGER_COLORS);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
<!-- Generated by tools/art-assets.mjs from the production cat drawing. -->
<rect width="48" height="48" rx="10" fill="#2b2350"/>
${pen.out.join('\n')}
</svg>\n`;
  });
  await writeFile(new URL('public/icon.svg', root), icon);
  for (const size of [180, 512]) {
    const png = await page.evaluate(async ({ icon, size }) => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon)}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { icon, size });
    await writeFile(new URL(`public/icon-${size}.png`, root), Buffer.from(png, 'base64'));
  }

  // The same checked-in recording used by the cross-engine replay test.
  const social = await readFile(new URL('e2e/social.spec.ts', root), 'utf8');
  const challenge = social.match(/const GOLDEN = '([^']+)'/)[1];
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  await phone.addInitScript(() => localStorage.setItem('catflap.name', '小橘'));
  await phone.goto(`${base}/?c=${challenge}`);
  await phone.locator('#app[data-phase="ready"]').waitFor();
  await phone.evaluate(() => document.fonts.ready);
  await phone.waitForTimeout(600); // allow the initial CSS screen transitions to finish
  const ready = await phone.screenshot();
  await phone.goto(`${base}/?c=${challenge}&bot=15`);
  await phone.waitForFunction(() => document.querySelector('.score')?.textContent === '9', null, { timeout: 30_000 });
  await phone.waitForTimeout(300); // let +1 rise clear of the face
  const flying = await phone.screenshot();
  await phone.locator('#app[data-phase="gameover"]').waitFor({ timeout: 30_000 });
  await phone.locator('#app.can-retry').waitFor();
  // The retry lockout ends before the score count-up. Capture the settled
  // value so the result card and the ranking don't show different scores.
  await phone.waitForFunction(() => document.querySelector('.final-score')?.textContent === '15');
  await phone.waitForFunction(() => Number(getComputedStyle(document.querySelector('.retry-hint')).opacity) > 0.95);
  const over = await phone.screenshot();
  /** Phone screenshots side by side on the dusk background. */
  const compose = async (shots, file) => {
    const panels = shots.map((p) => p.toString('base64'));
    const composite = await page.evaluate(async (panels) => {
      const canvas = document.createElement('canvas');
      canvas.width = 16 + panels.length * 406; canvas.height = 876;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#2b2350'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const [i, panel] of panels.entries()) {
        const image = new Image(); image.src = `data:image/png;base64,${panel}`;
        await image.decode();
        ctx.drawImage(image, 16 + i * 406, 16);
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }, panels);
    await writeFile(new URL(file, root), Buffer.from(composite, 'base64'));
  };
  await compose([ready, flying, over], 'docs/preview.png');

  // One mid-flight panel per map, in picker order.
  const maps = [];
  for (const map of ['garden', 'library', 'clouds', 'moon']) {
    await phone.goto(`${base}/?map=${map}&bot`);
    await phone.waitForFunction(() => document.querySelector('.score')?.textContent === '6', null, { timeout: 30_000 });
    await phone.waitForTimeout(300);
    maps.push(await phone.screenshot());
  }
  await compose(maps, 'docs/maps.png');
  console.log('Exported public/icon.svg, icon-180.png, icon-512.png, docs/character.png, docs/preview.png and docs/maps.png');
} finally {
  await browser.close();
}
