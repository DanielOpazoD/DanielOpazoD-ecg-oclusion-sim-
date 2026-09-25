import { test, expect } from '@playwright/test';

test('Vista popover: opens, changes Formato, closes with Esc', async ({ page }) => {
  await page.goto('/');
  const btn = page.locator('#btn-vista');
  await expect(btn).toContainText('Vista:');
  await btn.click();
  const pop = page.locator('#vista-pop');
  await expect(pop).toBeVisible();
  await pop.locator('#v-layout').selectOption('6x2');
  await expect(btn).toContainText('6×2');
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('aria-label', /6x2/);
  await pop.press('Escape');
  await expect(pop).toBeHidden();
  await expect(btn).toHaveAttribute('aria-expanded', 'false');
});

test('Lectura: only positive findings by default, criteria list expands', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Lectura' }).click();
  // Verdict card.
  const verd = page.locator('.verd');
  await expect(verd).toBeVisible();
  await expect(verd.locator('h2')).toContainText(/OMI probable|Sin criterios de oclusión/);
  // Positive rows only in the default list; negative rows hidden until expanded.
  const find = page.locator('.find');
  expect(await find.locator(':scope > button.f').count()).toBeGreaterThan(0);
  await expect(find.locator('#find-all-list')).toBeHidden();
  const more = find.locator('#find-all');
  await expect(more).toContainText(/criterios evaluados/);
  await more.click();
  await expect(find.locator('#find-all-list')).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
});
