import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { FormError, PageHeading, State } from './components';

export async function openVnpay(orderId:string) {
  const {data}=await api<{url:string}>(`/payments/vnpay/orders/${orderId}`,'POST');
  const url=new URL(data.url);
  if(url.origin!=='https://sandbox.vnpayment.vn') throw new Error('Địa chỉ thanh toán không hợp lệ.');
  window.location.assign(url.href);
}
export function VnpayAction({orderId,paid}:{orderId:string;paid:boolean}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const query=useQueryClient();
  const [message,setMessage]=useState('');
  if(paid)return <p className="success-note" role="status">Đã xác nhận thanh toán VNPAY sandbox.</p>;
  return <div className="subtle-box"><strong>VNPAY · Môi trường thử nghiệm</strong><p>Không sử dụng tiền thật. Chỉ cập nhật đã thanh toán sau khi máy chủ nhận xác nhận hợp lệ.</p><FormError error={error}/>{message&&<p role="status">{message}</p>}<button type="button" className="button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await openVnpay(orderId);}catch(e){setError((e as Error).message);setBusy(false);}}}>{busy?'Đang xử lý…':'Thanh toán qua VNPAY'}</button><button type="button" className="button outline" disabled={busy} onClick={async()=>{setBusy(true);setError('');setMessage('');try{const result=await api<{message:string}>(`/payments/vnpay/orders/${orderId}/reconcile`,'POST');setMessage(result.data.message);await query.invalidateQueries({queryKey:['payment',orderId]});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Đã thanh toán? Kiểm tra với VNPAY</button></div>;
}
export function VnpayReturn() {
  const [params]=useSearchParams();
  const ref=params.get('vnp_TxnRef')||'';
  // Browser-return parameters never authorize payment. Read the server's stored result.
  const result=useQuery({queryKey:['vnpay-result',ref],queryFn:()=>api<{orderId:string;status:string;paymentStatus:string}>('/payments/vnpay/result?ref='+encodeURIComponent(ref)),enabled:/^[a-f0-9]{32}$/.test(ref),refetchInterval:q=>q.state.data?.data.status==='PENDING' && q.state.dataUpdateCount<20?3000:false});
  const data=result.data?.data;
  return <div className="shell checkout-page"><PageHeading kicker="BERYLCORE / VNPAY SANDBOX" title="Kết quả thanh toán"/><State loading={result.isLoading} error={result.error} retry={()=>result.refetch()}>{!/^[a-f0-9]{32}$/.test(ref)?<p>Mã giao dịch thiếu hoặc không hợp lệ. Hãy kiểm tra đơn hàng trong tài khoản.</p>:data&&<div className="subtle-box"><h2>{data.paymentStatus==='PAID'?'Đã xác nhận thanh toán':data.status==='FAILED'?'Giao dịch không thành công':'Đang chờ xác nhận từ VNPAY'}</h2><p>{data.status==='PENDING'?'Máy chủ chưa nhận được kết quả xác thực. Nếu đã hoàn tất tại cổng, đừng thanh toán lại; hãy kiểm tra trạng thái hoặc liên hệ cửa hàng.':'Bạn có thể xem trạng thái và thao tác tiếp trong chi tiết đơn hàng.'}</p><p className="muted">Đây là giao dịch thử nghiệm, không chuyển tiền thật.</p><Link className="button" to={'/orders/'+data.orderId}>Xem đơn hàng</Link><button type="button" className="button outline" onClick={()=>result.refetch()}>Kiểm tra lại</button></div>}</State><Link className="text-link" to="/account?tab=orders">Đơn hàng của tôi</Link></div>;
}
