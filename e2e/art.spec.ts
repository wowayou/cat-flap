import { expect, test } from '@playwright/test';
import { expectPhase } from './helpers.ts';

test('failed character download offers reload and cannot start invisible play', async ({ page }) => {
  const asset = /\/cat[^/]*\.svg(?:\?.*)?$/;
  await page.route(asset, (route) => route.abort());
  await page.goto('/');
  const retry = page.locator('#art-status button');
  await expect(retry).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  await page.keyboard.press('Space');
  await expectPhase(page, 'loading');
  await page.unroute(asset);
  await retry.click();
  await expectPhase(page, 'ready');
  await expect(page.locator('#art-status')).toBeHidden();
  await expect(page.locator('#app')).not.toHaveAttribute('inert');
});

test('every pose renders and ghosts use the same unclipped silhouette with uniform alpha', async ({ page }) => {
  await page.goto('http://localhost:4174/tools/gallery.html');
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  const result = await page.evaluate(async () => {
    const moduleUrl = '/src/render/cat.ts';
    const { loadCatArt, drawCat, drawGhostCat, DEFAULT_POSE } = await import(/* @vite-ignore */ moduleUrl);
    const configUrl = '/src/game/config.ts';
    const { CAT } = await import(/* @vite-ignore */ configUrl);
    await loadCatArt();
    const canvas = document.createElement('canvas');
    canvas.width = 480; canvas.height = 420;
    const ctx = canvas.getContext('2d')!;
    let maxAlpha = 0, lostPixels = 0, painted = 0, emptyHitbox = 0, clippedEdges = 0, alphaMismatch = 0, softPixels = 0;
    const colors = new Set<number>();
    // Matching silhouettes alone would miss clipping shared by both cats.
    // Every intermediate composite must retain a transparent safety border.
    ctx.drawImage = new Proxy(ctx.drawImage, {
      apply(target, thisArg, args) {
        const source = args[0];
        if (source instanceof HTMLCanvasElement) {
          const { width, height } = source;
          const pixels = source.getContext('2d')!.getImageData(0, 0, width, height).data;
          for (let x = 0; x < width; x++) {
            clippedEdges += Number(pixels[x * 4 + 3] > 0) + Number(pixels[((height - 1) * width + x) * 4 + 3] > 0);
          }
          for (let y = 0; y < height; y++) {
            clippedEdges += Number(pixels[y * width * 4 + 3] > 0) + Number(pixels[(y * width + width - 1) * 4 + 3] > 0);
          }
        }
        return Reflect.apply(target, thisArg, args);
      },
    });
    const transforms = [
      { tilt: 0, scaleX: 1, scaleY: 1 },
      { tilt: -0.4, scaleX: 0.92, scaleY: 1.1 },
      { tilt: 0.85, scaleX: 1.12, scaleY: 0.88 },
      { tilt: Math.PI, scaleX: 1.2, scaleY: 0.8 },
    ];
    // Sample the full legal joint range, including extreme cape/tail and crash ears.
    for (const legs of [-1, 0, 1]) for (const cape of [-0.05, 0.6, 1.3]) for (const transform of transforms) {
      const pose = { ...DEFAULT_POSE, ...transform, legs, cape, tail: legs * 0.5, ears: legs === 1 ? 1 : 0, billow: 1, ripple: 2 };
      ctx.setTransform(3, 0, 0, 3, 240, 210);
      drawCat(ctx, 0, 0, pose);
      const player = ctx.getImageData(0, 0, 480, 420).data;
      // Tilt and stretch must retain hard pixel edges and a limited palette,
      // not just disable smoothing on the unrotated default pose.
      for (let i = 0; i < player.length; i += 4) {
        if (player[i + 3] === 0) continue;
        if (player[i + 3] !== 255) softPixels++;
        colors.add((player[i] << 16) | (player[i + 1] << 8) | player[i + 2]);
      }
      // The live collision disk must stay inside opaque art. The belly-up
      // landing squash happens after collisions are disabled.
      const radius = CAT.hitboxRadius;
      if (transform.tilt !== Math.PI) for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y < radius * radius && player[((210 + y * 3) * 480 + 240 + x * 3) * 4 + 3] < 220) emptyHitbox++;
      }
      ctx.clearRect(-80, -70, 160, 140);
      drawGhostCat(ctx, 0, 0, pose, '#b9bdc7', 0.5);
      const ghost = ctx.getImageData(0, 0, 480, 420).data;
      for (let i = 3; i < ghost.length; i += 4) {
        maxAlpha = Math.max(maxAlpha, ghost[i]);
        if (Math.abs(ghost[i] - player[i] * 0.5) > 1) alphaMismatch++;
        if (player[i] > 250) { painted++; if (ghost[i] < 120) lostPixels++; }
      }
      ctx.clearRect(-80, -70, 160, 140);
    }
    return { maxAlpha, lostPixels, painted, emptyHitbox, clippedEdges, alphaMismatch, softPixels, colors: colors.size };
  });
  expect(result.painted).toBeGreaterThan(50_000);
  expect(result.maxAlpha).toBeLessThanOrEqual(128);
  expect(result.lostPixels).toBe(0);
  expect(result.emptyHitbox).toBe(0);
  expect(result.clippedEdges).toBe(0);
  expect(result.alphaMismatch).toBe(0);
  expect(result.softPixels).toBe(0);
  expect(result.colors).toBeLessThanOrEqual(16);
});

test('paused ghosts keep their positions while the render interpolation changes', async ({ page }) => {
  await page.goto('http://localhost:4174/tools/gallery.html');
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  const frozen = await page.evaluate(async () => {
    const modules = ['/src/game/Game.ts', '/src/game/autopilot.ts', '/src/render/Renderer.ts', '/src/social/squad.ts'];
    const [{ Game }, { Autopilot }, { Renderer }, { Squad }] = await Promise.all(modules.map((url) => import(/* @vite-ignore */ url)));
    const recorded = new Game(7), bot = new Autopilot();
    recorded.flap();
    for (let i = 0; i < 360; i++) { bot.update(recorded); recorded.step(1 / 120); }
    const squad = new Squad(Array.from({ length: 5 }, (_, i) => ({ pid: i + 1, name: `Cat ${i}`, score: recorded.score, record: recorded.record })));
    const player = new Game(7);
    const canvas = document.createElement('canvas');
    const renderer = new Renderer(canvas);
    renderer.resize(390, 844, 2);
    renderer.setSquad(squad);
    player.flap();
    for (let i = 0; i < 30; i++) {
      squad.beforeStep(player);
      const before = player.phase;
      player.step(1 / 120);
      squad.afterStep(player, before);
      renderer.render(player, 0.5, 1 / 120);
    }
    player.pause();
    player.step(1 / 120);
    renderer.render(player, 0.1, 1 / 60);
    const snapshot = canvas.toDataURL();
    // This also freezes the five independent blink/tail/cape phases.
    for (const alpha of [0.9, 0.3, 0.7, 0]) {
      player.step(1 / 120);
      renderer.render(player, alpha, 1 / 60);
      if (canvas.toDataURL() !== snapshot) return false;
    }
    return true;
  });
  expect(frozen).toBe(true);
});
