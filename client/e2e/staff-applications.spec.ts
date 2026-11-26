import { test, expect, type Page } from '@playwright/test';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}
const fits = async (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test('customer applies, sees rejection, reapplies and becomes staff only after admin approval', async ({ page, browser, request }) => {
  test.setTimeout(90000);
  const email = `qa-applicant-${Date.now()}@test.local`, name = 'Ứng viên QA', password = 'Applicant!2026';
  const registration = await request.post('/api/auth/register', { data: { fullName: name, email, password } });
  expect(registration.status()).toBe(201);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await login(page, email, password); await page.goto('/account');
  await page.getByRole('button', { name: 'Đăng ký làm nhân viên', exact: true }).click();
  await expect(page).toHaveURL(/tab=staff-application/);
  await expect(page.getByRole('heading', { name: 'Đăng ký làm nhân viên', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await fits(page);
  await page.screenshot({ path: 'qa/staff-applications/customer-form-390.png', fullPage: true });
  const apply = async () => {
    await page.getByLabel('Số điện thoại liên hệ', { exact: true }).fill('0901234567');
    await page.getByLabel('Vị trí mong muốn', { exact: true }).fill('Nhân viên tư vấn bán hàng');
    await page.getByLabel('Giới thiệu và kinh nghiệm', { exact: true }).fill('Tôi có kinh nghiệm tư vấn thiết bị, có thể làm việc cuối tuần.');
    await page.getByRole('button', { name: 'Gửi đăng ký', exact: true }).click();
    await expect(page.getByText('Bạn đã có một đăng ký đang chờ duyệt.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gửi đăng ký', exact: true })).toHaveCount(0);
  };
  await apply();
  await page.getByRole('button', { name: 'Đơn hàng của tôi', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đơn hàng của tôi', exact: true })).toBeVisible();
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const admin = await adminContext.newPage(); admin.on('pageerror', e => errors.push(e.message));
    await login(admin, 'admin@demo.local', 'DemoCommerce!2026'); await admin.goto('/admin/users');
    await expect(admin.getByRole('button', { name: 'Từ chối đăng ký của ' + name, exact: true })).toBeVisible();
    await fits(admin); await admin.screenshot({ path: 'qa/staff-applications/admin-review-1280.png', fullPage: true });
    await admin.setViewportSize({ width: 390, height: 844 }); await fits(admin);
    await admin.screenshot({ path: 'qa/staff-applications/admin-review-390.png', fullPage: true });
    await admin.getByRole('button', { name: 'Từ chối đăng ký của ' + name, exact: true }).click();
    await admin.getByLabel('Lý do từ chối', { exact: true }).fill('Vui lòng bổ sung kinh nghiệm và thời gian làm việc.');
    await admin.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(admin.getByRole('dialog')).toHaveCount(0);
    await page.goto('/account?tab=staff-application');
    await expect(page.getByText('Vui lòng bổ sung kinh nghiệm và thời gian làm việc.', { exact: true })).toBeVisible();
    await expect(page.getByText('Đã từ chối', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'qa/staff-applications/customer-rejected-390.png', fullPage: true });
    await apply();
    await admin.reload();
    await admin.getByRole('button', { name: 'Duyệt đăng ký của ' + name, exact: true }).click();
    await expect(admin.getByRole('dialog', { name: 'Duyệt đăng ký nhân viên', exact: true })).toBeVisible();
    await admin.getByLabel('Lời nhắn cho ứng viên (tùy chọn)', { exact: true }).fill('Chào mừng bạn tham gia cửa hàng.');
    await admin.getByRole('button', { name: 'Xác nhận', exact: true }).click();
    await expect(admin.getByRole('dialog')).toHaveCount(0);
    await admin.getByLabel('Lọc đăng ký', { exact: true }).selectOption('APPROVED');
    await expect(admin.getByText('Chào mừng bạn tham gia cửa hàng.', { exact: true })).toBeVisible();
    await login(page, email, password);
    await expect(page).toHaveURL(/change-password-required/);
    await page.getByLabel('Mật khẩu hiện tại hoặc mật khẩu tạm', { exact: true }).fill(password);
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill('NewPass123');
    await page.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill('NewPass123');
    await page.getByRole('button', { name: 'Lưu mật khẩu riêng', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Đã thiết lập mật khẩu riêng', exact: true })).toBeVisible();
    await login(page, email, 'NewPass123'); await page.goto('/admin/orders');
    await expect(page.getByRole('heading', { name: 'Đơn hàng.', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await adminContext.close(); }
});
