import { test, expect } from '@playwright/test';

test('app loads: tabs, sized canvas with A01 label, metric cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Casos' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Laboratorio' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Monitor' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Quiz' })).toBeVisible();
  const canvas = page.locator('#ecg-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(100);
  expect(box!.height).toBeGreaterThan(100);
  await expect(canvas).toHaveAttribute('aria-label', /A01/);
  await expect(page.locator('#metric-row')).toContainText('lpm');
});
