import {useQuery} from '@tanstack/react-query';
import {api} from './api';
export function OrderSummary(){const q=useQuery({queryKey:['order-summary'],queryFn:()=>api<{awaitingApproval:number;awaitingPayment:number}>('/orders/summary'),refetchInterval:15000});return q.data?<p role="status">{q.data.data.awaitingApproval} đơn chờ cửa hàng xác nhận · {q.data.data.awaitingPayment} đơn chờ thanh toán</p>:q.error?<p>Chưa tải được số đơn chờ xử lý.</p>:null;}
