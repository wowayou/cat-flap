import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPhase, press, trackErrors } from './helpers.ts';

async function tapOrClick(locator: Locator, isMobile: boolean): Promise<void> {
  if (isMobile) await locator.tap();
  else await locator.click();
}

/** Count canvas frames and animation-frame callbacks without touching app code. */
async function countFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __draws: number; __rafs: number };
    w.__draws = 0;
    w.__rafs = 0;
    const setTransform = CanvasRenderingContext2D.prototype.setTransform;
    CanvasRenderingContext2D.prototype.setTransform = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
      if (this.canvas.id === 'stage') w.__draws++;
      return Reflect.apply(setTransform, this, args);
    } as typeof setTransform;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => {
      w.__rafs++;
      cb(t);
    });
  });
}
const counters = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __draws: number; __rafs: number };
  return { draws: w.__draws, rafs: w.__rafs };
});

test('the result card retries in one press, and can go back to choose a map', async ({ page, isMobile }) => {
  const errors = trackErrors(page);
  await page.goto('/?map=library');
  await press(page, isMobile);
  await expectPhase(page, 'gameover');
  const retry = page.locator('.retry-btn');
  const home = page.locator('.home-btn');
  // The lockout is a real disabled state, not just CSS: keyboard and screen readers can't skip it either.
  await expect(retry).toBeDisabled();
  await expect(page.locator('.share-btn')).toBeDisabled();
  await expect(page.locator('.result-tip')).not.toBeEmpty();
  await expect(page.locator('.result-goal')).toContainText('10');
  await expect(retry).toBeEnabled();

  await tapOrClick(retry, isMobile);
  await expectPhase(page, 'playing');
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'library'); // same map, no detour

  await expectPhase(page, 'gameover');
  await tapOrClick(home, isMobile);
  await expectPhase(page, 'ready');
  await expect(page.locator('.map-picker')).toBeVisible();
  await expect(page.locator('.ready-goal')).toContainText('10');
  expect(errors).toEqual([]);
});

test('hidden screens cannot be focused or clicked while another one shows', async ({ page }) => {
  await page.goto('/');
  await expectPhase(page, 'ready');
  // The result card's buttons exist in the DOM, but nothing about them is reachable.
  expect(await page.evaluate(() => (document.querySelector('.over-screen') as HTMLElement).inert)).toBe(true);
  expect(await page.evaluate(() => (document.querySelector('.ready-screen') as HTMLElement).inert)).toBe(false);
});

test('help explains the controls, owns input while open, and never starts or resumes a run', async ({ page, isMobile }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expectPhase(page, 'ready');
  await tapOrClick(page.locator('.help-btn'), isMobile);
  const dialog = page.locator('#help');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('h3')).toHaveCount(5);
  if (!isMobile) {
    await page.keyboard.press('Space'); // activates the focused "Got it", which closes
    await expect(dialog).toBeHidden();
    await expectPhase(page, 'ready'); // ... and that Space was not also a take-off
    await page.locator('.help-btn').click();
    await page.keyboard.press('KeyW');
    await page.keyboard.press('KeyP');
    await expectPhase(page, 'ready');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expectPhase(page, 'ready');
  } else {
    await page.touchscreen.tap(200, 420); // a tap on the backdrop doesn't fly
    await expectPhase(page, 'ready');
    await dialog.locator('button').tap();
    await expect(dialog).toBeHidden();
  }
  await press(page, isMobile);
  await expectPhase(page, 'playing');

  // Opening help mid-run pauses; closing it (by button or Escape) does not resume on its own.
  await tapOrClick(page.locator('.pause-btn'), isMobile);
  await expectPhase(page, 'paused');
  await tapOrClick(page.locator('.help-btn'), isMobile);
  await tapOrClick(dialog.locator('button'), isMobile);
  if (!isMobile) {
    await page.locator('.help-btn').click();
    await page.keyboard.press('Escape'); // an Escape that closes help is not also the pause key
    await expect(dialog).toBeHidden();
  }
  await page.waitForTimeout(TIMING_PAD);
  await expectPhase(page, 'paused');
  await expect(page.locator('.countdown')).toBeEmpty();
  expect(errors).toEqual([]);
});
const TIMING_PAD = 1800; // longer than the 1.5s resume countdown

test('clicking a HUD button never captures Space from the game', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard after a mouse click is a desktop concern');
  await page.goto('/');
  await page.locator('.sound-btn').click();
  await expect(page.locator('.sound-btn')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expectPhase(page, 'playing');
  await expect(page.locator('.sound-btn')).toHaveAttribute('aria-pressed', 'false');
});

test('a paused scene is drawn once, and a hidden page stops its frame loop', async ({ page, isMobile }) => {
  await countFrames(page);
  await page.goto('/');
  await press(page, isMobile);
  await expectPhase(page, 'playing');
  await page.keyboard.press('KeyP');
  await expectPhase(page, 'paused');
  await page.waitForTimeout(200);
  const pausedAt = await counters(page);
  await page.waitForTimeout(600);
  const pausedLater = await counters(page);
  expect(pausedLater.draws).toBe(pausedAt.draws); // no canvas redraws while nothing moves
  expect(pausedLater.rafs).toBeGreaterThan(pausedAt.rafs); // ... but the UI loop is still alive

  // A resize must redraw the paused frame (the canvas is cleared by resizing).
  await page.setViewportSize({ width: 420, height: 760 });
  await expect.poll(async () => (await counters(page)).draws).toBeGreaterThan(pausedLater.draws);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);
  const hiddenAt = await counters(page);
  await page.waitForTimeout(500);
  expect((await counters(page)).rafs).toBe(hiddenAt.rafs);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await counters(page)).rafs).toBeGreaterThan(hiddenAt.rafs);
  await expectPhase(page, 'paused'); // coming back never resumes flight by itself
});

/** Five recorded ghosts on one course, built with the source modules from the dev server. */
async function fiveGhostLink(page: Page): Promise<string> {
  await page.goto('http://localhost:4174/tools/gallery.html');
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  return page.evaluate(async () => {
    const urls = ['/src/game/Game.ts', '/src/game/autopilot.ts', '/src/social/link.ts'];
    const [{ Game }, { Autopilot }, { encodeChallenge, MAX_GHOSTS }] = await Promise.all(urls.map((u) => import(/* @vite-ignore */ u)));
    const game = new Game(4242, 'garden'), bot = new Autopilot();
    game.flap();
    for (let i = 0; i < 120 * 60 && game.phase === 'playing'; i++) {
      if (game.score < 2) bot.update(game);
      game.step(1 / 120);
    }
    const ghosts = Array.from({ length: MAX_GHOSTS }, (_, i) => ({ pid: i + 1, name: `Long ghost name ${i + 1}`, score: game.score, record: game.record }));
    return encodeChallenge({ map: 'garden', seed: game.seed, ghosts }) as string;
  });
}

for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
  test(`a full challenge result keeps its actions on screen (${width}×${height})`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'viewport sweep runs once');
    const link = await fiveGhostLink(page);
    await page.setViewportSize({ width, height });
    await page.goto(`/?c=${link}&bot=1`);
    await expectPhase(page, 'gameover', 30_000);
    await expect(page.locator('.standings-list li')).toHaveCount(6);
    await expect(page.locator('.retry-btn')).toBeEnabled();
    const frame = (await page.locator('#frame').boundingBox())!;
    for (const sel of ['.card', '.retry-btn', '.home-btn']) {
      const box = (await page.locator(sel).boundingBox())!;
      expect(box.y, sel).toBeGreaterThanOrEqual(frame.y - 0.5);
      expect(box.y + box.height, sel).toBeLessThanOrEqual(frame.y + frame.height + 0.5);
    }
    const row = (await page.locator('.share-row').boundingBox())!;
    expect(row.y + row.height).toBeLessThan(frame.y + frame.height / 2);
    const retry = (await page.locator('.retry-btn').boundingBox())!;
    expect(retry.height).toBeGreaterThanOrEqual(44);
  });
}
