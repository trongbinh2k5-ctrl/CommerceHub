import { test, expect } from '@playwright/test';

test('motion leaves text sharp at rest and stops when reduced motion is enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.product-card').first()).toBeVisible();
  await expect(page.locator('.hero-copy')).toHaveCSS('font-family', /Be Vietnam Pro/);
  await expect(page.locator('.banner-slide[data-active=true] .product-image')).toHaveCSS('animation-name', 'none');
  await page.locator('.category-menu summary').click();
  await expect(page.locator('.category-menu-panel')).toHaveCSS('animation-name', 'panel-arrive');
  await page.keyboard.press('Escape');
  await page.locator('.product-card').first().scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.product-card').first().evaluate(el => el.getAnimations().filter(a => a.playState === 'running' || a.playState === 'pending').length)).toBe(0);
  await expect(page.locator('.product-card').first()).toHaveCSS('transform', 'none');
  await expect(page.locator('.product-card h3').first()).toHaveCSS('font-weight', '600');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.banner-slide[data-active=true] .product-image')).toHaveCSS('animation-name', 'none');
  await expect.poll(() => page.locator('.page-content').evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.playState === 'running' || a.playState === 'pending').length)).toBe(0);
  await page.goto('/collections');
  await expect(page.locator('.discovery-card').first()).toBeVisible();
  await expect(page.locator('.discovery-card').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('.discovery-card').first()).toHaveCSS('transform', 'none');
  await page.locator('.category-menu summary').click();
  await expect(page.locator('.category-menu-panel')).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Xem thương hiệu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tìm thiết bị theo thương hiệu.' })).toBeVisible();
  await expect(page.locator('.page-content')).toHaveCSS('opacity', '1');
});
