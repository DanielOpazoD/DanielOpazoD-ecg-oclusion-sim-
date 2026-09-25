import { test, expect } from '@playwright/test';

test('600×900: stacked layout, canvas >200px tall, right panel below', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto('/');
  const canvas = page.locator('#ecg-canvas');
  await expect(canvas).toBeVisible();
  const cbox = await canvas.boundingBox();
  expect(cbox!.height).toBeGreaterThan(200);
  const rbox = await page.locator('.right-panel').boundingBox();
  // Right panel stacks below the whole center column.
  expect(rbox!.y).toBeGreaterThan(cbox!.y + cbox!.height - 1);
});

test('1400×900: sidebar left of the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  const sbox = await page.locator('.sidebar').boundingBox();
  const cbox = await page.locator('#ecg-canvas').boundingBox();
  expect(sbox!.x + sbox!.width).toBeLessThanOrEqual(cbox!.x);
});
