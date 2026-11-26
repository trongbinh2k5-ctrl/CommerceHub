import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Dialog, FormError } from './components';
import { uploadImage } from './api';
import { SheetImages } from './SheetImages';
import './excel-sheet.css';

export type SheetColumn = { key: string; header: string; format?: string; help?: string };
const letters = (index: number): string => index >= 26 ? letters(Math.floor(index / 26) - 1) + letters(index % 26) : String.fromCharCode(65 + index);
// Parse tab-separated clipboard cells, including quoted multiline Excel values.
export function clipboardRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && (quoted || value === '')) {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (ch === '\t' || ch === '\n' || ch === '\r')) {
      row.push(value); value = '';
      if (ch !== '\t') { rows.push(row); row = []; if (ch === '\r' && text[i + 1] === '\n') i++; }
    } else value += ch;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}
export function ExcelSheet({ title, columns, rows, setRows, maxRows, busy, error, close, useSheet }: {
  title: string; columns: SheetColumn[]; rows: string[][]; setRows: (rows: string[][]) => void;
  maxRows: number; busy: boolean; error: string; close: () => void; useSheet: () => void;
}) {
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false), [uploadError, setUploadError] = useState('');
  const uploadPending = useRef(false);
  const locked = busy || uploading;
  const filled = rows.filter(row => row.some(value => value.trim())).length;
  const change = (r: number, c: number, value: string) => { const next = rows.map(row => [...row]); next[r][c] = value; setRows(next); setNotice(''); };
  const chooseImages = async (files: File[], r: number, c: number, gallery: boolean) => {
    if (busy || uploadPending.current) return;
    setUploadError(''); setNotice('');
    const existing = gallery ? [...new Set(rows[r][c].split('\n').map(v => v.trim()).filter(Boolean))] : [];
    if ((!gallery && files.length > 1) || (gallery && existing.length + files.length > 12)) { setUploadError(gallery ? 'Bộ ảnh tối đa 12 ảnh. Hãy chọn ít ảnh hơn hoặc xóa ảnh cũ.' : 'Ảnh chính chỉ chọn một ảnh.'); return; }
    if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { setUploadError('Chỉ nhận PNG, JPEG hoặc WebP tối đa 5 MB mỗi ảnh. Chưa tải ảnh nào trong lần chọn này.'); return; }
    uploadPending.current = true; setUploading(true);
    const urls = [...existing]; let uploaded = 0;
    try {
      for (const file of files) {
        setNotice(`Đang tải ảnh ${uploaded + 1}/${files.length} cho dòng ${r + 2}…`);
        urls.push(await uploadImage(file)); uploaded++;
        change(r, c, gallery ? urls.join('\n') : urls[0]);
      }
      setNotice(`Đã tải ${uploaded} ảnh cho dòng ${r + 2}. Tiếp tục “Dùng bảng này” rồi kiểm tra file để lưu sản phẩm.`);
    } catch (e) { setUploadError(`${(e as Error).message}${uploaded ? ` Đã giữ ${uploaded} ảnh tải thành công trong ô.` : ''}`); setNotice(''); }
    finally { uploadPending.current = false; setUploading(false); }
  };
  const paste = (e: ClipboardEvent<HTMLTextAreaElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !/[\r\n]/.test(text)) return;
    e.preventDefault(); const pasted = clipboardRows(text);
    if (r + pasted.length > maxRows || pasted.some(row => c + row.length > columns.length) || pasted.some(row => row.some(value => value.length > 16000))) { setNotice('Vùng dán vượt số cột, số dòng hoặc độ dài ô cho phép. Chưa thay đổi dữ liệu.'); return; }
    const next = rows.map(row => [...row]); while (next.length < r + pasted.length) next.push(columns.map(() => ''));
    pasted.forEach((row, dr) => row.forEach((value, dc) => { next[r + dr][c + dc] = value; })); setRows(next); setNotice(`Đã dán ${pasted.length} dòng. Bấm “Dùng bảng này” để tiếp tục kiểm tra file.`);
  };
  const key = (e: KeyboardEvent<HTMLTextAreaElement>, r: number, c: number) => {
    let targetR = r, targetC = c;
    if (e.key === 'Enter' && !e.shiftKey) targetR++;
    else if (e.key === 'Tab') { targetC += e.shiftKey ? -1 : 1; if (targetC >= columns.length) { targetC = 0; targetR++; } else if (targetC < 0) { targetC = columns.length - 1; targetR--; } }
    else return;
    if (targetR < 0 || targetR >= rows.length) return;
    e.preventDefault(); e.currentTarget.closest('table')?.querySelector<HTMLTextAreaElement>(`textarea[data-row="${targetR}"][data-column="${targetC}"]`)?.focus();
  };
  return <Dialog title={`Bảng Excel — ${title}`} className="excel-sheet-dialog" close={() => { if (!locked) close(); }}>
    <p>Nhập trực tiếp hoặc sao chép vùng dữ liệu từ Excel rồi dán bằng Ctrl + V. Mỗi dòng là một mục; Tab chuyển ô, Enter xuống dòng, Shift + Enter xuống dòng trong ô.</p>
    <div className="sheet-toolbar"><button type="button" className="button outline small" disabled={locked || rows.length >= maxRows} onClick={() => setRows([...rows, columns.map(() => '')])}>Thêm dòng</button><span>{filled} dòng có dữ liệu · tối đa {maxRows} dòng</span></div>
    {columns.some(col=>col.key==="imageUrl") && <p className="sheet-image-hint">Ảnh PNG, JPEG, WebP · tối đa 5 MB/ảnh · bộ ảnh tối đa 12 ảnh. Cuộn ngang để chọn ảnh tại từng dòng.</p>}
    <div className="sheet-grid-scroll" tabIndex={0} role="region" aria-label="Bảng nhập dữ liệu Excel"><table className="sheet-grid"><thead><tr><th scope="col" className="sheet-index">#</th>{columns.map((col, c) => <th scope="col" key={col.key} title={col.help}><span className="sheet-letter">{letters(c)}</span>{col.header}</th>)}<th scope="col">Thao tác</th></tr></thead><tbody>{rows.map((row, r) => <tr key={r}><th scope="row" className="sheet-index">{r + 2}</th>{columns.map((col, c) => <td key={col.key}><textarea className={col.key === "imageUrl" || col.key === "gallery" ? "sheet-image-url" : undefined} aria-label={`${col.header}, dòng ${r + 2}`} data-row={r} data-column={c} value={row[c]} rows={2} disabled={locked} maxLength={16000} spellCheck={false} inputMode={col.format !== '@' ? 'numeric' : undefined} onChange={e => change(r, c, e.target.value)} onPaste={e => paste(e, r, c)} onKeyDown={e => key(e, r, c)}/>{(col.key === "imageUrl" || col.key === "gallery") && <SheetImages value={row[c]} gallery={col.key === "gallery"} row={r + 2} disabled={locked} choose={files => { void chooseImages(files, r, c, col.key === "gallery"); }} remove={index => { setUploadError(""); change(r, c, col.key === "gallery" ? row[c].split("\n").map(v=>v.trim()).filter(Boolean).filter((_,i)=>i!==index).join("\n") : ""); }}/>}</td>)}<td><button type="button" className="text-link" aria-label={`Xóa dòng ${r + 2}`} disabled={locked} onClick={() => setRows(rows.length === 1 ? [columns.map(() => '')] : rows.filter((_, i) => i !== r))}>Xóa</button></td></tr>)}</tbody></table></div>
    {notice && <p role="status">{notice}</p>}<FormError error={uploadError || error}/>
    <div className="sheet-footer"><button type="button" className="button outline" disabled={locked} onClick={close}>Quay lại</button><button type="button" className="button" disabled={locked || !filled} onClick={useSheet}>{uploading ? 'Đang tải ảnh…' : busy ? 'Đang chuẩn bị file…' : 'Dùng bảng này'}</button></div>
  </Dialog>;
}
