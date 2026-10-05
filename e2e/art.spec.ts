import { expect, test } from '@playwright/test';

test('every pose covers the hitbox, and ghosts are the same cat as a translucent silhouette', async ({ page }) => {
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
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    let maxGhost = 0, painted = 0, emptyHitbox = 0, shapeMismatch = 0, edgePixels = 0, ghostHoles = 0;
    const centre: number[] = [];
    // The extremes of every joint: climb and dive, stretch and squash, the
    // spread cape, paws reaching and dropping, and the crash roll all the way round.
    const flight = [
      {}, { tilt: -0.4, scaleX: 0.9, scaleY: 1.12, legs: -1, cape: -0.25 }, { tilt: 0.85, legs: 1, cape: 1.2, eyes: 'wide', mouth: 'open' },
      { scaleX: 1.14, scaleY: 0.86, eyes: 'squint', ears: 0.7 }, { spread: 1, legs: -1, cape: 0, mouth: 'open' }, { eyes: 'blink', tail: 0.3 },
    ];
    const poses: Record<string, unknown>[] = [];
    for (const pose of flight) for (const ripple of [0, 2.1, 4.2]) poses.push({ ...pose, billow: 1.2, ripple });
    for (let k = 0; k < 8; k++) poses.push({ tilt: (k * Math.PI) / 4, legs: 1, cape: 0.9, billow: 0.9, ripple: k, eyes: 'dead', mouth: 'tongue', ears: 1, tail: 0.5, crash: true });
    poses.push({ tilt: Math.PI, scaleX: 1.22, scaleY: 0.8, legs: 1, cape: -0.1, billow: 0, eyes: 'dead', mouth: 'tongue', ears: 1, crash: true });
    for (const extra of poses) {
      const pose = { ...DEFAULT_POSE, ...extra };
      ctx.setTransform(3, 0, 0, 3, 240, 210);
      drawCat(ctx, 0, 0, pose);
      const player = ctx.getImageData(0, 0, 480, 420).data;
      // The whole cat stays well inside the canvas (a clipped pose would touch its border).
      for (let x = 0; x < 480; x++) edgePixels += Number(player[x * 4 + 3] > 0) + Number(player[(419 * 480 + x) * 4 + 3] > 0);
      for (let y = 0; y < 420; y++) edgePixels += Number(player[y * 480 * 4 + 3] > 0) + Number(player[(y * 480 + 479) * 4 + 3] > 0);
      // The live collision disk must stay inside solid art; a crash happens after collisions stop.
      const radius = CAT.hitboxRadius;
      if (!extra.crash) for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y < radius * radius && player[((210 + y * 3) * 480 + 240 + x * 3) * 4 + 3] < 250) emptyHitbox++;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 480, 420);
      ctx.setTransform(3, 0, 0, 3, 240, 210);
      drawGhostCat(ctx, 0, 0, pose, '#b9bdc7', 0.5);
      const ghost = ctx.getImageData(0, 0, 480, 420).data;
      for (let i = 3; i < ghost.length; i += 4) {
        maxGhost = Math.max(maxGhost, ghost[i]);
        if (player[i] > 0) painted++;
        // The same cat: the ghost never reaches outside the player's shape.
        if (player[i] === 0 && ghost[i] > 8) shapeMismatch++;
      }
      // A plain patch of fur on the back, clear of the face, shading and stripes.
      if (!extra.crash) centre.push(ghost[((210 - 12) * 480 + 240 - 24) * 4 + 3]);
      // ...and its body fills the whole hitbox disk.
      if (!extra.crash) for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y < radius * radius && ghost[((210 + y * 3) * 480 + 240 + x * 3) * 4 + 3] < 100) ghostHoles++;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 480, 420);
    }
    return { maxGhost, painted, emptyHitbox, shapeMismatch, edgePixels, ghostHoles, centre: [Math.min(...centre), Math.max(...centre)] };
  });
  expect(result.painted).toBeGreaterThan(200_000);
  expect(result.edgePixels).toBe(0);
  expect(result.emptyHitbox).toBe(0);
  expect(result.shapeMismatch).toBe(0);
  expect(result.ghostHoles).toBe(0);
  // Translucent everywhere: the body is half see-through, and nothing is layered thicker than
  // where a paw, the tail and the cape cross (three halves: 87.5%), so no spot turns opaque.
  expect(result.centre[0]).toBeGreaterThanOrEqual(120);
  expect(result.centre[1]).toBeLessThanOrEqual(136);
  expect(result.maxGhost).toBeLessThanOrEqual(225);
});

test('paused ghosts keep their positions while the render interpolation changes, on every map', async ({ page }) => {
  await page.goto('http://localhost:4174/tools/gallery.html');
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  const frozen = await page.evaluate(async () => {
    const modules = ['/src/game/Game.ts', '/src/game/autopilot.ts', '/src/render/Renderer.ts', '/src/social/squad.ts', '/src/game/maps.ts'];
    const [{ Game }, { Autopilot }, { Renderer }, { Squad }, { MAP_IDS }] = await Promise.all(modules.map((url) => import(/* @vite-ignore */ url)));
    const result: Record<string, boolean> = {};
    for (const map of MAP_IDS) {
      const recorded = new Game(7, map), bot = new Autopilot();
      recorded.flap();
      for (let i = 0; i < 360; i++) { bot.update(recorded); recorded.step(1 / 120); }
      const squad = new Squad(Array.from({ length: 5 }, (_, i) => ({ pid: i + 1, name: `Cat ${i}`, score: recorded.score, record: recorded.record })));
      const player = new Game(7, map);
      const canvas = document.createElement('canvas');
      // Snapshots read pixels back; WebKit would then switch this canvas to a
      // different rasterizer whose anti-aliasing differs. Ask for the
      // read-friendly one up front, so equal frames give equal pixels.
      canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      const renderer = new Renderer(canvas);
      renderer.resize(390, 844, 2);
      renderer.setSquad(squad);
      // Hold on from take-off, so the pause catches a glide: spread cape, energy ring, wind streaks.
      player.setHold(true);
      player.flap();
      for (let i = 0; i < 60; i++) {
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
      // This also freezes the five independent blink/tail/cape phases and every map's ambient motion.
      result[map] = player.cat.gliding;
      for (const alpha of [0.9, 0.3, 0.7, 0]) {
        player.step(1 / 120);
        renderer.render(player, alpha, 1 / 60);
        if (canvas.toDataURL() !== snapshot) result[map] = false;
      }
    }
    return result;
  });
  expect(frozen).toEqual({ garden: true, library: true, clouds: true, moon: true });
});
