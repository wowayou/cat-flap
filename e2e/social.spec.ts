import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectPhase, trackErrors } from './helpers.ts';

/** Swap the Web Share sheet for a recorder, so a test can read what would have been shared. */
async function recordShares(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { __shared: ShareData }).__shared = data;
      },
    });
  });
}

const lastShare = (page: Page) => page.evaluate(() => (window as unknown as { __shared?: ShareData }).__shared ?? null);

async function press(locator: Locator, isMobile: boolean): Promise<void> {
  if (isMobile) await locator.tap();
  else await locator.click();
}

test('share a run → a friend flies with its ghost, passes it, and relays the course', async ({ page, isMobile }) => {
  const errors = trackErrors(page);
  await recordShares(page);

  // Player A flies 3 points and shares, under a name.
  await page.goto('/?bot=3');
  await expectPhase(page, 'gameover', 40_000);
  const name = page.locator('.name-input');
  await name.fill('Mimi');
  await name.blur();
  await press(page.locator('.share-btn'), isMobile);
  await expect.poll(() => lastShare(page)).not.toBeNull();
  const fromA = (await lastShare(page))!;
  expect(fromA.url).toMatch(/\?c=[A-Za-z0-9_-]+$/);
  expect(fromA.text).toContain('3');
  await expectPhase(page, 'gameover'); // the share button is not a retry tap
  expect(await page.evaluate(() => localStorage.getItem('catflap.name'))).toBe('Mimi');

  // Player B: another device (fresh storage) opens the link and sees who to beat.
  await page.evaluate(() => localStorage.clear());
  await page.goto(fromA.url!);
  await expectPhase(page, 'ready');
  await expect(page.locator('.challenge')).toBeVisible();
  await expect(page.locator('.challenge-list li')).toHaveCount(1);
  await expect(page.locator('.challenge-list li')).toContainText('Mimi');
  await expect(page.locator('.challenge-list li')).toContainText('3');

  // B flies 6 points on the same course and is told when Mimi's ghost is passed.
  await page.goto(`${fromA.url}&bot=6`);
  const overtaking = () => (document.querySelector('.overtake') as HTMLElement).getAnimations().length > 0;
  await page.waitForFunction(overtaking, null, { timeout: 40_000 });
  await expect(page.locator('.overtake')).toContainText('Mimi');
  await expect(page.locator('.score')).toHaveText('4');

  await expectPhase(page, 'gameover', 40_000);
  const rows = page.locator('.standings-list li');
  await expect(page.locator('.standings')).toBeVisible();
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveClass(/me/);
  await expect(rows.first()).toContainText('6');
  await expect(rows.nth(1)).toContainText('Mimi');

  // B passes it on: the new link carries both runs.
  await page.locator('.name-input').fill('Bo');
  await press(page.locator('.share-btn'), isMobile);
  await expect.poll(() => lastShare(page)).not.toBeNull();
  const fromB = (await lastShare(page))!;
  await page.goto(fromB.url!);
  await expect(page.locator('.challenge-list li')).toHaveCount(2);
  await expect(page.locator('.challenge-list li').first()).toContainText('Bo');
  expect(errors).toEqual([]);
});

test('the share row stays above the middle of the screen, away from retry taps', async ({ page }) => {
  await page.goto('/?bot=1');
  await expectPhase(page, 'gameover', 30_000);
  await expect(page.locator('.share-row')).toBeVisible();
  const frame = (await page.locator('#frame').boundingBox())!;
  const row = (await page.locator('.share-row').boundingBox())!;
  expect(row.y + row.height).toBeLessThan(frame.y + frame.height / 2);
});

test('typing a name never flaps or retries', async ({ page }) => {
  await page.goto('/?bot=1');
  await expectPhase(page, 'gameover', 30_000);
  await expect(page.locator('#app')).toHaveClass(/can-retry/);
  const name = page.locator('.name-input');
  await name.click();
  await page.keyboard.type('a b');
  await page.keyboard.press('Enter');
  await expect(name).toHaveValue('a b');
  await expectPhase(page, 'gameover');
  await expect(name).not.toBeFocused();
});

test('leaving a challenge returns to free flight', async ({ page, isMobile }) => {
  await recordShares(page);
  await page.goto('/?bot=1');
  await expectPhase(page, 'gameover', 30_000);
  await press(page.locator('.share-btn'), isMobile);
  await expect.poll(() => lastShare(page)).not.toBeNull();
  const { url } = (await lastShare(page))!;

  await page.goto(url!);
  await expect(page.locator('.challenge')).toBeVisible();
  await press(page.locator('.exit-challenge'), isMobile);
  await expect(page.locator('.challenge')).toBeHidden();
  await expectPhase(page, 'ready'); // the exit button doesn't start a run
  expect(new URL(page.url()).searchParams.has('c')).toBe(false);
});

test('a broken link says so and falls back to a normal game', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?c=AAAA');
  await expectPhase(page, 'ready');
  await expect(page.locator('.toast')).toHaveClass(/show/);
  await expect(page.locator('.toast')).not.toBeEmpty();
  await expect(page.locator('.challenge')).toBeHidden();
  expect(errors).toEqual([]);
});

test('without Web Share, the link is copied to the clipboard', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'clipboard permissions are a Chromium feature in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }));
  await page.goto('/?bot=2');
  await expectPhase(page, 'gameover', 30_000);
  await page.locator('.share-btn').click();
  await expect(page.locator('.toast')).toHaveClass(/show/);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/\?c=[A-Za-z0-9_-]+/);
});

/**
 * Three runs recorded by the autopilot under Node (V8): 小明 12, 阿花 8,
 * 煤球大王 20 on course 4242. Every browser engine must replay them to the
 * same scores, or it would reject them. A retune of src/game/config.ts makes
 * this link (and every shared link) outdated by design: regenerate it then.
 */
const GOLDEN = 'AcWeAAAQkgMAAAADBuWwj-aYjgxATgAAAAAAAEBxVkwn27_6HQBRSUJJT0lWSUlOSUFJJ0JATUlJSUlOWUlXSUlEAAAAAQbpmL_oirEIQGSgAAAAAABAcPj3q5PNvxUAU0lBSVFJVUhJTkk-STI_QFBJR0kAAAAHDOeFpOeQg-Wkp-eOixRAcsAAAAAAAEBwlXtOvJDWLgBUSURJTEhZSUhNSUVJMz45TUlLSU1IWUlYSEhJRUxXSTNBUExPRTQ6SU5JMzM';

test('runs recorded in one JS engine replay identically in every other', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/?c=${GOLDEN}`);
  const rows = page.locator('.challenge-list li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('20');
  await expect(rows.nth(1)).toContainText('12');
  await expect(rows.nth(2)).toContainText('8');
  await expect(page.locator('.toast')).not.toHaveClass(/show/);
  expect(errors).toEqual([]);
});

/**
 * The current format: three gliding runs on the clouds, whose gaps bob (the
 * motion uses floor/abs and a smoothstep, not Math.sin), recorded under Node
 * (V8): 棉花糖 21, 云朵 14, Nimbus 9 on course 5151. Every engine must replay
 * them to the same scores. Regenerate it after any retune, like GOLDEN.
 */
const GOLDEN_V2 = 'ArvdAgAAFB8DAAAD6AbkupHmnLUOQE4AAAAAAABAcVZMJ9u_-iEAYk5LSUFUTE1lSSBFZT5HOkpERzIySV5IYE8gSzdATmomJRhKFYQBDTwcJS1zFDkbSgZjCD0LmAEFxgELgAEELg2UAgZaEt8BFykPPx4AAAPvBk5pbWJ1cwlAb-AAAAAAAEBw6wNnJ5z3FwBjU0tIPlJRSVpVIE1mPjxLS0hKGSpcHiUYSxzKAQ4wJysVPAs-AVkgVSCTAQY4FyURhQEYMAKLASkAAAP2CeajieiKseezlhVAfvAAAAAAAEBw6wNnJ5zuMABjUktJPFRISVpIIEdNZ0g6XEJTGSBFcklgVThdIDxwSCFCR1JNZUpOVk0aIEhBTTolGEsbggEIfR42Cj4LlAMbTAo-FSUndxlzDTgjTw6bASdmK1IGNhu-ARy_AQpDJj8TNxk1IDYSdQJGDjMkKQU';

test('gliding runs over bobbing gaps replay identically in every engine', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/?c=${GOLDEN_V2}`);
  await expect(page.locator('#app')).toHaveAttribute('data-map', 'clouds');
  const rows = page.locator('.challenge-list li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('21');
  await expect(rows.nth(1)).toContainText('14');
  await expect(rows.nth(2)).toContainText('9');
  await expect(page.locator('.toast')).not.toHaveClass(/show/);
  expect(errors).toEqual([]);
});
