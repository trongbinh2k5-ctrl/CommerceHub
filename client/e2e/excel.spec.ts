import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { templateWorkbook, importColumns, XLSX_MIME, type ImportKind } from '../../server/src/modules/excel/workbook';

async function login(page: Page) {
  await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill('admin@demo.local'); await page.getByLabel('Mật khẩu', { exact: true }).fill('DemoCommerce!2026');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click(); await expect(page).not.toHaveURL(/\/login$/);
}
async function bytes(kind: ImportKind, data: Record<string, unknown>) {
  const book = templateWorkbook(kind, 'create'); book.getWorksheet('DuLieu')!.addRow(importColumns(kind, 'create').map(c => data[c.key] ?? ''));
  return Buffer.from(await book.xlsx.writeBuffer());
}
async function readBook(buffer: Buffer) { const book = templateWorkbook('products', 'create'); await book.xlsx.load(buffer as any); return book; }
async function downloaded(page: Page, button: string) {
  const waiting = page.waitForEvent('download'); await page.getByRole('button', { name: button, exact: true }).click(); const download = await waiting;
  return { name: download.suggestedFilename(), bytes: await readFile((await download.path())!) };
}
const fits = async (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test('Excel products validate before writing, export and update round-trip; category slug is automatic', async ({ page }) => {
  test.setTimeout(90000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await login(page); await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'Thêm mới', exact: true }).click();
  await expect(page.getByRole('dialog').locator('input[name=slug]')).toHaveCount(0);
  await page.getByLabel('Tên danh mục', { exact: true }).fill('Đồ dùng kiểm thử Excel');
  const savedCategory = page.waitForResponse(r => r.url().endsWith('/api/admin/categories') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  const category = (await (await savedCategory).json()).data; expect(category.slug).toMatch(/^do-dung-kiem-thu-excel/);
  await page.goto('/admin/products'); await page.getByRole('button', { name: 'Nhập Excel', exact: true }).click();
  const template = await downloaded(page, 'Tải file mẫu'); expect((await readBook(template.bytes)).worksheets.length).toBe(2);
  const data = { sku: `QA-EXCEL-${Date.now()}`, name: 'Thiết bị nhập Excel QA', price: -1, stock: 5, categorySlug: category.slug, brand: 'Example' };
  await page.getByLabel('File Excel .xlsx', { exact: true }).setInputFiles({ name: 'invalid.xlsx', mimeType: XLSX_MIME, buffer: await bytes('products', data) });
  await page.getByRole('button', { name: 'Kiểm tra file', exact: true }).click();
  await expect(page.getByText('1 dòng · 0 hợp lệ · 1 có lỗi', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Xác nhận nhập/ })).toHaveCount(0);
  const errorFile = await downloaded(page, 'Tải danh sách lỗi'); expect((await readBook(errorFile.bytes)).worksheets[0].getRow(2).values).toContain(2);
  data.price = 250000;
  await page.getByLabel('File Excel .xlsx', { exact: true }).setInputFiles({ name: 'products.xlsx', mimeType: XLSX_MIME, buffer: await bytes('products', data) });
  await page.getByRole('button', { name: 'Kiểm tra file', exact: true }).click();
  await expect(page.getByText('1 dòng · 1 hợp lệ · 0 có lỗi', { exact: true })).toBeVisible();
  await fits(page); await page.screenshot({ path: 'qa/excel/preview-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await fits(page); await page.screenshot({ path: 'qa/excel/preview-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Xác nhận nhập 1 dòng', exact: true }).click(); await expect(page.getByText('Đã nhập thành công', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Hoàn tất', exact: true }).click();
  await expect(page.locator('tbody tr').filter({ hasText: data.sku })).toContainText(data.name);
  await page.getByLabel('Phạm vi xuất Excel sản phẩm', { exact: true }).selectOption('page');
  const exported = await downloaded(page, 'Xuất Excel'), book = await readBook(exported.bytes), sheet = book.worksheets[0];
  const headers = sheet.getRow(1).values as string[], skuColumn = headers.indexOf('SKU'), priceColumn = headers.indexOf('Giá bán'), stockColumn = headers.indexOf('Tồn kho');
  let target = 0; sheet.eachRow((row, number) => { if (row.getCell(skuColumn).value === data.sku) target = number; }); expect(target).toBeGreaterThan(1);
  // Keep only the intended row in this update file; other rows stay untouched.
  sheet.eachRow((row, number) => { if (number > 1 && number !== target) row.values = []; });
  sheet.getRow(target).getCell(priceColumn).value = 345000; sheet.getRow(target).getCell(stockColumn).value = 999;
  await page.getByRole('button', { name: 'Nhập Excel', exact: true }).click(); await page.getByLabel('Chế độ nhập', { exact: true }).selectOption('update');
  await page.getByLabel('File Excel .xlsx', { exact: true }).setInputFiles({ name: 'updated-products.xlsx', mimeType: XLSX_MIME, buffer: Buffer.from(await book.xlsx.writeBuffer()) });
  await page.getByRole('button', { name: 'Kiểm tra file', exact: true }).click();
  await expect(page.getByText('1 dòng · 1 hợp lệ · 0 có lỗi', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận nhập 1 dòng', exact: true }).click(); await expect(page.getByRole('button', { name: 'Hoàn tất', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Hoàn tất', exact: true }).click();
  const row = page.locator('tbody tr').filter({ hasText: data.sku }); await expect(row).toContainText('345.000'); await expect(row.locator('td').nth(2)).toHaveText('5');
  await page.screenshot({ path: 'qa/excel/product-list-mobile.png', fullPage: true }); expect(errors).toEqual([]);
});

test('Excel inventory imports and staff credentials are separate from normal staff exports', async ({ page, request }) => {
  test.setTimeout(90000); await login(page); await page.goto('/admin/inventory');
  const catalog = await request.get('/api/products?search=Tai%20nghe%20Studio%2001');
  expect(catalog.status()).toBe(200);
  const startingStock = (await catalog.json()).data.find((product: { sku: string }) => product.sku === 'CH-AUD-01').stock as number;
  await page.getByRole('button', { name: 'Nhập Excel điều chỉnh kho', exact: true }).click();
  await page.getByLabel('File Excel .xlsx', { exact: true }).setInputFiles({ name: 'inventory.xlsx', mimeType: XLSX_MIME, buffer: await bytes('inventory', { sku: 'CH-AUD-01', delta: 2, reason: 'Nhập kiểm kê QA Excel' }) });
  await page.getByRole('button', { name: 'Kiểm tra file', exact: true }).click(); await expect(page.getByText(`${startingStock} → ${startingStock + 2}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận nhập 1 dòng', exact: true }).click(); await page.getByRole('button', { name: 'Hoàn tất', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('Nhập kiểm kê QA Excel');
  await page.goto('/admin/users'); await page.getByRole('button', { name: 'Nhập Excel', exact: true }).click();
  const email = `excel-staff-${Date.now()}@test.local`;
  await page.getByLabel('File Excel .xlsx', { exact: true }).setInputFiles({ name: 'staff.xlsx', mimeType: XLSX_MIME, buffer: await bytes('staff', { fullName: 'Nhân viên Excel QA', email, phone: '0901234567' }) });
  await page.getByRole('button', { name: 'Kiểm tra file', exact: true }).click(); await expect(page.getByText('1 dòng · 1 hợp lệ · 0 có lỗi', { exact: true })).toBeVisible();
  await page.getByLabel('Mật khẩu hiện tại của admin', { exact: true }).fill('DemoCommerce!2026');
  await page.getByRole('button', { name: 'Xác nhận nhập 1 dòng', exact: true }).click();
  const credentials = await downloaded(page, 'Tải thông tin đăng nhập tạm'), credentialSheet = (await readBook(credentials.bytes)).worksheets[0];
  expect(credentialSheet.getCell('B2').value).toBe(email); expect(String(credentialSheet.getCell('C2').value)).toMatch(/^BC!/);
  await page.getByRole('button', { name: 'Hoàn tất', exact: true }).click();
  await page.getByLabel('Tìm tài khoản', { exact: true }).fill(email); await expect(page.locator('tbody')).toContainText('Nhân viên Excel QA');
  const exported = await downloaded(page, 'Xuất Excel nhân viên'), exportSheet = (await readBook(exported.bytes)).worksheets[0];
  expect(exportSheet.rowCount).toBe(2); expect(exportSheet.getCell('D2').value).toBe('0901234567'); expect(JSON.stringify(exportSheet.getSheetValues())).not.toContain(String(credentialSheet.getCell('C2').value));
  await page.setViewportSize({ width: 390, height: 844 }); await fits(page); await page.screenshot({ path: 'qa/excel/staff-mobile.png', fullPage: true });
});

test('Add opens a ready online Excel sheet and uses the normal file validation before importing', async ({ page }) => {
  test.setTimeout(90000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await login(page); await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Nhập Excel', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Bảng Excel — nhân viên', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dùng bảng này', exact: true })).toBeDisabled();
  const stamp = Date.now(), secondEmail = `sheet-second-${stamp}@test.local`;
  const pasted = `Nhân viên bảng một\tinvalid-email\t0901234567\r\nNhân viên bảng hai\t${secondEmail}\t0912345678\r\n`;
  await page.getByLabel('Họ tên, dòng 2', { exact: true }).evaluate((element, text) => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', text);
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, pasted);
  await expect(page.getByLabel('Email, dòng 3', { exact: true })).toHaveValue(secondEmail);
  await expect(page.getByLabel('Số điện thoại, dòng 2', { exact: true })).toHaveValue('0901234567');
  await page.getByRole('button', { name: 'Thêm dòng', exact: true }).click();
  await expect(page.getByLabel('Họ tên, dòng 7', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xóa dòng 7', exact: true }).click();
  await fits(page); await page.screenshot({ path: 'qa/excel/online-sheet-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await fits(page);
  await page.screenshot({ path: 'qa/excel/online-sheet-mobile.png' });
  await page.getByRole('button', { name: 'Dùng bảng này', exact: true }).click();
  await expect(page.getByText('bang-nhap-staff.xlsx', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kiểm tra file', exact: true }).click();
  await expect(page.getByText('2 dòng · 1 hợp lệ · 1 có lỗi', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Xác nhận nhập/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(page.getByLabel('Họ tên, dòng 2', { exact: true })).toHaveValue('Nhân viên bảng một');
  await page.getByLabel('Email, dòng 2', { exact: true }).fill(`sheet-first-${stamp}@test.local`);
  await page.getByRole('button', { name: 'Dùng bảng này', exact: true }).click();
  await page.getByRole('button', { name: 'Kiểm tra file', exact: true }).click();
  await expect(page.getByText('2 dòng · 2 hợp lệ · 0 có lỗi', { exact: true })).toBeVisible();
  await page.getByLabel('Mật khẩu hiện tại của admin', { exact: true }).fill('DemoCommerce!2026');
  await page.getByRole('button', { name: 'Xác nhận nhập 2 dòng', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tải thông tin đăng nhập tạm', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hoàn tất', exact: true }).click();
  await page.getByLabel('Tìm tài khoản', { exact: true }).fill(secondEmail); await expect(page.locator('tbody')).toContainText('Nhân viên bảng hai');
  await page.goto('/admin/products'); await page.getByRole('button', { name: 'Nhập Excel', exact: true }).click();
  await page.getByRole('button', { name: 'Thêm', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Bảng Excel — sản phẩm', exact: true })).toBeVisible();
  await page.getByLabel('SKU, dòng 2', { exact: true }).fill(`SHEET-${stamp}`);
  await page.getByLabel('Tên sản phẩm, dòng 2', { exact: true }).fill('Sản phẩm nhập trên bảng');
  await page.getByLabel('Giá bán, dòng 2', { exact: true }).fill('150000');
  await page.getByRole('button', { name: 'Dùng bảng này', exact: true }).click();
  await page.getByRole('button', { name: 'Kiểm tra file', exact: true }).click();
  await expect(page.getByText('1 dòng · 1 hợp lệ · 0 có lỗi', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận nhập 1 dòng', exact: true }).click();
  await page.getByRole('button', { name: 'Hoàn tất', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('Sản phẩm nhập trên bảng'); expect(errors).toEqual([]);
});

test('online product sheets upload local main and gallery images before normal file validation', async ({ page }) => {
  test.setTimeout(90000); await login(page); await page.goto('/admin/products');
  await page.getByRole('button', { name: 'Nhập Excel', exact: true }).click(); await page.getByRole('button', { name: 'Thêm', exact: true }).click();
  const sku = `LOCAL-IMAGE-${Date.now()}`;
  await page.getByLabel('SKU, dòng 2', { exact: true }).fill(sku);
  await page.getByLabel('Tên sản phẩm, dòng 2', { exact: true }).fill('Sản phẩm có ảnh từ máy');
  await page.getByLabel('Giá bán, dòng 2', { exact: true }).fill('450000');
  const image = await readFile('public/images/keyboard.jpg');
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Chọn ảnh chính từ máy, dòng 2', exact: true }).click();
  await (await picker).setFiles({ name: 'ban-phim.jpg', mimeType: 'image/jpeg', buffer: image });
  const main = page.getByLabel('Ảnh chính, dòng 2', { exact: true });
  await expect(main).toHaveValue(/^\/api\/media\/[a-f0-9-]+\.jpg$/);
  const mainUrl = await main.inputValue();
  await expect(page.getByRole('img', { name: 'Ảnh chính 1, dòng 2', exact: true })).toBeVisible();
  // A rejected replacement must preserve the already-uploaded image.
  await page.getByLabel('File ảnh chính, dòng 2', { exact: true }).setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('alert')).toContainText('Chỉ nhận PNG'); await expect(main).toHaveValue(mainUrl);
  await page.getByLabel('File ảnh chính, dòng 2', { exact: true }).setInputFiles({ name: 'oversized.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert')).toContainText('5 MB'); await expect(main).toHaveValue(mainUrl);
  const gallery = page.getByLabel('Bộ ảnh, dòng 2', { exact: true });
  await page.getByLabel('File bộ ảnh, dòng 2', { exact: true }).setInputFiles([{ name: 'goc-1.jpg', mimeType: 'image/jpeg', buffer: image }, { name: 'goc-2.jpg', mimeType: 'image/jpeg', buffer: image }]);
  await expect.poll(async () => (await gallery.inputValue()).split('\n').filter(Boolean).length).toBe(2);
  await expect(page.getByRole('button', { name: 'Dùng bảng này', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Xóa ảnh 1 trong bộ ảnh, dòng 2', exact: true }).click();
  await expect.poll(async () => (await gallery.inputValue()).split('\n').filter(Boolean).length).toBe(1);
  const galleryUrl = await gallery.inputValue();
  await gallery.fill(Array.from({ length: 12 }, (_, i) => `/images/test-${i}.jpg`).join('\n'));
  await expect(page.getByRole('button', { name: 'Chọn ảnh bộ ảnh từ máy, dòng 2', exact: true })).toBeDisabled();
  await gallery.fill(galleryUrl);
  await main.scrollIntoViewIfNeeded(); await fits(page); await page.screenshot({ path: 'qa/excel/local-images-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await main.scrollIntoViewIfNeeded(); await fits(page); await page.screenshot({ path: 'qa/excel/local-images-mobile.png' });
  await page.getByRole('button', { name: 'Dùng bảng này', exact: true }).click();
  await page.getByRole('button', { name: 'Kiểm tra file', exact: true }).click();
  await expect(page.getByText('1 dòng · 1 hợp lệ · 0 có lỗi', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận nhập 1 dòng', exact: true }).click(); await page.getByRole('button', { name: 'Hoàn tất', exact: true }).click();
  const row = page.locator('tbody tr').filter({ hasText: sku }); await expect(row.locator('img')).toHaveAttribute('src', mainUrl);
  await row.getByRole('button', { name: 'Sửa', exact: true }).click();
  await expect(page.locator('input[name="imageUrl"]')).toHaveValue(mainUrl); await expect(page.locator('textarea[name="gallery"]')).toHaveValue(galleryUrl);
});
