import { test, expect, type Page } from '@playwright/test';

async function settleFonts(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

async function assertFits(page: Page) {
  await settleFonts(page);
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    width: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll('body *')].filter(element => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return bounds.width > 0 && bounds.right > window.innerWidth + 1 && style.position !== 'fixed' && !element.closest('.table-wrap, .admin-sidebar nav, .revenue-chart, dialog');
    }).slice(0, 8).map(element => `${element.tagName}.${element.className}`),
  }));
  expect(overflow, `Horizontal overflow on ${page.url()}`).toMatchObject({ width: overflow.viewport });
  await expect(page.locator('main')).toBeVisible();
}

async function assertHeaderFits(page: Page) {
  if (await page.locator('.header-actions .cart-link').count()) await expect(page.locator('.header-actions .cart-label')).toBeVisible();
  const [brand, actions] = await page.locator('.header-main>.wordmark, .header-actions').evaluateAll(elements => elements.map(element => {
    const bounds = element.getBoundingClientRect();
    return { top: bounds.top, bottom: bounds.bottom };
  }));
  expect(actions.top, 'Header actions should remain beside the brand on phones').toBeLessThan(brand.bottom);
  for (const control of await page.locator('.header-actions .account-link, .header-actions .bag-link, .header-actions>.text-link, .header-actions .mobile-menu').all()) {
    const bounds = await control.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
}

async function signIn(page: Page, role: string) {
  await page.getByLabel('Email', { exact: true }).fill(`${role}@demo.local`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('DemoCommerce!2026');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

test('Vietnamese font is bundled and renders without third-party font access', async ({ page }) => {
  const externalFontRequests: string[] = [];
  const fontErrors: string[] = [];
  page.on('request', request => { if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) externalFontRequests.push(request.url()); });
  page.on('response', response => { if (/\.woff2?(\?|$)/.test(response.url()) && !response.ok()) fontErrors.push(response.url()); });
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, route => route.abort());
  await page.goto('/');
  const loaded = await page.evaluate(async () => {
    const sample = 'Tiếng Việt: Đặng, Nguyễn, Ắ Ằ Ẳ Ẵ Ặ Ế Ề Ể Ễ Ệ Ớ Ờ Ở Ỡ Ợ Ứ Ừ Ử Ữ Ự ₀ ₁ ₫';
    return Promise.all([400, 500, 600, 700].map(async weight => {
      const faces = await document.fonts.load(`${weight} 16px "Be Vietnam Pro"`, sample);
      return { weight, count: faces.length, loaded: faces.every(face => face.status === 'loaded') };
    }));
  });
  expect(loaded.every(result => result.count > 0 && result.loaded), JSON.stringify(loaded)).toBe(true);
  expect(externalFontRequests).toEqual([]);
  expect(fontErrors).toEqual([]);
  await expect(page.locator('.hero-copy')).toHaveCSS('font-family', /Be Vietnam Pro/);
  const inspector = await page.context().newCDPSession(page);
  await inspector.send('DOM.enable');
  await inspector.send('CSS.enable');
  const { root } = await inspector.send('DOM.getDocument');
  const { nodeId } = await inspector.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.hero-copy h1' });
  const { fonts } = await inspector.send('CSS.getPlatformFontsForNode', { nodeId });
  expect(fonts.some(font => font.isCustomFont && /BeVietnamPro|Be Vietnam Pro/i.test(font.familyName) && font.glyphCount > 0), JSON.stringify(fonts)).toBe(true);
  await inspector.detach();
  await page.screenshot({ path: 'qa/visual/home-1280.png', fullPage: true });
});

test('public pages remain readable and fit phone, tablet and desktop widths', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1101, 1180, 1280, 1440, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, name] of [['/', 'home'], ['/products', 'catalog'], ['/login', 'login'], ['/register', 'register'], ['/story', 'story']]) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('main .spinner')).toHaveCount(0);
      await assertFits(page);
      const tinyText = await page.locator('main p, main label, main .button, main .price, .navigation a').evaluateAll(elements => elements.filter(element => {
        const style = getComputedStyle(element);
        return element.getBoundingClientRect().height > 0 && Number.parseFloat(style.fontSize) < 13;
      }).map(element => ({ text: element.textContent?.slice(0, 80), size: getComputedStyle(element).fontSize })));
      expect(tinyText, `Unreadable text on ${path} at ${width}px`).toEqual([]);
      if (width === 390 || width === 1280) await page.screenshot({ path: `qa/visual/${name}-${width}.png`, fullPage: true });
      if (name === 'catalog') {
        await page.getByRole('link', { name: 'Tai nghe Studio 01', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Tai nghe Studio 01', exact: true })).toBeVisible();
        await expect(page.locator('main .spinner')).toHaveCount(0);
        await assertFits(page);
        if (width === 390 || width === 1280) await page.screenshot({ path: `qa/visual/product-${width}.png`, fullPage: true });
      }
    }
  }
  expect(errors).toEqual([]);
});

test('phone search, account icon and menu remain usable with keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/');
  const skip=page.getByRole('link',{name:'Đến nội dung chính',exact:true});
  await expect(skip).toHaveCSS('opacity','0');await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();await expect(skip).toHaveCSS('opacity','1');
  await page.keyboard.press('Enter');await expect(page.locator('main')).toBeFocused();await expect(skip).toHaveCSS('opacity','0');
  await assertHeaderFits(page);
  await expect(page.getByRole('link', { name: 'Đăng nhập tài khoản', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Tìm kiếm sản phẩm', exact: true }).fill('Tai nghe');
  await page.getByRole('textbox', { name: 'Tìm kiếm sản phẩm', exact: true }).press('Enter');
  await expect(page.locator('.product-card')).toHaveCount(2);
  const filterToggle = page.getByRole('button', { name: /^Bộ lọc/ });
  await expect(page.locator('#catalog-filters')).toBeHidden();
  await filterToggle.click();
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByPlaceholder('Tên sản phẩm…', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Khoảng giá', exact: true })).toContainText('Đến 20.000.000 ₫');
  await page.getByRole('combobox', { name: 'Khoảng giá', exact: true }).selectOption('20000000');
  await expect(page).toHaveURL(/maxPrice=20000000/);
  await assertFits(page);
  await filterToggle.click();
  await expect(page.locator('#catalog-filters')).toBeHidden();
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await expect(page).not.toHaveURL(/search=|maxPrice=/);
  await expect(page.getByRole('textbox', { name: 'Tìm kiếm sản phẩm', exact: true })).toHaveValue('');
  const menu = page.getByRole('button', { name: 'Mở menu', exact: true });
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('dialog', { name: 'Menu', exact: true })).toBeVisible();
  await expect(page.locator('#customer-menu a[href="/account?tab=orders"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await assertFits(page);
});

test('customer cart, checkout and address dialog fit narrow screens', async ({ page }) => {
  const longName = 'Bộ thiết bị tiếng Việt với tên dài để kiểm tra xuống dòng trên màn hình điện thoại';
  const address = { _id: '507f1f77bcf86cd799439012', fullName: 'QA Người nhận tiếng Việt', phone: '0901234567', province: 'Thành phố Hồ Chí Minh', ward: 'Phường Bến Thành', detail: '123 Đường có tên dài để kiểm tra địa chỉ xuống dòng đúng trên điện thoại', isDefault: true };
  const order = { _id: '507f1f77bcf86cd799439013', status: 'PENDING', createdAt: '2026-11-03T00:00:00Z', totalAmount: 2469134, discountAmount: 0, paymentMethod: 'COD', shippingAddress: address, items: [{ productId: '507f1f77bcf86cd799439011', name: longName, sku: 'QA-VISUAL', price: 1234567, quantity: 2, subtotal: 2469134 }] };
  await page.route('**/api/addresses', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [address] }) }));
  await page.route(/\/api\/orders(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [order], pagination:{page:1,total:1,totalPages:1} }) }));
  await page.route('**/api/orders/quote', route => route.fulfill({contentType:'application/json',body:JSON.stringify({data:{subtotal:order.totalAmount,discountAmount:0,shippingFee:0,totalAmount:order.totalAmount,couponCode:'',shippingNote:'QA layout fixture'}})}));
  await page.route(`**/api/orders/${order._id}`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: order }) }));
  await page.route(`**/api/payments/orders/${order._id}`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { _id: 'p1', orderId: order._id, amount: order.totalAmount, status: 'PENDING' } }) }));
  await page.route(`**/api/shipping/me/orders/${order._id}`, route => route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"No shipment yet"}' }));
  await page.route('**/api/reviews/me?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { items: [{ _id: '507f1f77bcf86cd799439014', productId: order.items[0].productId, title: 'Cảm nhận về thiết bị sau khi sử dụng', comment: longName, rating: 5, status: 'VISIBLE', __v: 1 }], pagination: { page: 1, total: 1, totalPages: 1 } } }) }));
  await page.route('**/api/cart', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: {
    items: [{ productId: '507f1f77bcf86cd799439011', name: longName, price: 1234567, quantity: 2, subtotal: 2469134, stock: 5, available: true, unavailableReason: null }],
    totalQuantity: 2, totalAmount: 2469134, unavailableCount: 0,
  } }) }));
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/cart');
  await signIn(page, 'customer');
  await expect(page.getByRole('heading', { name: 'Giỏ hàng.', exact: true })).toBeVisible();
  await assertFits(page);
  await assertHeaderFits(page);
  await page.setViewportSize({ width: 1101, height: 900 });
  await assertFits(page);
  await assertHeaderFits(page);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.screenshot({ path: 'qa/visual/cart-320.png', fullPage: true });
  await page.getByRole('link', { name: 'Tiến hành đặt hàng', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Xác nhận đơn hàng', exact: true })).toBeVisible();
  await assertFits(page);
  await page.screenshot({ path: 'qa/visual/checkout-320.png', fullPage: true });
  const opener = page.getByRole('button', { name: 'Thêm địa chỉ', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Thêm địa chỉ', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  const inputSizes = await dialog.locator('input').evaluateAll(elements => elements.map(element => Number.parseFloat(getComputedStyle(element).fontSize)));
  expect(inputSizes.every(size => size >= 16)).toBe(true);
  await page.screenshot({ path: 'qa/visual/address-dialog-320.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await page.locator('.account-link').click();
  await page.getByRole('button', { name: 'Đơn hàng của tôi', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đơn hàng của tôi', exact: true })).toBeVisible();
  await expect(page.locator('main .spinner')).toHaveCount(0);
  await assertFits(page);
  await page.screenshot({ path: 'qa/visual/account-320.png', fullPage: true });
  await page.getByRole('link', { name: 'Chi tiết đơn hàng', exact: true }).click();
  await expect(page.locator('main .spinner')).toHaveCount(0);
  await assertFits(page);
  await page.screenshot({ path: 'qa/visual/order-320.png', fullPage: true });
  await page.locator('.account-link').click();
  await page.getByRole('button', { name: 'Sổ địa chỉ', exact: true }).click();
  await expect(page.locator('.address-card')).toHaveCount(1);
  await assertFits(page);
  await page.screenshot({ path: 'qa/visual/addresses-320.png', fullPage: true });
  await page.getByRole('button', { name: 'Đánh giá của tôi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sửa đánh giá', exact: true })).toBeVisible();
  await assertFits(page);
  await page.getByRole('button', { name: 'Sửa đánh giá', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sửa đánh giá', exact: true })).toBeVisible();
  await page.screenshot({ path: 'qa/visual/review-dialog-320.png' });
});

test('all admin sections fit mobile and desktop, with readable forms and tables', async ({ page }) => {
  test.setTimeout(90000);
  // A single revenue day exposed an oversized column; keep that visual case stable.
  await page.route('**/api/admin/dashboard/revenue*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { data: [{ period: '2026-11-03', revenue: 2490000, paymentCount: 1 }] } }) }));
  await page.route('**/api/admin/dashboard/overview', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { totalRevenue: 2490000, totalOrders: 1, totalCustomers: 1, totalProducts: 8 } }) }));
  await page.goto('/admin/overview');
  await signIn(page, 'admin');
  await expect(page.getByRole('heading', { name: 'Một góc nhìn rõ ràng.', exact: true })).toBeVisible();
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [section, label] of [['overview', 'Tổng quan'], ['products', 'Thiết bị'], ['categories', 'Danh mục'], ['orders', 'Đơn hàng'], ['shipping', 'Vận chuyển'], ['payments', 'Thanh toán'], ['reviews', 'Đánh giá'], ['coupons', 'Mã giảm giá']]) {
      await page.locator('.admin-sidebar').getByRole('link', { name: label, exact: true }).click();
      await expect(page.locator('.admin-main h1')).toBeVisible();
      await expect(page.locator('.admin-main .spinner')).toHaveCount(0);
      await assertFits(page);
      if (width === 320 && section === 'products') {
        await expect(page.getByText('Vuốt ngang để xem đầy đủ cột và thao tác.', { exact: true })).toBeVisible();
        const table = page.getByRole('region', { name: 'Bảng dữ liệu, cuộn ngang để xem thêm', exact: true });
        expect(await table.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
        await table.focus();
        await page.keyboard.press('End');
        await table.evaluate(element => { element.scrollLeft = element.scrollWidth; });
        await table.getByRole('button', { name: 'Sửa', exact: true }).first().scrollIntoViewIfNeeded();
        await expect(table.getByRole('button', { name: 'Sửa', exact: true }).first()).toBeInViewport();
        await table.evaluate(element => { element.scrollLeft = 0; });
        await assertHeaderFits(page);
        await page.locator('.admin-main h1').click();
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      if ((width === 320 && ['overview', 'products', 'orders', 'shipping'].includes(section)) || (width === 1280 && ['overview', 'products', 'orders'].includes(section))) await page.screenshot({ path: `qa/visual/admin-${section}-${width}.png`, fullPage: true });
      if (width === 1280 && section === 'products') {
        await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.screenshot({ path: 'qa/visual/admin-product-dialog-1280.png' });
        await page.keyboard.press('Escape');
      }
    }
  }
});

test('category loading failures remain visible and long searches do not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.route('**/api/categories', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"QA category unavailable"}' }));
  await page.goto(`/products?search=${'thiết-bị-'.repeat(10)}`);
  await expect(page.getByRole('alert')).toContainText('QA category unavailable');
  await expect(page.getByRole('button', { name: 'Tải lại danh mục', exact: true })).toBeVisible();
  await assertFits(page);
});
