import { expect, test } from '@playwright/test';

/** The world frame must keep its 9:16 shape, fit the screen, and keep its controls usable, at any size. */
const SIZES: [string, number, number][] = [
  ['small phone', 320, 568],
  ['tall phone', 390, 844],
  ['tablet', 768, 1024],
  ['laptop', 1280, 800],
  ['wide desktop', 1920, 1080],
  ['phone landscape', 844, 390],
];

for (const [name, width, height] of SIZES) {
  test(`layout holds on ${name} (${width}×${height})`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chromium', 'viewport sweep runs once');
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const frame = (await page.locator('#frame').boundingBox())!;
    expect(frame.width / frame.height).toBeCloseTo(360 / 640, 2);
    expect(frame.x).toBeGreaterThanOrEqual(-0.5);
    expect(frame.y).toBeGreaterThanOrEqual(-0.5);
    expect(frame.x + frame.width).toBeLessThanOrEqual(width + 0.5);
    expect(frame.y + frame.height).toBeLessThanOrEqual(height + 0.5);
    // Fills the limiting dimension.
    expect(Math.max(frame.width / width, frame.height / height)).toBeGreaterThan(0.99);

    const sound = (await page.locator('.sound-btn').boundingBox())!;
    expect(sound.width).toBeGreaterThanOrEqual(40);
    expect(sound.x).toBeGreaterThanOrEqual(frame.x);
    expect(sound.x + sound.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);

    // Nothing scrolls.
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(0);
    expect(overflow.y).toBeLessThanOrEqual(0);

    // The title card fits inside the frame.
    const door = (await page.locator('.door').boundingBox())!;
    expect(door.x).toBeGreaterThanOrEqual(frame.x);
    expect(door.x + door.width).toBeLessThanOrEqual(frame.x + frame.width);

    // So does the map picker, clear of the title above and the start hint below.
    const picker = (await page.locator('.map-picker').boundingBox())!;
    const hint = (await page.locator('.start-hint').boundingBox())!;
    expect(picker.x).toBeGreaterThanOrEqual(frame.x - 0.5);
    expect(picker.x + picker.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    expect(picker.y).toBeGreaterThan(door.y + door.height);
    expect(picker.y + picker.height).toBeLessThanOrEqual(hint.y + 0.5);
  });
}
