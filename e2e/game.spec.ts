import { expect, test } from '@playwright/test';
import { expectPhase, press, trackErrors } from './helpers.ts';

test('opens straight into a playable Ready screen, with no errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expectPhase(page, 'ready');
  await expect(page.locator('h1')).toHaveText('Cat Flap');
  await expect(page.locator('.tagline')).toBeVisible();
  await expect(page.locator('.start-hint')).toBeVisible();
  // First-time player: no "Best 0" clutter.
  await expect(page.locator('.ready-best')).toBeHidden();
  // The canvas is actually drawing the scene (not blank).
  const colours = await page.evaluate(() => {
    const c = document.getElementById('stage') as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 997) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return seen.size;
  });
  expect(colours).toBeGreaterThan(20);
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('full loop: start → fall → Game Over → retry → play again, without reloading', async ({ page, isMobile }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 42));

  await press(page, isMobile);
  await expectPhase(page, 'playing');
  await expect(page.locator('.score')).toHaveText('0');
  await expect(page.locator('.pause-btn')).toBeVisible();

  // No input: the cat falls to the wall.
  await expectPhase(page, 'gameover');
  await expect(page.locator('.over-screen')).toBeVisible();
  await expect(page.locator('.final-score')).toHaveText('0');
  await expect(page.locator('.final-best')).toHaveText('0');
  await expect(page.locator('.quip')).not.toBeEmpty();
  // The retry prompt appears once the short lockout is over.
  await expect(page.locator('#app')).toHaveClass(/can-retry/);

  await press(page, isMobile);
  await expectPhase(page, 'ready');
  await press(page, isMobile);
  await expectPhase(page, 'playing');
  await expect(page.locator('.score')).toHaveText('0');

  // Same page, no reload.
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(42);
  expect(errors).toEqual([]);
});

test('scores, and the best score survives a reload', async ({ page }) => {
  await page.goto('/?bot=3');
  await expectPhase(page, 'gameover', 40_000);
  await expect(page.locator('.final-score')).toHaveText('3');
  await expect(page.locator('.final-best')).toHaveText('3');
  await expect(page.locator('.new-best')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('catflap.best'))).toBe('3');

  await page.goto('/');
  await expectPhase(page, 'ready');
  await expect(page.locator('.ready-best')).toBeVisible();
  await expect(page.locator('.ready-best .value')).toHaveText('3');
});

test('a worse run keeps the best and shows no "new best" badge', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('catflap.best', '50'));
  await page.goto('/?bot=1');
  await expectPhase(page, 'gameover', 30_000);
  await expect(page.locator('.final-score')).toHaveText('1');
  await expect(page.locator('.final-best')).toHaveText('50');
  await expect(page.locator('.new-best')).toBeHidden();
});

test('sound button toggles and persists, and pressing it never flaps', async ({ page, isMobile }) => {
  await page.goto('/');
  const btn = page.locator('.sound-btn');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  if (isMobile) {
    const box = (await btn.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  } else {
    await btn.click();
  }
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expectPhase(page, 'ready'); // did not start a run
  await page.reload();
  await expect(page.locator('.sound-btn')).toHaveAttribute('aria-pressed', 'false');
});

test('pauses when the page is hidden, resumes after a 3‑2‑1 countdown', async ({ page, isMobile }) => {
  await page.goto('/');
  await press(page, isMobile);
  await expectPhase(page, 'playing');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expectPhase(page, 'paused');
  await expect(page.locator('.paused-screen h2')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });
  await press(page, isMobile);
  await expect(page.locator('.countdown')).toHaveText(/[123]/);
  await expectPhase(page, 'playing', 5_000);
});

test('keyboard: P pauses, M mutes, Space resumes', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard shortcuts are a desktop feature');
  await page.goto('/');
  await page.keyboard.press('Space');
  await page.keyboard.press('KeyP');
  await expectPhase(page, 'paused');
  await page.keyboard.press('KeyM');
  await expect(page.locator('.sound-btn')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expectPhase(page, 'playing', 5_000);
});

test('passing the previous best mid-run is celebrated once', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('catflap.best', '2'));
  await page.goto('/?bot=5');
  const celebrating = () => (document.querySelector('.beat-best') as HTMLElement).getAnimations().length > 0;
  await page.waitForFunction(() => document.querySelector('.score')?.textContent === '2', null, { timeout: 30_000 });
  expect(await page.evaluate(celebrating)).toBe(false);
  await page.waitForFunction(celebrating, null, { timeout: 10_000 });
  await expect(page.locator('.score')).toHaveText('3');
  await expectPhase(page, 'gameover', 30_000);
  await expect(page.locator('.final-best')).toHaveText('5');
});
