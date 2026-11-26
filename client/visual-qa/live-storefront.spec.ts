import { test, expect } from '@playwright/test';

test('read-only screenshots of the current live storefront', async ({ page, request }) => {
  const response = await request.get('/api/products?limit=100');
  expect(response.status()).toBe(200);
  const { data: products } = await response.json();
  const featured = products.find((product: { stock: number }) => product.stock > 0) || products[0];
  for (const [width, label] of [[1280, 'desktop'], [390, 'mobile']] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, name] of [['/', 'home'], ['/products', 'catalog'], ...(featured ? [[`/products/${featured._id}`, 'product']] : [])]) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('main .spinner')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => page.locator('main img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `qa/redesign/live-${name}-${label}.png`, fullPage: true });
    }
  }
});
