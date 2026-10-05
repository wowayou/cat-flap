import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPhase, press, trackErrors } from './helpers.ts';

const map = (page: Page) => page.locator('#app').getAttribute('data-map');

async function tapOrClick(locator: Locator, isMobile: boolean): Promise<void> {
  if (isMobile) await locator.tap();
  else await locator.click();
}

/** Press and hold the one button the way this device does it; returns the release. */
async function hold(page: Page, isMobile: boolean): Promise<() => Promise<void>> {
  if (!isMobile) {
    await page.keyboard.down('Space');
    return () => page.keyboard.up('Space');
  }
  // Playwright's touchscreen only taps, so drive a held finger with pointer events.
  await page.locator('#app').dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0 });
  return () => page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true }));
  });
}

test('the arrows pick a map, it is remembered, and picking never takes off', async ({ page, isMobile }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expectPhase(page, 'ready');
  expect(await map(page)).toBe('garden');
  await expect(page.locator('.map-name')).not.toBeEmpty();
  const garden = await page.locator('.map-name').textContent();

  await tapOrClick(page.locator('.map-next'), isMobile);
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'library');
  await expect(page.locator('.map-name')).not.toHaveText(garden!);
  await expect(page.locator('.map-dots i.on')).toHaveCount(1);
  await expectPhase(page, 'ready'); // the arrow is not a take-off tap
  await tapOrClick(page.locator('.map-prev'), isMobile);
  await tapOrClick(page.locator('.map-prev'), isMobile);
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'moon'); // wraps around

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'moon');
  await press(page, isMobile);
  await expectPhase(page, 'playing');
  expect(errors).toEqual([]);
});

test('keyboard: ←/→ change maps on the Ready screen only', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard shortcuts are a desktop feature');
  await page.goto('/?map=clouds');
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'clouds');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'moon');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'clouds');
  await page.keyboard.press('Space');
  await expectPhase(page, 'playing');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'clouds');
});

test('holding on glides: the cat stays up long after a plain tap would have landed', async ({ page, isMobile }) => {
  const errors = trackErrors(page);
  // A tap with no follow-up falls to the wall within about a second of sim time.
  await page.goto('/');
  await press(page, isMobile);
  await expectPhase(page, 'gameover', 10_000);

  // Holding on from take-off opens the cape past the top of the flap. Real time only
  // ever runs ahead of sim time, so after 1.5s of it the glider is certainly still up.
  await page.goto('/');
  await expectPhase(page, 'ready');
  const release = await hold(page, isMobile);
  await page.waitForTimeout(1500);
  await expectPhase(page, 'playing', 100);
  await release();
  await expectPhase(page, 'gameover', 10_000);
  expect(errors).toEqual([]);
});

test('fish snacks are counted in the run and on the result card', async ({ page }) => {
  await page.goto('/?map=library&bot=4');
  await expectPhase(page, 'playing', 15_000);
  await expect(page.locator('.fish-count')).toBeVisible();
  await expectPhase(page, 'gameover', 40_000);
  await expect(page.locator('.final-score')).toHaveText('4');
  await expect(page.locator('.final-map')).not.toBeEmpty();
  await expect(page.locator('.final-fish')).toHaveText(/^\d+$/);
  await expect(page.locator('.final-fish')).toHaveText((await page.locator('.fish-count b').textContent())!);
  // The library has its own best; the garden's is untouched.
  expect(await page.evaluate(() => [localStorage.getItem('catflap.best.library'), localStorage.getItem('catflap.best')])).toEqual(['4', null]);
});

test('a challenge flies its own map, and leaving it returns to the map you picked', async ({ page, isMobile }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { __shared: ShareData }).__shared = data;
      },
    });
  });
  await page.goto('/?map=moon&bot=2');
  await expectPhase(page, 'gameover', 40_000);
  await tapOrClick(page.locator('.share-btn'), isMobile);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared?: ShareData }).__shared?.url ?? null)).not.toBeNull();
  const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData }).__shared);

  // A friend whose own pick is the library opens it: the challenge is on the moon.
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('catflap.map', 'library');
  });
  await page.goto(shared.url!);
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'moon');
  await expect(page.locator('.challenge')).toBeVisible();
  await expect(page.locator('.map-picker')).toBeHidden();
  await expect(page.locator('.challenge-heading')).toContainText('·');
  await tapOrClick(page.locator('.exit-challenge'), isMobile);
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'library');
  await expect(page.locator('.map-picker')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a gamepad flaps, holds and pauses', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'one engine is enough for a mocked Gamepad API');
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = { index: 0, id: 'test pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
    (window as unknown as { __press: (b: number, on: boolean) => void }).__press = (b, on) => {
      buttons[b].pressed = on;
      buttons[b].value = on ? 1 : 0;
    };
    navigator.getGamepads = () => [pad as unknown as Gamepad];
  });
  const pad = (b: number, on: boolean) => page.evaluate(([b, on]) => (window as unknown as { __press: (b: number, on: boolean) => void }).__press(b, on), [b, on] as const);
  await page.goto('/');
  await expectPhase(page, 'ready');
  await pad(15, true); // d-pad right: next map
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'library');
  await pad(15, false);
  await pad(0, true); // A: take off, and keep holding
  await expectPhase(page, 'playing');
  await page.waitForTimeout(1200);
  await expectPhase(page, 'playing', 100); // still gliding
  await pad(0, false);
  await pad(9, true); // Start: pause
  await expectPhase(page, 'paused');
});
