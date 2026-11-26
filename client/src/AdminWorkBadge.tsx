import {useQuery} from '@tanstack/react-query';
import {api} from './api';

export function AdminWorkBadge({kind}:{kind:'orders'|'refunds'}){
 const orders=useQuery({queryKey:['admin-order-summary'],queryFn:()=>api<{awaitingApproval:number;awaitingPayment:number}>('/admin/orders/summary'),enabled:kind==='orders',refetchInterval:15000,refetchOnWindowFocus:true});
 // Share the refund queue cache so completion immediately refreshes this count.
 const refunds=useQuery({queryKey:['admin-refunds','pending',1],queryFn:()=>api<unknown[]>('/admin/payments/refunds?status=pending&page=1'),enabled:kind==='refunds',refetchInterval:15000,refetchOnWindowFocus:true});
 const count=kind==='orders'?orders.data?.data.awaitingApproval:refunds.data?.pagination?.total;
 return count&&count>0?<span className="admin-work-count" aria-hidden="true" title={`${count} ${kind==='orders'?'đơn hàng chưa duyệt':'khoản chưa hoàn'}`}>{count>99?'99+':count}</span>:null;
}
