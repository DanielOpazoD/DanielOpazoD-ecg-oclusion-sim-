import { test, expect } from '@playwright/test';

test('case search keeps focus and filters to K0x', async ({ page }) => {
  await page.goto('/');
  const search = page.getByLabel('Buscar caso');
  await search.click();
  await search.pressSequentially('K0');
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('K0');
  const items = page.locator('.case-item');
  await expect(items).toHaveCount(6);
  for (const t of await items.allTextContents()) expect(t).toMatch(/K0/);

  await items.filter({ hasText: 'K02' }).click();
  await expect(items.filter({ hasText: 'K02' })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('aria-label', /K02/);
});

test('modo ciego shows anonymised case labels', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Modo ciego').check();
  const first = page.locator('.case-item').first();
  await expect(first).toHaveText(/Caso \d+/);
  await expect(first).not.toContainText('A01');
});
