import { test, expect } from '@playwright/test';

test('beat reader card: steps beats, lead select changes svg, calipers toggle', async ({
  page,
}) => {
  await page.goto('/');
  const card = page.locator('#beat-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Latido 1 \/ \d+/);
  // Collapsed by default; the measurements-line link opens it.
  await expect(card.locator('.br-plot svg')).toBeHidden();
  await page.locator('#meas-beat').click();
  await expect(card.locator('.br-plot svg')).toBeVisible();

  await card.getByLabel('Latido siguiente').click();
  await expect(card).toContainText(/Latido 2 \//);

  const lead = card.getByLabel('Derivación');
  await lead.selectOption('V1');
  await expect(card.locator('.br-plot svg')).toHaveAttribute('aria-label', /V1/);

  // Calipers segmented toggle flips aria-pressed.
  const cal = page.locator('.seg button', { hasText: 'Calipers' });
  await expect(cal).toHaveAttribute('aria-pressed', 'false');
  await cal.click();
  await expect(cal).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Esc borra')).toBeVisible();
});

test('monitor strip only visible inside the Monitor tab', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#monitor-strip')).toBeHidden();
  await expect(page.locator('#beat-card')).toBeVisible();
  await page.getByRole('tab', { name: 'Monitor' }).click();
  await expect(page.locator('#monitor-strip')).toBeVisible();
  await expect(page.locator('#beat-card')).toBeHidden();
  await page.getByRole('tab', { name: 'Casos' }).click();
  await expect(page.locator('#monitor-strip')).toBeHidden();
});
