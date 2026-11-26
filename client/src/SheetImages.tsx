import { useRef } from 'react';

const previewable = (source: string) => {
  if (/^\/api\/media\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(source)) return true;
  if (/^\/images\/[a-zA-Z0-9_/-]+\.(png|jpe?g|webp|avif)$/i.test(source) && !source.includes('..')) return true;
  try { const url = new URL(source); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
};
export function SheetImages({ value, gallery, row, disabled, choose, remove }: {
  value: string; gallery: boolean; row: number; disabled: boolean;
  choose: (files: File[]) => void; remove: (index: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const sources = gallery ? value.split('\n').map(v => v.trim()).filter(Boolean) : value.trim() ? [value.trim()] : [];
  return <div className="sheet-images">
    <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple={gallery} aria-label={`File ${gallery ? 'bộ ảnh' : 'ảnh chính'}, dòng ${row}`} disabled={disabled} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) choose(files); }}/>
    <div className="sheet-image-actions"><button type="button" className="button outline small" title="PNG, JPEG, WebP; tối đa 5 MB mỗi ảnh" aria-label={`Chọn ${gallery ? 'ảnh bộ ảnh' : 'ảnh chính'} từ máy, dòng ${row}`} disabled={disabled || (gallery && sources.length >= 12)} onClick={() => input.current?.click()}>Chọn ảnh từ máy</button>{gallery && sources.length > 0 && <small>{sources.length}/12 ảnh</small>}</div>
    {sources.length > 0 && <div className="sheet-image-previews">{sources.map((source, i) => <div className="sheet-image-preview" key={`${i}:${source}`}>
      {previewable(source) ? <img src={source} alt={`${gallery ? 'Ảnh bộ ảnh' : 'Ảnh chính'} ${i + 1}, dòng ${row}`} loading="lazy" referrerPolicy="no-referrer"/> : <span>Ảnh {i + 1}</span>}
      <button type="button" aria-label={gallery ? `Xóa ảnh ${i + 1} trong bộ ảnh, dòng ${row}` : `Xóa ảnh chính, dòng ${row}`} disabled={disabled} onClick={() => remove(i)}>×</button>
    </div>)}</div>}
  </div>;
}
