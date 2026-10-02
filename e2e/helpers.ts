import { expect, type Page } from '@playwright/test';

export const phase = (page: Page) => page.locator('#app').getAttribute('data-phase');

export async function expectPhase(page: Page, expected: string, timeout = 15_000): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-phase', expected, { timeout });
}

/** The one-button action, done the way this device does it. */
export async function press(page: Page, isMobile: boolean): Promise<void> {
  if (isMobile) await page.touchscreen.tap(200, 420);
  else await page.keyboard.press('Space');
}

/** Collect page errors and console errors for the whole test. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}
