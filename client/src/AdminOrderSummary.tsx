import {useQuery} from '@tanstack/react-query';
import {api} from './api';
export function AdminOrderSummary(){
 const q=useQuery({queryKey:['admin-order-summary'],queryFn:()=>api<{awaitingApproval:number;awaitingPayment:number}>('/admin/orders/summary'),refetchInterval:15000,refetchOnWindowFocus:true});
 return <div className="admin-order-summary" role="status">{q.data?<strong>Còn {q.data.data.awaitingApproval} đơn hàng chưa duyệt</strong>:q.error?<span>Không tải được. <button onClick={()=>q.refetch()}>Thử lại</button></span>:<span>Đang tải…</span>}</div>;
}
