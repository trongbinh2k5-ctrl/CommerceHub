import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import ExcelJS from 'exceljs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { Product } from '../src/modules/products/product.model';
import { Category } from '../src/modules/categories/category.model';
import { User } from '../src/modules/auth/user.model';
import { StockMovement } from '../src/modules/operations/operations.models';
import { AuditEvent } from '../src/modules/operations/audit.service';
import { ExcelBatch, ExcelReceipt } from '../src/modules/excel/excel.model';
import { XLSX_MIME, templateWorkbook, importColumns, readImport, type ImportKind, type ImportMode } from '../src/modules/excel/workbook';

async function file(kind: ImportKind, mode: ImportMode, rows: Record<string, unknown>[]) {
  const book = templateWorkbook(kind, mode), sheet = book.getWorksheet('DuLieu')!;
  rows.forEach(row => sheet.addRow(importColumns(kind, mode).map(c => row[c.key] ?? '')));
  return Buffer.from(await book.xlsx.writeBuffer());
}
async function load(bytes: Buffer) { const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes as any); return book; }

test('Excel reader validates workbook structure, limits and unsafe cells', async () => {
  await assert.rejects(readImport(Buffer.from('not an xlsx'), 'staff', 'create'), /Excel/);
  await assert.rejects(readImport(await file('staff', 'create', []), 'staff', 'create'), /chưa có dữ liệu/);
  const formula = await readImport(await file('staff', 'create', [{ fullName: { formula: '1+1' }, email: 'a@test.local' }]), 'staff', 'create');
  assert.ok(formula[0].errors.some(e => e.includes('công thức')));
  await assert.rejects(readImport(await file('staff', 'create', Array.from({ length: 501 }, (_, i) => ({ fullName: 'Person ' + i }))), 'staff', 'create'), /500 dòng/);
  const book = templateWorkbook('staff', 'create'); book.getWorksheet('DuLieu')!.getCell('A1').value = 'role';
  book.getWorksheet('DuLieu')!.addRow(['ADMIN', 'a@test.local']);
  await assert.rejects(readImport(Buffer.from(await book.xlsx.writeBuffer()), 'staff', 'create'), /cột/);
});

test('Excel import/export workflows validate before committing and preserve invariants', { timeout: 120000 }, async t => {
  process.env.NODE_ENV = 'test'; process.env.EMAIL_VERIFICATION_REQUIRED = 'false'; process.env.JWT_ACCESS_SECRET = 'isolated-excel-test-secret';
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  try {
    await mongoose.connect(mongo.getUri('excel_workflows'));
    await Promise.all(Object.values(mongoose.models).map(m => m.init()));
    const password = 'AdminExcel!2026', passwordHash = await bcrypt.hash(password, 4);
    const [admin, staff, customer] = await User.create(['ADMIN', 'STAFF', 'CUSTOMER'].map((role, i) => ({ fullName: 'User ' + i, email: `excel-${i}@test.local`, role, passwordHash })));
    const token = (u: any) => jwt.sign({ role: u.role }, process.env.JWT_ACCESS_SECRET!, { subject: u.id });
    const at = token(admin), st = token(staff), ct = token(customer);
    server = createApp({ apiRateLimit: 10000 }).listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    const request = async (path: string, method = 'GET', body?: unknown, auth = at) => {
      const response = await fetch(base + path, { method, headers: { ...(auth ? { Authorization: 'Bearer ' + auth } : {}), ...(body === undefined ? {} : { 'Content-Type': Buffer.isBuffer(body) ? XLSX_MIME : 'application/json' }) }, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
      const bytes = response.headers.get('content-type')?.startsWith(XLSX_MIME) ? Buffer.from(await response.arrayBuffer()) : undefined;
      return { status: response.status, body: bytes ? undefined : await response.json() as any, bytes };
    };
    const preview = async (kind: ImportKind, mode: ImportMode, rows: Record<string, unknown>[], auth = at) => request(`/admin/excel/${kind}/preview?mode=${mode}`, 'POST', await file(kind, mode, rows), auth);
    const commit = (id: string, body: unknown = {}, auth = at) => request(`/admin/excel/batches/${id}/commit`, 'POST', body, auth);
    let categoryId = '', categorySlug = '', productId = '';
    const product = { sku: 'EXCEL-001', name: 'Thiết bị Excel', price: 250000, stock: 10, brand: 'Example', specifications: 'RAM: 16 GB\nSSD: 512 GB' };

    await t.test('permissions protect all spreadsheet endpoints and staff cannot import staff or export revenue', async () => {
      assert.equal((await request('/admin/excel/products/template', 'GET', undefined, '')).status, 401);
      assert.equal((await request('/admin/excel/products/template', 'GET', undefined, ct)).status, 403);
      assert.equal((await request('/admin/excel/staff/template', 'GET', undefined, st)).status, 403);
      assert.equal((await request('/admin/excel/revenue/export', 'POST', { scope: 'filtered' }, st)).status, 403);
      assert.equal((await request('/admin/excel/orders/preview', 'POST', Buffer.from('x'))).status, 400);
      assert.equal((await request('/admin/excel/staff/template?mode=update')).status, 400);
      const result = await request('/admin/excel/products/template'); assert.equal(result.status, 200);
      const book = await load(result.bytes!); assert.equal(book.worksheets.length, 2); assert.equal(book.getWorksheet('DuLieu')!.rowCount, 1);
    });
    await t.test('category form generates a Vietnamese slug and renaming preserves the URL', async () => {
      const created = await request('/admin/categories', 'POST', { name: 'Đồ âm thanh' }); assert.equal(created.status, 201);
      categoryId = created.body.data._id; categorySlug = created.body.data.slug; assert.equal(categorySlug, 'do-am-thanh');
      const duplicate = await request('/admin/categories', 'POST', { name: 'Đồ âm thanh' }); assert.equal(duplicate.status, 201); assert.notEqual(duplicate.body.data.slug, categorySlug);
      assert.equal((await request('/admin/categories/' + categoryId, 'PATCH', { name: 'Âm thanh mới' })).status, 200);
      assert.equal((await Category.findById(categoryId))!.slug, categorySlug);
    });
    await t.test('online sheets use the same template and file validation without creating accounts', async () => {
      assert.equal((await request('/admin/excel/staff/columns', 'GET', undefined, st)).status, 403);
      assert.equal((await request('/admin/excel/staff/draft', 'POST', { rows: [['Name', 'x@test.local', '']] }, ct)).status, 403);
      const schema = await request('/admin/excel/staff/columns'); assert.equal(schema.status, 200);
      assert.deepEqual(schema.body.data.columns.map((c: any) => c.header), ['Họ tên', 'Email', 'Số điện thoại']);
      assert.equal((await request('/admin/excel/staff/draft', 'POST', { rows: [['', '', '']] })).status, 400);
      assert.equal((await request('/admin/excel/staff/draft', 'POST', { rows: [['Name', 'x@test.local', '', 'ADMIN']] })).status, 400);
      assert.equal((await request('/admin/excel/staff/draft', 'POST', { rows: Array.from({ length: 501 }, () => ['', '', '']) })).status, 400);
      const count = await User.countDocuments();
      const draft = await request('/admin/excel/staff/draft', 'POST', { rows: [['Người nhập trên bảng', 'invalid-email', '0901234567'], ['', '', '']] });
      assert.equal(draft.status, 200);
      const book = await load(draft.bytes!); assert.equal(book.getWorksheet('DuLieu')!.getCell('C2').value, '0901234567');
      assert.equal(await User.countDocuments(), count);
      const checked = await request('/admin/excel/staff/preview', 'POST', draft.bytes);
      assert.equal(checked.body.data.status, 'INVALID'); assert.ok(checked.body.data.rows[0].errors.includes('Email không hợp lệ.'));
    });
    await t.test('invalid products report row errors, export errors and never write partial data', async () => {
      const result = await preview('products', 'create', [product, { ...product, price: -1 }]);
      assert.equal(result.status, 200); assert.equal(result.body.data.status, 'INVALID');
      assert.ok(result.body.data.rows[1].errors.some((e: string) => e.includes('Trùng')));
      const errors = await request(`/admin/excel/batches/${result.body.data.id}/errors`); assert.equal(errors.status, 200); assert.ok((await load(errors.bytes!)).worksheets[0].rowCount > 1);
      assert.equal((await commit(result.body.data.id)).status, 409); assert.equal(await Product.countDocuments(), 0);
      assert.equal((await request(`/admin/excel/batches/${result.body.data.id}`, 'GET', undefined, st)).status, 404);
    });
    await t.test('create products writes typed details and initial-stock ledger only on confirmation', async () => {
      const result = await preview('products', 'create', [{ ...product, categorySlug }]);
      assert.equal(result.body.data.status, 'READY'); assert.equal(await Product.countDocuments(), 0);
      assert.equal((await commit(result.body.data.id)).status, 200);
      const saved = await Product.findOne({ sku: product.sku }); productId = saved!.id;
      assert.equal(saved!.stock, 10); assert.equal(saved!.specifications.length, 2); assert.equal(String(saved!.categoryId), categoryId);
      assert.equal(await StockMovement.countDocuments({ productId }), 1);
      assert.equal((await commit(result.body.data.id)).status, 409);
      assert.equal((await preview('products', 'create', [{ ...product, categorySlug }])).status, 409);
    });
    await t.test('updates use SKU and preserve stock; stale previews cannot overwrite newer edits', async () => {
      const result = await preview('products', 'update', [{ ...product, name: 'Tên cập nhật', price: 300000, categorySlug }]);
      assert.equal(result.body.data.status, 'READY'); assert.equal((await commit(result.body.data.id)).status, 200);
      assert.equal((await Product.findById(productId))!.stock, 10);
      const stale = await preview('products', 'update', [{ ...product, name: 'Tên lỗi thời', price: 350000 }]);
      await Product.updateOne({ _id: productId }, { $set: { name: 'Chỉnh ở nơi khác' } });
      assert.equal((await commit(stale.body.data.id)).status, 409); assert.equal((await Product.findById(productId))!.name, 'Chỉnh ở nơi khác');
    });
    await t.test('inventory import prevents negative stock and concurrent confirmations apply exactly once', async () => {
      const bad = await preview('inventory', 'create', [{ sku: product.sku, delta: -11, reason: 'Xuất vượt tồn kho' }]); assert.equal(bad.body.data.status, 'INVALID');
      const good = await preview('inventory', 'create', [{ sku: product.sku, delta: -3, reason: 'Điều chỉnh kiểm kê Excel' }], st);
      assert.equal(good.body.data.rows[0].before, 10); assert.equal(good.body.data.rows[0].after, 7);
      const results = await Promise.all([commit(good.body.data.id, {}, st), commit(good.body.data.id, {}, st)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal((await Product.findById(productId))!.stock, 7);
      assert.equal(await StockMovement.countDocuments({ productId }), 2);
      assert.equal((await preview('inventory', 'create', [{ sku: product.sku, delta: -3, reason: 'Điều chỉnh kiểm kê Excel' }], st)).status, 409);
    });
    await t.test('batch failure rolls back all rows, stock history and receipt', async () => {
      const item = await preview('products', 'create', [{ ...product, sku: 'ROLLBACK-1' }, { ...product, sku: 'ROLLBACK-2' }]);
      const create = AuditEvent.create;
      try { (AuditEvent as any).create = async () => { throw new Error('Simulated Excel audit failure'); }; assert.equal((await commit(item.body.data.id)).status, 500); }
      finally { AuditEvent.create = create; }
      assert.equal(await Product.countDocuments({ sku: /^ROLLBACK/ }), 0); assert.equal((await ExcelBatch.findById(item.body.data.id))!.status, 'READY');
      assert.equal((await commit(item.body.data.id)).status, 200); assert.equal(await Product.countDocuments({ sku: /^ROLLBACK/ }), 2);
    });
    await t.test('staff import requires admin password, rejects existing email and returns separate one-time credentials', async () => {
      const bad = await preview('staff', 'create', [{ fullName: 'Trùng tài khoản', email: customer.email }]); assert.equal(bad.body.data.status, 'INVALID');
      const result = await preview('staff', 'create', [{ fullName: 'Nhân viên Excel', email: 'staff-import@test.local', phone: '0901234567' }]);
      assert.equal((await commit(result.body.data.id, { currentPassword: 'wrong' })).status, 403);
      const saved = await commit(result.body.data.id, { currentPassword: password }); assert.equal(saved.status, 200);
      const credential = (await load(Buffer.from(saved.body.data.credentialsFile, 'base64'))).worksheets[0];
      const temporary = String(credential.getCell('C2').value), employee = await User.findOne({ email: 'staff-import@test.local' }).select('+passwordHash');
      assert.equal(employee!.role, 'STAFF'); assert.equal(employee!.mustChangePassword, true); assert.ok(await bcrypt.compare(temporary, employee!.passwordHash));
      assert.ok(!JSON.stringify(await ExcelBatch.findById(result.body.data.id)).includes(temporary)); assert.ok(!JSON.stringify(await AuditEvent.find()).includes(temporary));
      assert.equal((await commit(result.body.data.id, { currentPassword: password })).status, 409);
      const exported = await request('/admin/excel/staff/export', 'POST', { scope: 'filtered', filters: { search: 'staff-import' } });
      const sheet = (await load(exported.bytes!)).worksheets[0]; assert.equal(sheet.getCell('D2').value, '0901234567'); assert.equal(sheet.getColumn(4).numFmt, '@');
      assert.ok(!JSON.stringify(sheet.getSheetValues()).includes(temporary));
    });
    await t.test('category spreadsheet import generates slugs and updates keep them stable', async () => {
      const created = await preview('categories', 'create', [{ name: 'Bàn phím cơ', description: 'Từ Excel' }]); assert.equal((await commit(created.body.data.id)).status, 200);
      const category = await Category.findOne({ name: 'Bàn phím cơ' }); assert.equal(category!.slug, 'ban-phim-co');
      const updated = await preview('categories', 'update', [{ id: category!.id, name: 'Bàn phím mới', description: '' }]); assert.equal((await commit(updated.body.data.id)).status, 200);
      assert.equal((await Category.findById(category!.id))!.slug, 'ban-phim-co');
    });
    await t.test('exports use module columns, preserve numbers, filter globally and respect page scope', async () => {
      const filtered = await request('/admin/excel/products/export', 'POST', { scope: 'filtered', filters: { search: 'EXCEL-001' } }); assert.equal(filtered.status, 200);
      const sheet = (await load(filtered.bytes!)).worksheets[0]; assert.equal(sheet.rowCount, 2); assert.equal(typeof sheet.getCell('D2').value, 'number');
      const paged = await request('/admin/excel/products/export', 'POST', { scope: 'page', ids: [productId], filters: { search: 'nonmatching-text' } }); assert.equal((await load(paged.bytes!)).worksheets[0].rowCount, 2);
      for (const kind of ['orders', 'payments', 'shipping', 'categories', 'inventory', 'reviews', 'coupons', 'revenue']) assert.equal((await request(`/admin/excel/${kind}/export`, 'POST', { scope: 'filtered' })).status, 200, kind);
      assert.equal((await request('/admin/excel/orders/export', 'POST', { scope: 'filtered', filters: { from: '2026-02-30' } })).status, 400);
      assert.equal((await request('/admin/excel/orders/export', 'POST', { scope: 'filtered', filters: { status: { $ne: 'x' } } })).status, 400);
      assert.ok(await ExcelReceipt.countDocuments() >= 6);
    });
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(e => e ? reject(e) : resolve()));
    await mongoose.disconnect(); await mongo.stop();
  }
});
