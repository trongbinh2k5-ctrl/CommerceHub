import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

test('researched product without a store price shows a quote request and no free offer', async ({ page }) => {
  const plan = JSON.parse(await readFile('../server/data/researched-catalog-2026-11-07.json', 'utf8'));
  const product = { ...plan.products[0], _id: '0123456789abcdef01234567', categoryId: null };
  await page.route('**/api/products/0123456789abcdef01234567**', route => route.fulfill({ json: { data: /\/(related|options)$/.test(new URL(route.request().url()).pathname) ? [] : product } }));
  await page.goto('/products/' + product._id);
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  await expect(page.getByText('Liên hệ báo giá', { exact: true })).toBeVisible();
  await expect(page.locator('.buy-row')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hỏi về sản phẩm', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Xem thông tin từ hãng ↗' })).toHaveAttribute('href', product.specifications.find((s: { label: string }) => s.label === 'Nguồn thông tin').value);
  await expect.poll(async () => JSON.parse(await page.locator('head script[type="application/ld+json"]').textContent() || '{}').offers).toBeUndefined();
  await page.getByRole('button', { name: `Ảnh 2 của ${product.name}`, exact: true }).click();
  await expect(page.locator('.gallery-main img')).toHaveAttribute('src', product.gallery[0]);
});

test('category and brand discovery keeps scoped filters and works on mobile', async ({ page, request }) => {
  const categoryResponse = await request.get('/api/categories');
  const { data: categories } = await categoryResponse.json();
  expect(categories.length).toBeGreaterThan(0);
  const category = categories[0];
  await page.goto('/');
  await expect(page.locator('.discovery-card').first()).toBeVisible();
  await page.locator('.discovery-card').first().click();
  await expect(page).toHaveURL(new RegExp(`/collections/${encodeURIComponent(category.slug)}`));
  await expect(page.getByRole('heading', { name: category.name, exact: true })).toBeVisible();
  await page.getByLabel('Sắp xếp sản phẩm').selectOption('price_asc');
  await expect(page).toHaveURL(/sort=price_asc/);
  const results = page.waitForResponse(response => response.url().includes('/api/products?') && new URL(response.url()).searchParams.get('categoryId') === category._id);
  await page.reload();
  expect((await results).ok()).toBeTruthy();
  await expect(page.getByRole('heading', { name: category.name, exact: true })).toBeVisible();

  await page.goto('/collections/not-a-real-category');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy danh mục' })).toBeVisible();
  await page.getByRole('link', { name: 'Khám phá danh mục khác' }).click();
  await expect(page.locator('.discovery-card')).toHaveCount(categories.length);
  await page.getByRole('link', { name: 'Xem thương hiệu', exact: true }).click();
  const brandsResponse = await request.get('/api/products/facets');
  const { data: { brands } } = await brandsResponse.json();
  expect(brands.length).toBeGreaterThan(0);
  await expect(page.locator('.brand-directory>a')).toHaveCount(brands.length);
  if (brands.length) {
    await page.locator('.brand-directory>a').first().click();
    await expect(page.getByRole('heading', { name: brands[0], exact: true })).toBeVisible();
    await page.getByLabel('Khoảng giá').selectOption('20000000');
    await expect(page).toHaveURL(/maxPrice=20000000/);
    await expect(page.getByRole('heading', { name: brands[0], exact: true })).toBeVisible();
  }

  await mkdir('qa/discovery', { recursive: true });
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/collections');
    await expect(page.locator('.discovery-card').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.locator('.category-menu summary').click();
    await expect(page.locator('.category-menu')).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('.category-menu')).not.toHaveAttribute('open');
    await page.locator('.category-menu summary').click();
    await page.locator('.category-menu-panel a').nth(1).click();
    await expect(page.locator('.category-menu')).not.toHaveAttribute('open');
    await expect(page.getByRole('heading', { name: category.name, exact: true })).toBeVisible();
    await page.screenshot({ path: `qa/discovery/category-${width}.png`, fullPage: true });
    await page.goto('/collections');
    await expect(page.locator('.discovery-card').first()).toBeVisible();
    await page.screenshot({ path: `qa/discovery/collections-${width}.png`, fullPage: true });
    await page.goto('/brands');
    await expect(page.getByRole('heading', { name: 'Tìm thiết bị theo thương hiệu.' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: `qa/discovery/brands-${width}.png`, fullPage: true });
    await page.goto('/');
    await expect(page.locator('.discovery-card').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: `qa/discovery/home-${width}.png`, fullPage: true });
  }
});
