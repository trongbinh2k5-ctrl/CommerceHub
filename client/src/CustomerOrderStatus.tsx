import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CreditCard, Clock } from 'lucide-react';
import { api } from './api';
import { Badge } from './components';
import type { Order, Payment } from './types';
import {RefundStatus} from './RefundStatus';

export function CustomerOrderStatus({ order, action = false }: { order: Order; action?: boolean }) {
  const onlinePending = order.status === 'PENDING' && ['SEPAY', 'VNPAY'].includes(order.paymentMethod);
  const payment = useQuery({ queryKey: ['payment', order._id], queryFn: () => api<Payment>(`/payments/orders/${order._id}`), enabled: onlinePending||['CANCELLED','RETURNED'].includes(order.status), refetchInterval: q=>onlinePending?5000:['REQUESTED','PROCESSING'].includes(q.state.data?.data.refundStatus||'')?10000:false });
  if(['CANCELLED','RETURNED'].includes(order.status))return <div><Badge status={order.status}/>{payment.data&&<RefundStatus payment={payment.data.data}/>}</div>;
  if (!onlinePending) return order.status==='PENDING'?<div><Badge status={order.status}/><small>Đang chờ cửa hàng kiểm tra và xác nhận đơn.</small></div>:<Badge status={order.status}/>;
  const status = payment.data?.data.status;
  return <div className="customer-payment-status">
    {status === 'PENDING' ? <><span className="badge pending"><CreditCard size={14} aria-hidden="true"/>Chờ thanh toán</span><small>Hoàn tất thanh toán để cửa hàng tiếp tục xử lý đơn.</small>{action && <Link className="button small" to={`/orders/${order._id}`}><CreditCard size={16} aria-hidden="true"/>Thanh toán để tiếp tục</Link>}</> : status === 'PAID' ? <><Badge status="PENDING"/><small>Đã thanh toán · Chờ cửa hàng xác nhận đơn.</small></> : <span className="badge"><Clock size={14} aria-hidden="true"/>{payment.error ? 'Chưa tải được trạng thái thanh toán' : payment.isLoading ? 'Đang kiểm tra thanh toán…' : 'Kiểm tra thông tin thanh toán'}</span>}
  </div>;
}
