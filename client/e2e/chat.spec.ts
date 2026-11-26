import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';

async function login(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(role + '@demo.local');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('DemoCommerce!2026');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole('link', { name: /^Tài khoản / }).first()).toBeVisible();
}

test('guest demo is honest, responsive, and product inquiry carries context', async ({ page }) => {
  await fs.mkdir('qa/chat', { recursive: true });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Mở hỗ trợ chat', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Hỗ trợ BerylCore' });
    await expect(dialog.getByRole('heading', { name: 'Bạn cần hỗ trợ gì?' })).toBeVisible();
    await expect(dialog.getByText('Nhân viên tiếp nhận và trả lời', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText(/Demo theo kịch bản/)).toHaveCount(0);
    await dialog.screenshot({ path: `qa/chat/choices-${width}.png` });
    await dialog.getByRole('button', { name: /Trợ lý tự động/ }).click();
    await expect(dialog.getByText('Hỗ trợ tìm thiết bị và mua sắm')).toBeVisible();
    await dialog.getByRole('button', { name: 'Chính sách bảo hành', exact: true }).click();
    await expect(dialog.getByRole('log')).toContainText('chưa được cửa hàng công bố');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const box = await dialog.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await dialog.screenshot({ path: `qa/chat/guest-${width}.png` });
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mở hỗ trợ chat', exact: true })).toBeFocused();
  }
  await page.goto('/products');
  await page.locator('.product-card .product-info a').first().click();
  await page.getByRole('button', { name: 'Hỏi về sản phẩm', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Hỗ trợ BerylCore' });
  await expect(dialog.getByRole('link', { name: 'Đăng nhập để chat' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Đóng cửa sổ chat' }).click();
  expect(errors).toEqual([]);
});

test('customer and staff exchange persisted messages; demo hands off with explicit confirmation', async ({ browser }) => {
  const customerContext = await browser.newContext({ viewport: { width: 390, height: 1000 } });
  const staffContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const customer = await customerContext.newPage(), staff = await staffContext.newPage();
  try {
    await login(customer, 'customer'); await customer.goto('/messages');
    await customer.getByRole('button', { name: 'Chat với cửa hàng', exact: true }).click();
    await customer.getByLabel('Nội dung tin nhắn', { exact: true }).fill('Tôi cần tư vấn màn hình cho góc làm việc.');
    await customer.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click();
    await expect(customer.getByRole('log')).toContainText('Tôi cần tư vấn màn hình');
    await login(staff, 'staff'); await staff.goto('/admin/chat');
    await staff.getByRole('button', { name: /Minh Anh.*Chờ tiếp nhận/ }).click();
    await expect(staff.getByLabel('Nội dung tin nhắn', { exact: true })).toBeDisabled();
    await staff.getByRole('button', { name: 'Tiếp nhận hội thoại', exact: true }).click();
    await expect(staff.getByLabel('Nội dung tin nhắn', { exact: true })).toBeEnabled();
    await staff.getByLabel('Nội dung tin nhắn', { exact: true }).fill('Chào bạn, bạn muốn màn hình kích thước bao nhiêu?');
    await staff.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click();
    await expect(customer.getByRole('log')).toContainText('bạn muốn màn hình kích thước bao nhiêu', { timeout: 10000 });
    await expect(customer.locator('.chat-message').filter({ hasText: 'Chào bạn, bạn muốn màn hình kích thước bao nhiêu?' }).locator('.chat-sender')).toHaveText('Nhân viên BerylCore');
    await customer.reload();
    await customer.getByRole('button', { name: /Cửa hàng BerylCore.*Đang xử lý/ }).click();
    await expect(customer.getByRole('log')).toContainText('bạn muốn màn hình kích thước bao nhiêu');
    await staff.locator('.chat-workspace').screenshot({ path: 'qa/chat/staff-inbox.png' });
    await staff.setViewportSize({ width: 320, height: 900 });
    expect(await staff.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await staff.locator('.chat-workspace').screenshot({ path: 'qa/chat/staff-320.png' });
    await staff.setViewportSize({ width: 1440, height: 1000 });
    await customer.locator('.chat-workspace').screenshot({ path: 'qa/chat/customer-390.png' });
    await customer.getByRole('button', { name: 'Về danh sách hội thoại' }).click();
    await customer.getByRole('button', { name: 'Trợ lý tự động', exact: true }).click();
    await customer.getByRole('button', { name: 'Gợi ý màn hình', exact: true }).click();
    await expect(customer.locator('.chat-product').first()).toBeVisible();
    await customer.getByRole('button', { name: 'Chuyển sang nhân viên', exact: true }).click();
    await expect(customer.getByRole('button', { name: 'Xác nhận chuyển tiếp', exact: true })).toBeVisible();
    await customer.getByLabel('Kiểm tra nội dung gửi cho nhân viên').fill('Tôi cần tư vấn thêm màn hình 27 inch.');
    await customer.getByRole('button', { name: 'Xác nhận chuyển tiếp', exact: true }).click();
    await expect(customer.getByRole('log')).toContainText('Tôi cần tư vấn thêm màn hình 27 inch.');
    await expect(staff.getByRole('log')).toContainText('Tôi cần tư vấn thêm màn hình 27 inch.', { timeout: 10000 });
    await staff.getByRole('button', { name: 'Đóng hội thoại', exact: true }).click();
    await expect(customer.getByLabel('Nội dung tin nhắn', { exact: true })).toBeDisabled({ timeout: 10000 });
    await customer.getByRole('button', { name: 'Về danh sách hội thoại' }).click();
    await customer.locator('.chat-inbox-item').filter({ hasText: 'Trợ lý tự động' }).click();
    await expect(customer.locator('.chat-product').first()).toBeVisible();
  } finally { await customerContext.close(); await staffContext.close(); }
});

test('guest assistant understands follow-up budgets and availability', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mở hỗ trợ chat', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Hỗ trợ BerylCore' });
  await dialog.getByRole('button', { name: 'Trợ lý tự động', exact: true }).click();
  const send = async (text: string) => {
    await dialog.getByLabel('Nội dung tin nhắn', { exact: true }).fill(text);
    await dialog.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click();
    await expect(dialog.getByLabel('Nội dung tin nhắn', { exact: true })).toHaveValue('');
  };
  await send('Tìm monitor');
  await expect(dialog.locator('.chat-message').last()).toContainText('Màn hình');
  await send('dưới 5tr thôi');
  await expect(dialog.locator('.chat-message').last()).toContainText('Workspace 24');
  await expect(dialog.locator('.chat-message').last()).not.toContainText('Workspace 27');
  await send('còn hàng ko');
  await expect(dialog.locator('.chat-message').last()).toContainText('Chưa tìm thấy');
});

test('retry after a lost acknowledgment does not duplicate a persisted message', async ({ page }) => {
  await login(page, 'customer'); await page.goto('/messages');
  await page.getByRole('button', { name: 'Chat với cửa hàng', exact: true }).click();
  await expect(page.getByLabel('Nội dung tin nhắn', { exact: true })).toBeEnabled();
  const keys: string[] = [];
  await page.route('**/api/chat/conversations/*/messages', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    keys.push(route.request().postDataJSON().clientId);
    if (keys.length === 1) { await route.fetch(); await route.abort('failed'); } else await route.continue();
  });
  await page.getByLabel('Nội dung tin nhắn', { exact: true }).fill('Kiểm tra gửi lại sau mất kết nối.');
  await page.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('gửi lại');
  await page.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('log').getByText('Kiểm tra gửi lại sau mất kết nối.', { exact: true })).toHaveCount(1);
  expect(keys.length).toBe(2); expect(keys[0]).toBe(keys[1]);
});

test('product context survives sending; admin can assign and answer on a phone', async ({ browser }) => {
  const customerContext = await browser.newContext({ viewport: { width: 390, height: 950 } });
  const adminContext = await browser.newContext({ viewport: { width: 320, height: 950 } });
  const customer = await customerContext.newPage(), admin = await adminContext.newPage();
  try {
    await login(customer, 'customer'); await customer.goto('/products');
    await customer.locator('.product-card .product-info a').first().click();
    const name = await customer.locator('.detail-copy h1').innerText();
    await customer.getByRole('button', { name: 'Hỏi về sản phẩm', exact: true }).click();
    const dialog = customer.getByRole('dialog', { name: 'Hỗ trợ BerylCore' });
    await dialog.getByLabel('Nội dung tin nhắn', { exact: true }).fill('Xin tư vấn sản phẩm đính kèm.');
    await dialog.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click();
    await expect(dialog.locator('.chat-product').last()).toContainText(name);
    await login(admin, 'admin'); await admin.goto('/admin/chat');
    await admin.getByRole('button', { name: /Minh Anh.*Chờ tiếp nhận/ }).click();
    await admin.getByLabel('Nhân viên phụ trách', { exact: true }).selectOption({ label: 'Quản trị CH' });
    await admin.getByRole('button', { name: 'Phân công', exact: true }).click();
    await expect(admin.locator('.toast')).toContainText('Đã phân công hội thoại cho Quản trị CH.');
    await expect(admin.getByLabel('Nội dung tin nhắn', { exact: true })).toBeEnabled();
    await expect(admin.locator('.chat-product').last()).toContainText(name);
    expect(await admin.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await admin.getByLabel('Nội dung tin nhắn', { exact: true }).fill('Admin đã tiếp nhận sản phẩm bạn hỏi.');
    await admin.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click();
    await expect(dialog.getByRole('log')).toContainText('Admin đã tiếp nhận sản phẩm bạn hỏi.', { timeout: 10000 });
    await expect(dialog.locator('.chat-message').filter({ hasText: 'Admin đã tiếp nhận sản phẩm bạn hỏi.' }).locator('.chat-sender')).toHaveText('Admin');
    await expect(admin.locator('.chat-message').filter({ hasText: 'Admin đã tiếp nhận sản phẩm bạn hỏi.' }).locator('.chat-sender')).toHaveText('Admin');
    await admin.locator('.chat-workspace').screenshot({ path: 'qa/chat/admin-320.png' });
  } finally { await customerContext.close(); await adminContext.close(); }
});
