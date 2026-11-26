import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose, { type ClientSession } from 'mongoose';
import { Product } from '../products/product.model';
import { Category } from '../categories/category.model';
import { availableCategorySlug } from '../categories/category-slug';
import { User } from '../auth/user.model';
import { validEmail } from '../auth/account.service';
import { LoginSession } from '../auth/account.models';
import { parseProductDetails } from '../products/product-details';
import { isValidProductImage } from '../products/product-image';
import { StockMovement } from '../operations/operations.models';
import { recordAudit, auditChanges } from '../operations/audit.service';
import { ExcelBatch, ExcelReceipt } from './excel.model';
import { type ImportKind, type ImportMode, readImport } from './workbook';

export const excelFail = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }); };
type ParsedRow = Awaited<ReturnType<typeof readImport>>[number];
export type CheckedRow = ParsedRow & { data: Record<string, any>; expectedUpdatedAt?: Date; targetId?: string; before?: number; after?: number };
const integer = (value: unknown) => typeof value === 'number' ? Number.isSafeInteger(value) ? value : NaN : typeof value === 'string' && /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

export async function validateRows(kind: ImportKind, mode: ImportMode, rows: ParsedRow[], session?: ClientSession): Promise<CheckedRow[]> {
  const checked: CheckedRow[] = [], seen = new Set<string>();
  for (const source of rows) {
    const row: CheckedRow = { ...source, errors: [...source.errors], data: {} }, v = source.values;
    const requireText = (key: string, label: string, max: number, required = false) => {
      const result = text(v[key]); if ((required && !result) || result.length > max) row.errors.push(`${label}: ${required ? 'bắt buộc, ' : ''}tối đa ${max} ký tự.`); return result;
    };
    const key = kind === 'staff' ? text(v.email).toLowerCase() : kind === 'categories' ? text(mode === 'create' ? v.name : v.id).toLowerCase() : text(v.sku);
    if (seen.has(key)) row.errors.push('Trùng mã/email/tên với một dòng khác trong file.');
    seen.add(key);
    if (kind === 'products') {
      const data: Record<string, any> = { sku: requireText('sku', 'SKU', 100, true), name: requireText('name', 'Tên sản phẩm', 255, true), price: integer(v.price), description: requireText('description', 'Mô tả', 4000), imageUrl: requireText('imageUrl', 'Ảnh chính', 2048) };
      if (!Number.isSafeInteger(data.price) || data.price < 0) row.errors.push('Giá bán phải là số nguyên không âm.');
      if (!isValidProductImage(data.imageUrl)) row.errors.push('Ảnh chính không hợp lệ.');
      const slug = text(v.categorySlug);
      if (slug) {
        const category = await Category.findOne({ slug, isActive: true }).session(session || null);
        if (!category) row.errors.push('Mã danh mục không tồn tại hoặc đã ẩn.'); else data.categoryId = category._id;
      } else data.categoryId = null;
      try {
        const specifications = text(v.specifications).split('\n').map(s => s.trim()).filter(Boolean).map(line => { const at = line.indexOf(':'); return { label: at < 1 ? '' : line.slice(0, at).trim(), value: at < 1 ? '' : line.slice(at + 1).trim() }; });
        Object.assign(data, parseProductDetails({ ...Object.fromEntries(['brand', 'modelName', 'condition', 'origin', 'warrantyText', 'bundle', 'variantGroup', 'variantLabel'].map(k => [k, text(v[k])])), specifications, gallery: text(v.gallery).split('\n').map(s => s.trim()).filter(Boolean) }));
      } catch (e) { row.errors.push((e as Error).message); }
      const existing = await Product.findOne({ sku: data.sku }).session(session || null);
      if (mode === 'create') {
        data.stock = v.stock === '' ? 0 : integer(v.stock);
        if (!Number.isSafeInteger(data.stock) || data.stock < 0) row.errors.push('Tồn đầu phải là số nguyên không âm.');
        if (existing) row.errors.push('SKU đã tồn tại. Dùng chế độ cập nhật để sửa sản phẩm.');
      } else if (!existing) row.errors.push('Không tìm thấy SKU để cập nhật.');
      else { row.targetId = existing.id; row.expectedUpdatedAt = existing.updatedAt; }
      row.data = data;
    } else if (kind === 'categories') {
      row.data = { name: requireText('name', 'Tên danh mục', 100, true), description: requireText('description', 'Mô tả', 4000) };
      if (mode === 'update') {
        const id = text(v.id), existing = mongoose.isValidObjectId(id) ? await Category.findById(id).session(session || null) : null;
        if (!existing) row.errors.push('ID danh mục không tồn tại.');
        else { row.targetId = existing.id; row.expectedUpdatedAt = existing.updatedAt; }
      }
    } else if (kind === 'staff') {
      row.data = { fullName: requireText('fullName', 'Họ tên', 100, true), email: text(v.email).toLowerCase(), phone: text(v.phone) };
      if (!validEmail(row.data.email)) row.errors.push('Email không hợp lệ.');
      if (row.data.phone && (typeof v.phone !== 'string' || !/^0\d{9}$/.test(row.data.phone))) row.errors.push('Số điện thoại phải là văn bản 10 chữ số bắt đầu bằng 0.');
      if (await User.exists({ email: row.data.email }).session(session || null)) row.errors.push('Email đã có tài khoản; không ghi đè hoặc nâng quyền.');
    } else {
      row.data = { sku: requireText('sku', 'SKU', 100, true), delta: integer(v.delta), reason: requireText('reason', 'Lý do', 500, true) };
      const existing = await Product.findOne({ sku: row.data.sku }).session(session || null);
      if (!Number.isSafeInteger(row.data.delta) || row.data.delta === 0 || Math.abs(row.data.delta) > 1000000) row.errors.push('Số lượng thay đổi phải là số nguyên khác 0, từ -1.000.000 đến 1.000.000.');
      if (!existing) row.errors.push('SKU không tồn tại.');
      else {
        row.targetId = existing.id; row.expectedUpdatedAt = existing.updatedAt; row.before = existing.stock; row.after = existing.stock + row.data.delta;
        if (!Number.isSafeInteger(row.after) || row.after! < 0) row.errors.push('Điều chỉnh làm tồn kho âm hoặc vượt giới hạn.');
      }
    }
    checked.push(row);
  }
  return checked;
}

export async function commitBatch(batchId: string, actorId: string, currentPassword: unknown, sessionId?: string) {
  if (!mongoose.isValidObjectId(batchId)) return excelFail(400, 'Mã phiên nhập không hợp lệ.');
  const batch = await ExcelBatch.findOne({ _id: batchId, actorId });
  if (!batch || batch.expiresAt.getTime() <= Date.now()) return excelFail(410, 'Phiên nhập hết hạn. Hãy tải file lên để kiểm tra lại.');
  if (batch.status !== 'READY') return excelFail(409, batch.status === 'COMMITTED' ? 'File này đã được nhập thành công.' : 'Cần sửa tất cả lỗi trước khi nhập.');
  const actor = await User.findOne({ _id: actorId, isActive: true }).select('+passwordHash');
  if (!actor || !['ADMIN', 'STAFF'].includes(actor.role) || (batch.kind === 'staff' && actor.role !== 'ADMIN')) return excelFail(403, 'Không có quyền nhập dữ liệu này.');
  if (batch.kind === 'staff' && (typeof currentPassword !== 'string' || Buffer.byteLength(currentPassword) > 72 || !await bcrypt.compare(currentPassword, actor.passwordHash))) return excelFail(403, 'Mật khẩu xác nhận của admin không đúng.');
  const credentials: { fullName: string; email: string; password: string; expiresAt: Date }[] = [], hashes: string[] = [];
  if (batch.kind === 'staff') for (const row of batch.rows as CheckedRow[]) {
    const password = 'BC!' + randomBytes(18).toString('base64url');
    credentials.push({ fullName: row.data.fullName, email: row.data.email, password, expiresAt: new Date(Date.now() + 86400000) });
    hashes.push(await bcrypt.hash(password, 12));
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const locked = await ExcelBatch.findOneAndUpdate({ _id: batchId, actorId, status: 'READY', expiresAt: { $gt: new Date() } }, { $set: { status: 'COMMITTED', count: batch.rows.length } }, { session });
      if (!locked) return excelFail(409, 'Phiên nhập đã được xử lý hoặc hết hạn.');
      const currentActor = await User.findOneAndUpdate({ _id: actorId, isActive: true, role: actor.role, $or: [{ authVersion: actor.authVersion || 0 }, ...(!actor.authVersion ? [{ authVersion: { $exists: false } }] : [])], passwordHash: actor.passwordHash }, { $set: { updatedAt: new Date() } }, { session });
      if (!currentActor) return excelFail(409, 'Tài khoản người nhập đã thay đổi. Hãy đăng nhập và kiểm tra lại file.');
      if (sessionId && !await LoginSession.findOneAndUpdate({ _id: sessionId, userId: actorId, authVersion: actor.authVersion || 0, expiresAt: { $gt: new Date() } }, { $set: { lastUsedAt: new Date() } }, { session })) return excelFail(409, 'Phiên đăng nhập đã bị thu hồi. Hãy đăng nhập lại.');
      const checked = await validateRows(batch.kind as ImportKind, batch.mode as ImportMode, batch.rows as CheckedRow[], session);
      if (checked.some(row => row.errors.length)) return excelFail(409, 'Dữ liệu đã thay đổi sau khi xem trước. Hãy tải file lên để kiểm tra lại.');
      await ExcelReceipt.create([{ kind: batch.kind, mode: batch.mode, digest: batch.digest, actorId, count: checked.length }], { session });
      for (let i = 0; i < checked.length; i++) {
        const row = checked[i], original = batch.rows[i] as CheckedRow;
        if (row.targetId && (row.targetId !== original.targetId || new Date(row.expectedUpdatedAt!).getTime() !== new Date(original.expectedUpdatedAt!).getTime())) return excelFail(409, `Dòng ${row.row}: dữ liệu đã thay đổi. Hãy kiểm tra lại file.`);
        if (batch.kind === 'products') {
          if (batch.mode === 'create') {
            const [product] = await Product.create([row.data], { session });
            if (product!.stock > 0) await StockMovement.create([{ productId: product!._id, actorId, delta: product!.stock, before: 0, after: product!.stock, reason: 'Tồn đầu từ file Excel' }], { session });
            await recordAudit(actorId, 'PRODUCT_CREATED', 'PRODUCT', product!._id, 'Thêm sản phẩm bằng Excel.', auditChanges(null, product, ['name', 'sku', 'price', 'stock']), session);
          } else {
            const before = await Product.findByIdAndUpdate(row.targetId, { $set: row.data }, { returnDocument: 'before', session, runValidators: true });
            await recordAudit(actorId, 'PRODUCT_UPDATED', 'PRODUCT', row.targetId!, 'Cập nhật sản phẩm bằng Excel.', auditChanges(before, row.data, Object.keys(row.data)), session);
          }
        } else if (batch.kind === 'categories') {
          if (batch.mode === 'create') await Category.create([{ ...row.data, slug: await availableCategorySlug(row.data.name, session) }], { session });
          else await Category.findByIdAndUpdate(row.targetId, { $set: row.data }, { session, runValidators: true });
        } else if (batch.kind === 'staff') {
          const [user] = await User.create([{ ...row.data, role: 'STAFF', passwordHash: hashes[i], mustChangePassword: true, temporaryPasswordExpiresAt: credentials[i].expiresAt, provisionedBy: actorId }], { session });
          await recordAudit(actorId, 'STAFF_CREATED', 'USER', user!._id, 'Tạo nhân viên bằng Excel; yêu cầu đổi mật khẩu.', auditChanges(null, user, ['fullName', 'email', 'role', 'mustChangePassword']), session);
        } else {
          const product = await Product.findOneAndUpdate({ _id: row.targetId, stock: row.before }, { $inc: { stock: row.data.delta } }, { returnDocument: 'after', session, runValidators: true });
          if (!product) return excelFail(409, `Dòng ${row.row}: tồn kho đã thay đổi. Hãy kiểm tra lại file.`);
          await StockMovement.create([{ productId: product._id, actorId, delta: row.data.delta, before: row.before, after: product.stock, reason: row.data.reason }], { session });
          await recordAudit(actorId, 'STOCK_ADJUSTED', 'PRODUCT', product._id, row.data.reason, [{ field: 'stock', before: row.before!, after: product.stock }], session);
        }
      }
      await recordAudit(actorId, 'EXCEL_IMPORTED', 'EXCEL_BATCH', batch._id, `Nhập Excel ${batch.kind}/${batch.mode}: ${checked.length} dòng.`, [], session);
    });
    return { count: batch.rows.length, credentials };
  } catch (e: any) {
    if (e?.code === 11000) return excelFail(409, 'File đã được nhập hoặc dữ liệu trùng với một thay đổi khác. Hãy kiểm tra lại.');
    throw e;
  } finally { await session.endSession(); }
}
