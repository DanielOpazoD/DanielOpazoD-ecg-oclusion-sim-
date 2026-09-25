import { test, expect } from '@playwright/test';

test('quiz: pick a case, answer, feedback badge appears', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Quiz' }).click();
  await page.locator('.case-item').first().click();
  // Decision chip (OMI cases) or diagnosis chip (non-occlusion cases) — either
  // enables the submit button.
  const panel = page.locator('#panel-body, .right-panel').last();
  await panel.locator('.quiz-chip').first().click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(panel.locator('.badge').filter({ hasText: /Correcto|Incorrecto/ })).toBeVisible();
});
