import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { excelRequest } from './api';
import { Dialog, FormError } from './components';
import { useSession } from './context';
import { ExcelSheet, type SheetColumn } from './ExcelSheet';
import './excel-tools.css';

type Kind = 'products' | 'categories' | 'staff' | 'inventory' | 'orders' | 'payments' | 'revenue' | 'shipping' | 'reviews' | 'coupons';
type Preview = { id: string; status: string; count: number; valid: number; rows: { row: number; values: Record<string, unknown>; errors: string[]; before?: number; after?: number }[] };
const names: Record<Kind, string> = { products: 'sản phẩm', categories: 'danh mục', staff: 'nhân viên', inventory: 'điều chỉnh kho', orders: 'đơn hàng', payments: 'thanh toán', revenue: 'doanh thu', shipping: 'vận chuyển', reviews: 'đánh giá', coupons: 'mã giảm giá' };
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ExcelTools({ kind, ids = [], filters = {}, allowImport = false, extraActions }: { kind: Kind; ids?: string[]; filters?: Record<string, unknown>; allowImport?: boolean; extraActions?: ReactNode }) {
  const { user, notify } = useSession(), query = useQueryClient();
  const [open, setOpen] = useState(false), [mode, setMode] = useState('create'), [scope, setScope] = useState('filtered');
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState<number | null>(null), [credentials, setCredentials] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false), [columns, setColumns] = useState<SheetColumn[]>([]), [draftRows, setDraftRows] = useState<string[][]>([]), [maxRows, setMaxRows] = useState(500);
  const canImport = allowImport && (kind !== 'staff' || user?.role === 'ADMIN');
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const exportFile = () => run(async () => { const blob = await excelRequest<Blob>(`/${kind}/export`, { body: { scope, ids, filters } }); download(blob, `berylcore-${kind}.xlsx`); notify('Đã xuất file Excel.'); });
  const template = () => run(async () => { const blob = await excelRequest<Blob>(`/${kind}/template?mode=${mode}`); download(blob, `mau-${kind}-${mode}.xlsx`); });
  const openSheet = () => run(async () => {
    const result = await excelRequest<{ data: { columns: SheetColumn[]; maxRows: number } }>(`/${kind}/columns?mode=${mode}`, { json: true });
    setColumns(result.data.columns); setMaxRows(result.data.maxRows);
    if (!draftRows.length) setDraftRows(Array.from({ length: 5 }, () => result.data.columns.map(() => '')));
    setSheetOpen(true);
  });
  const useSheet = () => run(async () => {
    const blob = await excelRequest<Blob>(`/${kind}/draft?mode=${mode}`, { body: { rows: draftRows } });
    setFile(new File([blob], `bang-nhap-${kind}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    setPreview(null); setSheetOpen(false);
  });
  const check = () => run(async () => {
    if (!file || !/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw new Error('Chọn file .xlsx tối đa 5 MB.');
    const result = await excelRequest<{ data: Preview }>(`/${kind}/preview?mode=${mode}`, { file, json: true }); setPreview(result.data);
  });
  const commit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    void run(async () => {
      const result = await excelRequest<{ data: { count: number; credentialsFile?: string } }>(`/batches/${preview!.id}/commit`, { body: { currentPassword: f.get('currentPassword') }, json: true });
      setDone(result.data.count); setCredentials(result.data.credentialsFile || null); setPreview(null); setFile(null); await query.invalidateQueries(); notify(`Đã nhập thành công ${result.data.count} dòng.`);
    });
  };
  return <div className="excel-tools"><div className="excel-export-row"><label>Phạm vi xuất Excel<select aria-label={`Phạm vi xuất Excel ${names[kind]}`} value={scope} disabled={busy} onChange={e => setScope(e.target.value)}><option value="filtered">Toàn bộ kết quả đang lọc</option>{kind !== 'revenue' && <option value="page">Trang hiện tại</option>}</select></label><button className="button outline small" disabled={busy || (scope === 'page' && !ids.length)} onClick={exportFile}>Xuất Excel{kind === 'staff' ? ' nhân viên' : ''}</button>{extraActions}{canImport && <button className="button outline small" disabled={busy} onClick={() => { setOpen(true); setError(''); setDone(null); setPreview(null); setFile(null); setDraftRows([]); }}>Nhập Excel{kind === 'inventory' ? ' điều chỉnh kho' : ''}</button>}</div>{!open && <FormError error={error}/>}
    {kind === 'staff' && <p className="muted excel-caption">File xuất chỉ gồm tài khoản nhân viên, không chứa mật khẩu.</p>}
    {kind === 'revenue' && <p className="muted excel-caption">Doanh thu đã thu theo ngày UTC, chỉ gồm thanh toán đã xác nhận.</p>}
    {open && sheetOpen && <ExcelSheet title={names[kind]} columns={columns} rows={draftRows} setRows={rows => { setDraftRows(rows); setFile(null); setPreview(null); setError(''); }} maxRows={maxRows} busy={busy} error={error} close={() => { setSheetOpen(false); setError(''); }} useSheet={useSheet}/>}
    {open && !sheetOpen && <Dialog title={`Nhập Excel ${names[kind]}`} close={() => { if (!busy) { setOpen(false); setCredentials(null); setError(''); } }}>
      {done !== null ? <><p role="status">Đã nhập thành công <strong>{done} dòng</strong>. Dữ liệu đã được cập nhật.</p>{credentials && <div className="subtle-box"><p>Thông tin đăng nhập tạm chỉ có trong lần này. Tải file, chuyển riêng cho đúng nhân viên và bảo quản file. Mật khẩu tạm có hạn 24 giờ; nhân viên phải đổi mật khẩu khi đăng nhập.</p><button className="button" onClick={() => { const bytes = Uint8Array.from(atob(credentials), c => c.charCodeAt(0)); download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'nhan-vien-thong-tin-tam.xlsx'); }}>Tải thông tin đăng nhập tạm</button></div>}<button className="button outline" onClick={() => { setOpen(false); setCredentials(null); }}>Hoàn tất</button></> : <>
        <p>Bấm <strong>Thêm</strong> để nhập trên bảng có sẵn, hoặc tải file mẫu và điền sheet <strong>DuLieu</strong>. Tối đa 500 dòng/file, 5 MB. Kiểm tra dữ liệu trước khi xác nhận nhập.</p>
        {(kind === 'products' || kind === 'categories') && <label>Chế độ nhập<select aria-label="Chế độ nhập" value={mode} disabled={busy} onChange={e => { setMode(e.target.value); setPreview(null); setFile(null); setDraftRows([]); }}><option value="create">Thêm mới</option><option value="update">Cập nhật theo {kind === 'products' ? 'SKU' : 'ID danh mục'}</option></select></label>}
        {mode === 'update' && <p className="subtle-box">Ô trống xóa thông tin tùy chọn. Cập nhật sản phẩm giữ nguyên tồn kho; cập nhật tên danh mục giữ nguyên đường dẫn.</p>}
        {kind === 'inventory' && <p className="subtle-box">Nhập số lượng tăng hoặc giảm theo SKU, kèm lý do. Hệ thống ghi lịch sử và kiểm tra tồn kho không âm.</p>}
        <div className="excel-create-actions"><button className="button small" disabled={busy} onClick={openSheet}>Thêm</button><button className="button outline small" disabled={busy} onClick={template}>Tải file mẫu</button></div>
        <label>File Excel .xlsx<input key={mode} type="file" accept=".xlsx" disabled={busy} onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); setError(''); }}/></label>
        {file && <p role="status" className="excel-selected-file">File sẵn sàng: <strong>{file.name}</strong></p>}
        <button className="button" disabled={busy || !file} onClick={check}>{busy ? 'Đang xử lý…' : 'Kiểm tra file'}</button>
        {preview && <section className="excel-preview"><h3>Kết quả kiểm tra</h3><p role="status">{preview.count} dòng · {preview.valid} hợp lệ · {preview.count - preview.valid} có lỗi</p>{preview.status === 'INVALID' && <><p>Sửa các lỗi trong file gốc rồi tải lên kiểm tra lại. Chưa có dữ liệu nào được ghi.</p><button className="button outline small" disabled={busy} onClick={() => run(async () => download(await excelRequest<Blob>(`/batches/${preview.id}/errors`), 'loi-nhap-excel.xlsx'))}>Tải danh sách lỗi</button></>}
          <div className="table-wrap excel-preview-table" tabIndex={0} role="region" aria-label="Xem trước dữ liệu nhập Excel"><table><thead><tr><th>Dòng</th><th>Thông tin</th>{kind === 'inventory' && <th>Tồn trước → sau</th>}<th>Kết quả</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.row}><td>{row.row}</td><td>{Object.values(row.values).filter(v => v !== '').slice(0, 4).map(String).join(' · ')}</td>{kind === 'inventory' && <td>{row.before} → {row.after}</td>}<td>{row.errors.length ? row.errors.join(' ') : 'Hợp lệ'}</td></tr>)}</tbody></table></div>
          {preview.status === 'READY' && <form onSubmit={commit}>{kind === 'staff' && <label>Mật khẩu hiện tại của admin<input name="currentPassword" type="password" autoComplete="current-password" maxLength={72} required disabled={busy}/></label>}<p>Nhập toàn bộ {preview.count} dòng vào hệ thống? Phiên kiểm tra có hiệu lực 30 phút.</p><button className="button" disabled={busy}>{busy ? 'Đang nhập dữ liệu…' : `Xác nhận nhập ${preview.count} dòng`}</button></form>}
        </section>}
        <FormError error={error}/>
      </>}
    </Dialog>}
  </div>;
}
