import express, { Router, type Response } from 'express';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/authorize.middleware';
import { createRequestLimiter } from '../../middlewares/security.middleware';
import { ExcelBatch, ExcelReceipt } from './excel.model';
import { XLSX_MIME, MAX_ROWS, templateWorkbook, readImport, makeWorkbook, importColumns, type ImportKind, type ImportMode } from './workbook';
import { validateRows, commitBatch, excelFail } from './import.service';
import { exportWorkbook, exportKinds, type ExportKind } from './export.service';

const imports = ['products', 'categories', 'staff', 'inventory'];
function permitted(kind: string, role: string) {
  if (!exportKinds.includes(kind as ExportKind)) return excelFail(400, 'Loại dữ liệu không được hỗ trợ.');
  if (['staff', 'revenue'].includes(kind) && role !== 'ADMIN') return excelFail(403, 'Chỉ admin được truy cập dữ liệu này.');
}
function importOptions(kind: string, value: unknown) {
  if (!imports.includes(kind)) return excelFail(400, 'Không hỗ trợ nhập dữ liệu này.');
  const mode = value === undefined ? 'create' : value;
  if (typeof mode !== 'string' || !['create', 'update'].includes(mode) || (['staff', 'inventory'].includes(kind) && mode !== 'create')) return excelFail(400, 'Chế độ nhập không hợp lệ.');
  return { kind: kind as ImportKind, mode: mode as ImportMode };
}
async function sendWorkbook(res: Response, book: ReturnType<typeof makeWorkbook>, name: string) {
  const bytes = await book.xlsx.writeBuffer();
  res.setHeader('Content-Type', XLSX_MIME); res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
  res.send(Buffer.from(bytes));
}
const publicBatch = (batch: any) => ({ id: batch.id, kind: batch.kind, mode: batch.mode, status: batch.status, count: batch.rows.length, valid: batch.rows.filter((r: any) => !r.errors.length).length, rows: batch.rows.map((r: any) => ({ row: r.row, values: r.values, errors: r.errors, before: r.before, after: r.after })), expiresAt: batch.expiresAt });
export const excelRouter = Router();
excelRouter.use(authenticate, authorize('ADMIN', 'STAFF'));
excelRouter.get('/:kind/columns', (req, res) => {
  const kind = String(req.params.kind); permitted(kind, req.user!.role);
  const options = importOptions(kind, req.query.mode);
  res.json({ success: true, data: { columns: importColumns(options.kind, options.mode), maxRows: MAX_ROWS } });
});
excelRouter.post('/:kind/draft', createRequestLimiter(30, 15 * 60000), express.json({ limit: '3mb', strict: true }), async (req, res) => {
  const kind = String(req.params.kind); permitted(kind, req.user!.role);
  const options = importOptions(kind, req.query.mode), columns = importColumns(options.kind, options.mode), rows = req.body?.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS || rows.some(row => !Array.isArray(row) || row.length !== columns.length || row.some(value => typeof value !== 'string' || value.length > 16000))) return excelFail(400, `Bảng nhập không hợp lệ. Tối đa ${MAX_ROWS} dòng, mỗi ô tối đa 16.000 ký tự.`);
  if (!rows.some(row => row.some((value: string) => value.trim()))) return excelFail(400, 'Nhập ít nhất một dòng dữ liệu trước khi tạo file.');
  const book = templateWorkbook(options.kind, options.mode), sheet = book.getWorksheet('DuLieu')!;
  rows.forEach(row => sheet.addRow(row.map((value: string, index: number) => {
    if (columns[index].format !== '@' && /^-?\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value))) return Number(value);
    return value;
  })));
  await sendWorkbook(res, book, `berylcore-bang-nhap-${kind}`);
});
excelRouter.use(express.json({ limit: '64kb', strict: true }));
excelRouter.get('/:kind/template', async (req, res) => {
  const kind = String(req.params.kind); permitted(kind, req.user!.role);
  const options = importOptions(kind, req.query.mode);
  await sendWorkbook(res, templateWorkbook(options.kind, options.mode), `berylcore-mau-${kind}-${options.mode}`);
});
excelRouter.post('/:kind/export', createRequestLimiter(20, 60000), async (req, res) => {
  const kind = String(req.params.kind); permitted(kind, req.user!.role);
  const b = req.body ?? {};
  if (b.filters !== undefined && (!b.filters || typeof b.filters !== 'object' || Array.isArray(b.filters))) return excelFail(400, 'Bộ lọc không hợp lệ.');
  const book = await exportWorkbook(kind as ExportKind, b.scope, b.ids, b.filters);
  await sendWorkbook(res, book, `berylcore-${kind}-${new Date().toISOString().slice(0, 10)}`);
});
excelRouter.post('/:kind/preview', createRequestLimiter(30, 15 * 60000), express.raw({ type: XLSX_MIME, limit: '5mb' }), async (req, res) => {
  const kind = String(req.params.kind); permitted(kind, req.user!.role);
  const options = importOptions(kind, req.query.mode);
  if (!Buffer.isBuffer(req.body) || !req.body.length) return excelFail(400, 'Chỉ nhận file Excel .xlsx tối đa 5 MB.');
  let parsed;
  try { parsed = await readImport(req.body, options.kind, options.mode); } catch (e) { return excelFail(400, (e as Error).message); }
  if (Buffer.byteLength(JSON.stringify(parsed)) > 3 * 1024 * 1024) return excelFail(400, 'Nội dung ô quá lớn. Hãy chia nhỏ file.');
  const digest = createHash('sha256').update(JSON.stringify(parsed.map(r => r.values))).digest('hex');
  if (await ExcelReceipt.exists({ kind, mode: options.mode, digest })) return excelFail(409, 'Nội dung file này đã được nhập thành công. Không nhập lại để tránh tạo hoặc điều chỉnh trùng.');
  const rows = await validateRows(options.kind, options.mode, parsed);
  const batch = await ExcelBatch.create({ actorId: req.user!.userId, kind, mode: options.mode, digest, status: rows.some(r => r.errors.length) ? 'INVALID' : 'READY', rows, expiresAt: new Date(Date.now() + 30 * 60000) });
  res.json({ success: true, data: publicBatch(batch) });
});
excelRouter.get('/batches/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return excelFail(400, 'Mã phiên nhập không hợp lệ.');
  const batch = await ExcelBatch.findOne({ _id: req.params.id, actorId: req.user!.userId, expiresAt: { $gt: new Date() } });
  if (!batch) return excelFail(404, 'Không tìm thấy phiên nhập.');
  permitted(batch.kind, req.user!.role); res.json({ success: true, data: publicBatch(batch) });
});
excelRouter.get('/batches/:id/errors', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return excelFail(400, 'Mã phiên nhập không hợp lệ.');
  const batch = await ExcelBatch.findOne({ _id: req.params.id, actorId: req.user!.userId, expiresAt: { $gt: new Date() } });
  if (!batch) return excelFail(404, 'Không tìm thấy phiên nhập.');
  permitted(batch.kind, req.user!.role);
  const columns = [{ key: 'row', header: 'Dòng trong file gốc', width: 22 }, ...importColumns(batch.kind as ImportKind, batch.mode as ImportMode), { key: 'errors', header: 'Lỗi cần sửa', width: 65 }];
  const rows = batch.rows.filter((r: any) => r.errors.length).map((r: any) => ({ ...r.values, row: r.row, errors: r.errors.join('\n') }));
  await sendWorkbook(res, makeWorkbook(columns, rows), 'berylcore-loi-nhap-excel');
});
excelRouter.post('/batches/:id/commit', createRequestLimiter(20, 15 * 60000), async (req, res) => {
  const result = await commitBatch(String(req.params.id), req.user!.userId, req.body?.currentPassword, req.user!.sessionId);
  let credentialsFile: string | undefined;
  if (result.credentials.length) {
    const book = makeWorkbook([{ key: 'fullName', header: 'Họ tên', width: 28 }, { key: 'email', header: 'Email', width: 38 }, { key: 'password', header: 'Mật khẩu tạm (chỉ cấp lần này)', width: 40 }, { key: 'expiresAt', header: 'Hết hạn', format: 'yyyy-mm-dd hh:mm', width: 25 }], result.credentials);
    credentialsFile = Buffer.from(await book.xlsx.writeBuffer()).toString('base64');
  }
  res.json({ success: true, data: { count: result.count, credentialsFile } });
});
