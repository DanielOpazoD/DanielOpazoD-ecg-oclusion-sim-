import { test, expect } from '@playwright/test';

test('export menu: aria-expanded, arrow nav, PNG download', async ({ page }) => {
  await page.goto('/');
  const btn = page.locator('#btn-export');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  const pop = page.locator('#export-pop');
  await expect(pop).toBeVisible();
  await page.keyboard.press('ArrowDown');
  const focused = await page.evaluate(() => document.activeElement?.id);
  expect(['btn-export-png', 'btn-export-json', 'btn-export-share', 'btn-copy-report']).toContain(
    focused,
  );
  const dl = page.waitForEvent('download');
  await page.locator('#btn-export-png').click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/ecglab-.*\.png/);
});
