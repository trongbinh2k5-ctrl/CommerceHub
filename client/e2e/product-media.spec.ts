import { test, expect } from '@playwright/test';

test('missing hardware photos are labelled illustrations while product URLs keep priority', async ({ page }) => {
  const products = [
    { _id: '507f1f77bcf86cd799439021', name: 'QA Laptop without photo', sku: 'QA-LAPTOP', price: 12000000, stock: 2, imageUrl: '', isActive: true },
    { _id: '507f1f77bcf86cd799439022', name: 'QA Intel processor', sku: 'CPU-QA', price: 7000000, stock: 0, imageUrl: '', isActive: true },
    { _id: '507f1f77bcf86cd799439023', name: 'QA Laptop with uploaded photo', sku: 'QA-PHOTO', price: 15000000, stock: 1, imageUrl: '/images/hero-hardware-v2.png', isActive: true },
  ];
  await page.route('**/api/products?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: products, pagination: { page: 1, total: 3, totalPages: 1 } }) }));
  await page.goto('/products');
  await expect(page.locator('.product-card [data-image-kind="illustration"]')).toHaveCount(2);
  await expect(page.locator('.product-card .illustration-label')).toHaveCount(2);
  await expect(page.locator('.product-card [data-image-kind="product"] img')).toHaveAttribute('src', products[2].imageUrl);
  await expect.poll(() => page.locator('.product-card img').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.setViewportSize({ width: 320, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('admin image preview validates and clears a draft without saving it', async ({ page }) => {
  await page.goto('/admin/products');
  await page.getByLabel('Email', { exact: true }).fill('admin@demo.local');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('DemoCommerce!2026');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
  const input = page.getByLabel('URL ảnh', { exact: false });
  await expect(page.getByText('Chưa có ảnh sản phẩm', { exact: true })).toBeVisible();
  await input.fill('javascript:alert(1)');
  await expect(page.getByText('Đường dẫn ảnh chưa hợp lệ', { exact: true })).toBeVisible();
  await expect(page.locator('.admin-image-preview img')).toHaveCount(0);
  await input.fill('/images/laptop-illustration.png');
  await expect(page.getByRole('img', { name: 'Xem trước ảnh sản phẩm', exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.admin-image-preview img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Xóa đường dẫn ảnh', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(page.getByText('Chưa có ảnh sản phẩm', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
