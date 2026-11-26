import {RefundStatus,RefundConfirmation} from './RefundStatus';
import type {Payment} from './types';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Banknote, PackageCheck, MapPin } from 'lucide-react';
import { api, money } from './api';
import { Badge, PaymentBadge, Dialog, FormError, State } from './components';

type Row = Record<string, any>;
export const paymentMethodLabel = (method: string) => ({ COD: 'Tiền mặt khi nhận hàng (COD)', SEPAY: 'Chuyển khoản SePay', VNPAY: 'Thanh toán VNPAY' }[method] || method || 'Chưa xác định');

export function OrderApproval({ order, close }: { order: Row; close: () => void }) {
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [intent, setIntent] = useState<'order' | 'payment' | null>(null);
  const current = useQuery({ queryKey: ['approval-order', order._id], queryFn: () => api<Row[]>(`/admin/orders?search=${order._id}&limit=50`), refetchInterval: 5000 });
  const o = current.data?.data.find(item => item._id === order._id) || order;
  const payment = useQuery({ queryKey: ['approval-payment', order._id], queryFn: () => api<Row>(`/admin/payments/orders/${order._id}`), refetchInterval: 5000 });
  const p = payment.data?.data;
  const [syncMessage, setSyncMessage] = useState('');
  const reconcile = async () => {
    if (busy) return;
    setBusy(true); setError(''); setSyncMessage('');
    try { const result = await api<{message:string}>(`/admin/payments/orders/${o._id}/reconcile`, 'POST'); setSyncMessage(result.data.message); await cache.invalidateQueries(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const checked = useRef('');
  useEffect(() => {
    if (o.paymentMethod === 'SEPAY' && p?.status === 'PENDING' && checked.current !== o._id) {
      checked.current = o._id;
      void reconcile();
    }
  }, [o._id, o.paymentMethod, p?.status]);
  const confirm = async () => {
    if (!intent || busy) return;
    setBusy(true); setError('');
    try {
      await api(intent === 'order' ? `/admin/orders/${o._id}/status` : `/admin/payments/orders/${o._id}/confirm`, 'PATCH', intent === 'order' ? { status: 'CONFIRMED' } : undefined);
      setIntent(null); await cache.invalidateQueries();
    } catch (e) { setError((e as Error).message); await Promise.all([current.refetch(), payment.refetch()]); }
    finally { setBusy(false); }
  };
  return <Dialog title="Duyệt đơn" className="order-approval-dialog" close={close}>
    <p><strong>Đơn #{o._id.slice(-8)}</strong> · <Badge status={o.status}/></p>
    <h3 className="icon-heading"><MapPin size={18}/>Người nhận</h3>
    <p>{o.shippingAddress?.fullName} · {o.shippingAddress?.phone}<br/>{o.shippingAddress?.detail}, {o.shippingAddress?.ward}, {o.shippingAddress?.province}</p>
    {o.items.map((i: Row) => <p key={i.productId}>{i.name} × {i.quantity} — {money(i.subtotal)}</p>)}
    <p><strong>Tổng đơn: {money(o.totalAmount)}</strong></p>
    <section className="subtle-box"><h3 className="icon-heading"><CreditCard size={20}/>Thanh toán</h3>
      <p>{paymentMethodLabel(o.paymentMethod)}</p>
      <State loading={payment.isLoading} error={payment.error} retry={() => payment.refetch()}>{p && <>
        <p><PaymentBadge status={p.status}/> · {money(p.amount)}</p>
        {o.paymentMethod === 'SEPAY' && p.status === 'PENDING' && <button className="button outline" disabled={busy} onClick={reconcile}>Kiểm tra kết quả với SePay</button>}
        {syncMessage && <p role="status">{syncMessage}</p>}
        {p.gatewayTransactionNo && <p>Mã giao dịch: {p.gatewayTransactionNo}</p>}
        <RefundStatus payment={p as Payment}/><RefundConfirmation payment={p as Payment} orderId={o._id}/>{p.paidAt && <p>Đã thu lúc: {new Date(p.paidAt).toLocaleString('vi-VN')}</p>}
        {p.confirmedBy && <p>Người xác nhận: {typeof p.confirmedBy === 'object' ? p.confirmedBy.fullName || p.confirmedBy._id : p.confirmedBy}</p>}
        {o.paymentMethod === 'COD' ? <p>COD được duyệt đơn trước khi thu tiền. Chỉ xác nhận thu sau khi giao thành công và thực sự nhận đủ tiền.</p> : <p>Kết quả thanh toán được cập nhật tự động từ cổng thanh toán.</p>}
        {o.paymentMethod === 'COD' && o.status === 'DELIVERED' && p.status === 'PENDING' && <button className="button" disabled={busy} onClick={() => setIntent('payment')}><Banknote size={18}/>Xác nhận đã thu tiền COD</button>}
      </>}</State>
    </section>
    <FormError error={error || current.error?.message || ''}/>
    {o.status === 'PENDING' && <><button className="button" disabled={busy || !p || !!payment.error || !!current.error || (o.paymentMethod !== 'COD' && p.status !== 'PAID')} onClick={() => setIntent('order')}><PackageCheck size={18}/>Xác nhận đơn hàng</button>{o.paymentMethod !== 'COD' && p?.status !== 'PAID' && <p>Chờ thanh toán thành công trước khi xác nhận đơn.</p>}</>}
    {intent && <div className="subtle-box"><p>{intent === 'payment' ? 'Bạn xác nhận đã thực sự nhận đủ tiền COD của đơn này?' : 'Xác nhận tiếp nhận và chuẩn bị đơn hàng này?'}</p><div className="inline-actions"><button className="button" disabled={busy} onClick={confirm}>{busy ? 'Đang lưu…' : 'Đồng ý xác nhận'}</button><button className="button outline" disabled={busy} onClick={() => setIntent(null)}>Quay lại</button></div></div>}
  </Dialog>;
}
