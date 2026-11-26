import ExcelJS from 'exceljs';
import { validateXlsxArchive } from './zip-guard';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_ROWS = 500;
export type ImportKind = 'products' | 'categories' | 'staff' | 'inventory';
export type ImportMode = 'create' | 'update';
export type Column = { key: string; header: string; width?: number; format?: string; help?: string };
const c = (key: string, header: string, help = '', format = '@', width = 25): Column => ({ key, header, help, format, width });
export const productColumns = [
  c('sku', 'SKU', 'Mã sản phẩm duy nhất, dùng để đối chiếu khi cập nhật.'), c('name', 'Tên sản phẩm', 'Bắt buộc.'),
  c('price', 'Giá bán', 'Số nguyên VND, không âm.', '#,##0'), c('categorySlug', 'Mã danh mục', 'Đường dẫn danh mục đang hoạt động; để trống nếu không có.'),
  c('brand', 'Thương hiệu'), c('description', 'Mô tả', '', '@', 45), c('imageUrl', 'Ảnh chính', 'URL HTTPS hoặc đường dẫn ảnh của cửa hàng.', '@', 40),
  c('modelName', 'Mã model'), c('condition', 'Tình trạng'), c('origin', 'Xuất xứ'), c('warrantyText', 'Bảo hành'), c('bundle', 'Phụ kiện đi kèm'),
  c('variantGroup', 'Nhóm phiên bản'), c('variantLabel', 'Tên phiên bản'), c('specifications', 'Thông số', 'Mỗi dòng Tên: Giá trị.', '@', 45), c('gallery', 'Bộ ảnh', 'Mỗi dòng một URL, tối đa 12 ảnh.', '@', 40),
];
export function importColumns(kind: ImportKind, mode: ImportMode): Column[] {
  if (kind === 'products') return mode === 'create' ? [...productColumns, c('stock', 'Tồn đầu', 'Số nguyên không âm; chỉ có ở chế độ thêm mới.', '#,##0')] : productColumns;
  if (kind === 'categories') return [...(mode === 'update' ? [c('id', 'ID danh mục', 'Lấy từ file xuất danh mục.')] : []), c('name', 'Tên danh mục'), c('description', 'Mô tả')];
  if (kind === 'staff') return [c('fullName', 'Họ tên'), c('email', 'Email'), c('phone', 'Số điện thoại', 'Định dạng Text, 10 chữ số bắt đầu bằng 0; có thể để trống.')];
  return [c('sku', 'SKU'), c('delta', 'Số lượng thay đổi', 'Số nguyên khác 0; số dương tăng kho, số âm giảm kho.', '#,##0'), c('reason', 'Lý do', 'Bắt buộc, tối đa 500 ký tự.', '@', 45)];
}
export function makeWorkbook(columns: Column[], rows: Record<string, unknown>[], title = 'DuLieu') {
  const book = new ExcelJS.Workbook(); book.creator = 'BerylCore'; book.created = new Date();
  const sheet = book.addWorksheet(title, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map(col => ({ header: col.header, key: col.key, width: col.width || 25, style: { numFmt: col.format || '@', alignment: { vertical: 'top', wrapText: true } } }));
  rows.forEach(row => { sheet.addRow(columns.map(col => {
    const value = row[col.key];
    if (value instanceof Date) return value;
    return typeof value === 'number' || typeof value === 'boolean' ? value : value == null ? '' : String(value);
  })); });
  sheet.getRow(1).height = 32;
  sheet.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2456DE' } }; });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: columns.length } };
  sheet.eachRow((row, n) => { if (n > 1) row.height = 30; });
  return book;
}
export function templateWorkbook(kind: ImportKind, mode: ImportMode) {
  const columns = importColumns(kind, mode), book = makeWorkbook(columns, []);
  const help = book.addWorksheet('HuongDan'); help.columns = [{ header: 'Nội dung', key: 'name', width: 28 }, { header: 'Hướng dẫn', key: 'help', width: 100 }];
  help.addRow({ name: 'Cách nhập', help: `Điền dữ liệu từ dòng 2 của sheet DuLieu. Tối đa ${MAX_ROWS} dòng, file .xlsx tối đa 5 MB. Không nhập công thức.` });
  help.addRow({ name: 'Chế độ', help: mode === 'create' ? 'Chỉ thêm mới; dữ liệu trùng sẽ báo lỗi, không ghi đè.' : 'Cập nhật theo SKU hoặc ID danh mục. Ô trống xóa nội dung tùy chọn. Không thay đổi tồn kho bằng cập nhật sản phẩm.' });
  help.addRow({ name: 'Xác nhận', help: 'Tải lên để kiểm tra trước. Chỉ ghi dữ liệu sau khi tất cả dòng hợp lệ và bạn xác nhận. Không nhập lại cùng một nội dung đã thành công.' });
  if (kind === 'staff') help.addRow({ name: 'Tài khoản nhân viên', help: 'Chỉ tạo STAFF. Admin xác nhận bằng mật khẩu hiện tại. Mật khẩu tạm riêng từng người chỉ được tải ở lần tạo thành công, hạn 24 giờ và bắt buộc đổi khi đăng nhập.' });
  if (kind === 'categories') help.addRow({ name: 'Đường dẫn', help: 'Thêm mới tự sinh slug từ tên. Cập nhật tên giữ nguyên đường dẫn cũ.' });
  columns.forEach(col => help.addRow({ name: col.header, help: col.help || 'Văn bản; để trống nếu không có thông tin (trừ trường bắt buộc).' }));
  help.getRow(1).font = { bold: true }; help.getColumn(2).alignment = { wrapText: true, vertical: 'top' }; help.eachRow(row => { row.height = 45; });
  return book;
}
export async function readImport(buffer: Buffer, kind: ImportKind, mode: ImportMode) {
  validateXlsxArchive(buffer);
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(buffer as any); } catch { throw new Error('Không đọc được file .xlsx. Hãy tải và dùng file mẫu.'); }
  const sheet = book.getWorksheet('DuLieu');
  if (!sheet) throw new Error('Thiếu sheet DuLieu. Hãy dùng file mẫu.');
  const columns = importColumns(kind, mode);
  const readonly = mode === 'update' ? kind === 'products' ? ['ID sản phẩm', 'Tồn kho', 'Trạng thái'] : kind === 'categories' ? ['Mã danh mục', 'Trạng thái'] : [] : [];
  const headers: string[] = [];
  for (let i = 1; i <= sheet.columnCount; i++) { const value = sheet.getRow(1).getCell(i).value; if (typeof value !== 'string') throw new Error('Tiêu đề cột không hợp lệ.'); headers.push(value); }
  if (new Set(headers).size !== headers.length || columns.some(col => !headers.includes(col.header)) || headers.some(h => !columns.some(c => c.header === h) && !readonly.includes(h))) throw new Error('Các cột không đúng file mẫu hoặc sai chế độ nhập.');
  if (sheet.rowCount > MAX_ROWS + 1) throw new Error(`Mỗi lần nhập tối đa ${MAX_ROWS} dòng. Hãy chia nhỏ file.`);
  const rows: { row: number; values: Record<string, string | number>; errors: string[] }[] = [];
  for (let n = 2; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n), values: Record<string, string | number> = {}, errors: string[] = [];
    let populated = false;
    columns.forEach(col => {
      const value = row.getCell(headers.indexOf(col.header) + 1).value;
      if (value != null && value !== '') populated = true;
      if (value == null) values[col.key] = '';
      else if (typeof value === 'string') { values[col.key] = value.trim(); if (value.length > 16000) errors.push(`${col.header}: nội dung quá dài.`); }
      else if (typeof value === 'number' && Number.isFinite(value)) values[col.key] = value;
      else { values[col.key] = ''; errors.push(`${col.header}: chỉ nhập văn bản hoặc số, không dùng công thức/liên kết/đối tượng.`); }
    });
    if (populated) rows.push({ row: n, values, errors });
  }
  if (!rows.length) throw new Error('File chưa có dữ liệu để nhập.');
  return rows;
}
