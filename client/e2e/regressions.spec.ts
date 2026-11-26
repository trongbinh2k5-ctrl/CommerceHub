import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, role = 'customer') {
  await page.getByLabel('Email', { exact: true }).fill(`${role}@demo.local`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('DemoCommerce!2026');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

test('catalog search follows header searches and browser history', async ({ page }) => {
  await page.goto('/products?search=Tai');
  await expect(page.getByLabel('Tìm thiết bị', { exact: true })).toHaveValue('Tai');
  await page.getByRole('textbox', { name: 'Tìm kiếm sản phẩm', exact: true }).fill('Chuột');
  await page.getByRole('textbox', { name: 'Tìm kiếm sản phẩm', exact: true }).press('Enter');
  await expect(page.getByLabel('Tìm thiết bị', { exact: true })).toHaveValue('Chuột');
  await expect(page.locator('.product-card')).toHaveCount(2);
  await page.goBack();
  await expect(page.getByLabel('Tìm thiết bị', { exact: true })).toHaveValue('Tai');
  await expect(page.getByRole('textbox', { name: 'Tìm kiếm sản phẩm', exact: true })).toHaveValue('Tai');
  await page.getByRole('button', { name: 'Xóa bộ lọc ×', exact: true }).click();
  const prices = () => page.locator('.product-card .price').allTextContents().then(values => values.map(value => Number(value.replace(/\D/g, ''))));
  await page.getByRole('combobox', { name: 'Sắp xếp sản phẩm', exact: true }).selectOption('price_asc');
  await expect.poll(async () => { const values = await prices(); return values.length > 1 && values.every((value, index) => index === 0 || value >= values[index - 1]); }).toBe(true);
  await page.getByRole('combobox', { name: 'Sắp xếp sản phẩm', exact: true }).selectOption('price_desc');
  await expect.poll(async () => { const values = await prices(); return values.length > 1 && values.every((value, index) => index === 0 || value <= values[index - 1]); }).toBe(true);
});

test('late search suggestions cannot overwrite a newer query', async ({page}) => {
  let releaseOld!:()=>void;
  const oldGate=new Promise<void>(resolve=>{releaseOld=resolve;});
  await page.route('**/api/products?*',async route=>{
    const q=new URL(route.request().url()).searchParams.get('search');
    if(q==='old')await oldGate;
    await route.fulfill({json:{data:[{_id:'507f1f77bcf86cd799439011',name:q==='old'?'Old suggestion':'New suggestion',price:10000,stock:1}],pagination:{page:1,total:1,totalPages:1}}});
  });
  await page.goto('/');
  const search=page.getByRole('textbox',{name:'Tìm kiếm sản phẩm',exact:true});
  const oldRequest=page.waitForRequest(r=>new URL(r.url()).searchParams.get('search')==='old');
  await search.fill('old');await oldRequest;
  await search.fill('new');await expect(page.locator('.search-dropdown-menu')).toContainText('New suggestion');
  const oldResponse=page.waitForResponse(r=>new URL(r.url()).searchParams.get('search')==='old');
  releaseOld();await (await oldResponse).finished();
  // Let fetch and React process the late response before inspecting the current control.
  await page.waitForTimeout(150);
  await expect(page.locator('.search-dropdown-menu')).toContainText('New suggestion');
});

test('broken product images show a visible fallback', async ({ page }) => {
  await page.route('**/api/products?*', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({
      data: [{ _id: '507f1f77bcf86cd799439011', name: 'QA broken image', sku: 'QA-IMAGE', price: 10000, stock: 1, isActive: true, imageUrl: '/images/qa-missing.png' }],
      pagination: { page: 1, total: 1, totalPages: 1 },
    }),
  }));
  await page.route('**/images/qa-missing.png', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/products');
  await expect(page.locator('.product-card .image-placeholder')).toBeVisible();
  await expect(page.getByRole('link', { name: 'QA broken image', exact: true })).toBeVisible();
});

test('admin can clear optional product fields without retaining old values', async ({ page }) => {
  await page.goto('/admin/products');
  await login(page, 'admin');
  await expect(page.getByRole('heading', { name: 'Thiết bị.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
  await page.getByLabel('Tên thiết bị', { exact: true }).fill('QA clear optional fields');
  await page.getByLabel('Mã SKU', { exact: true }).fill(`QA-CLEAR-${Date.now()}`);
  await page.getByLabel('Giá bán (VND)', { exact: true }).fill('10000');
  await page.getByRole('dialog').getByLabel('Danh mục', { exact: false }).selectOption({ label: 'Âm thanh' });
  await page.getByLabel('URL ảnh', { exact: false }).fill('/images/mouse.jpg');
  await page.getByLabel('Mô tả', { exact: false }).fill('Existing description to clear');
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const row = page.locator('tbody tr').filter({ hasText: 'QA clear optional fields' });
  await row.getByRole('button', { name: 'Sửa', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Danh mục', { exact: false }).selectOption('');
  await page.getByLabel('URL ảnh', { exact: false }).fill('');
  await page.getByLabel('Mô tả', { exact: false }).fill('');
  const saved = page.waitForResponse(response => response.url().includes('/api/products/') && response.request().method() === 'PATCH');
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await row.getByRole('button', { name: 'Sửa', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Danh mục', { exact: false })).toHaveValue('');
  await expect(page.getByLabel('URL ảnh', { exact: false })).toHaveValue('');
  await expect(page.getByLabel('Mô tả', { exact: false })).toHaveValue('');
});

test('customer cancellation refreshes the payment and invalid account tabs recover', async ({ page }) => {
  await page.goto('/account?tab=invalid');
  await login(page);
  await expect(page.getByRole('heading', { name: 'Đơn hàng của tôi', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Tất cả thiết bị', exact: true }).first().click();
  await page.getByRole('link', { name: 'Chuột Everyday Wireless', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã thêm thiết bị');
  await page.getByRole('link', { name: /Giỏ hàng, 1 sản phẩm/ }).click();
  await page.getByRole('link', { name: 'Tiến hành đặt hàng', exact: true }).click();
  if (await page.getByRole('radio').count() === 0) {
    await page.getByRole('button', { name: 'Thêm địa chỉ', exact: true }).click();
    await page.getByLabel('Người nhận', { exact: true }).fill('QA Người nhận');
    await page.getByLabel('Số điện thoại', { exact: true }).fill('0901234567');
    await page.getByLabel('Tỉnh / Thành phố', { exact: true }).fill('TP Hồ Chí Minh');
    await page.getByLabel('Phường / Xã', { exact: true }).fill('Bến Thành');
    await page.getByLabel('Số nhà, đường, địa chỉ chi tiết', { exact: true }).fill('123 Đường QA');
    await page.getByRole('button', { name: 'Lưu địa chỉ', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Xác nhận đặt hàng', exact: true }).click();
  await expect(page).toHaveURL(/orders\/[a-f0-9]+$/);
  await expect(page.locator('.page-heading .badge')).toHaveText('Chờ xác nhận');
  await expect(page.locator('.summary .badge')).toHaveText('Chưa thanh toán');
  await page.getByRole('button', { name: 'Hủy đơn hàng', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận hủy', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.page-heading .badge')).toHaveText('Đã hủy');
  await expect(page.locator('.summary .badge')).toHaveText('Đã hủy');
  await expect(page.getByRole('button', { name: 'Hủy đơn hàng', exact: true })).toHaveCount(0);
});

test('a cart whose stock decreased can recover by reducing quantity', async ({ page }) => {
  let quantity = 5;
  await page.route('**/api/cart', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ data: {
      items: [{ productId: '507f1f77bcf86cd799439011', name: 'QA stock change', price: 10000, quantity, subtotal: quantity <= 2 ? quantity * 10000 : null, stock: 2, available: quantity <= 2, unavailableReason: quantity <= 2 ? null : 'INSUFFICIENT_STOCK' }],
      totalQuantity: quantity <= 2 ? quantity : 0, totalAmount: quantity <= 2 ? quantity * 10000 : 0, unavailableCount: quantity <= 2 ? 0 : 1,
    } }),
  }));
  await page.route('**/api/cart/items/*', async route => {
    expect(route.request().method()).toBe('PATCH');
    quantity = route.request().postDataJSON().quantity;
    expect(quantity).toBe(2);
    await route.fulfill({ contentType: 'application/json', body: '{"success":true}' });
  });
  await page.goto('/cart');
  await login(page);
  await expect(page.getByText('Chỉ còn 2 sản phẩm — giảm số lượng hoặc xóa khỏi giỏ', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tiến hành đặt hàng', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Giảm số lượng QA stock change', exact: true }).click();
  await expect(page.locator('.quantity span')).toHaveText('2');
  await expect(page.getByRole('link', { name: 'Tiến hành đặt hàng', exact: true })).toBeVisible();
});
