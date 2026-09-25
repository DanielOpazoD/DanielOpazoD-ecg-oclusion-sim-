import { test, expect } from '@playwright/test';

test('mode tablist: ArrowRight activates Laboratorio', async ({ page }) => {
  await page.goto('/');
  const casos = page.getByRole('tab', { name: 'Casos' });
  await casos.focus();
  await page.keyboard.press('ArrowRight');
  const lab = page.getByRole('tab', { name: 'Laboratorio' });
  await expect(lab).toBeFocused();
  await expect(lab).toHaveAttribute('tabindex', '0');
  await expect(lab).toHaveAttribute('aria-selected', 'true');
});

test('? opens help with focus trap; Escape restores focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('?');
  const dialog = page.locator('.modal');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#about-close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#btn-about')).toBeFocused();
});

test('space toggles playback', async ({ page }) => {
  await page.goto('/');
  const play = page.locator('#tl-play');
  await expect(play).toHaveAttribute('aria-label', 'Reproducir');
  await page.keyboard.press(' ');
  await expect(play).toHaveAttribute('aria-label', 'Pausar');
  await page.keyboard.press(' ');
  await expect(play).toHaveAttribute('aria-label', 'Reproducir');
});

test('] moves to the next case', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('aria-label', /A01/);
  await page.keyboard.press(']');
  await expect(page.locator('#ecg-canvas')).toHaveAttribute('aria-label', /A02/);
});
