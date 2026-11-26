import { Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { Dialog, FormError } from './components';
import type { Review } from './types';
export function ReviewEditor({ review, close }: { review: Review; close: () => void }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [conflict, setConflict] = useState(false); const client = useQueryClient();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (busy || conflict) return; setBusy(true); setError(''); const f = new FormData(e.currentTarget);
    try { await api(`/reviews/${review._id}`, 'PATCH', { rating: Number(f.get('rating')), title: f.get('title'), comment: f.get('comment'), version: review.__v }); await client.invalidateQueries({queryKey:['my-reviews']}); await client.invalidateQueries({queryKey:['product-reviews']}); await client.invalidateQueries({queryKey:['review-summary']}); close(); }
    catch(e) { if (e instanceof ApiError && e.status === 409) { setConflict(true); await client.invalidateQueries({ queryKey: ['my-reviews'] }); setError('Đánh giá đã thay đổi. Đóng cửa sổ này và mở lại để chỉnh sửa bản mới nhất.'); } else setError((e as Error).message); } finally { setBusy(false); }
  };
  return <Dialog title="Sửa đánh giá" close={close}><form onSubmit={submit}><label>Số sao<select name="rating" defaultValue={review.rating}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} sao</option>)}</select></label><label>Tiêu đề<input name="title" defaultValue={review.title} required minLength={3} maxLength={120}/></label><label>Cảm nhận của bạn<textarea name="comment" defaultValue={review.comment} required minLength={10} maxLength={2000} rows={4}/></label><FormError error={error}/><button className="button" disabled={busy || conflict}><Save size={16} aria-hidden="true"/>{busy?'Đang lưu…':'Lưu đánh giá'}</button></form></Dialog>;
}
