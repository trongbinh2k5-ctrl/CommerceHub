import { useSession } from './context';
import { useState } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { FormError,PageHeading,State } from './components';

export async function openSepay(orderId:string){
  const {data}=await api<{action:string;fields:Record<string,string>}>(`/payments/sepay/orders/${orderId}`,'POST',{returnOrigin:window.location.origin});
  if(!['https://pay-sandbox.sepay.vn/v1/checkout/init','https://pay.sepay.vn/v1/checkout/init'].includes(data.action))throw new Error('Địa chỉ thanh toán không hợp lệ.');
  const form=document.createElement('form');form.method='POST';form.action=data.action;form.hidden=true;
  // Use DOM properties rather than HTML interpolation for the signed fields.
  for(const [name,value] of Object.entries(data.fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);}
  document.body.appendChild(form);form.submit();form.remove();
}
export function SepayAction({orderId,paid}:{orderId:string;paid:boolean}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const query=useQueryClient();
  const run=async(action:'pay'|'reconcile'|'cancel')=>{
    setBusy(true);setError('');setMessage('');
    try{
      if(action==='pay')await openSepay(orderId);
      else{const result=await api<{message:string}>(`/payments/sepay/orders/${orderId}/${action}`,'POST');setMessage(result.data.message);await query.invalidateQueries({queryKey:['payment',orderId]});}
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  if(paid)return <p className="success-note" role="status">Đã xác nhận thanh toán SePay.</p>;
  return <article className="subtle-box payment-panel"><strong>Thanh toán qua SePay</strong><p>Nếu SePay không tự quay lại, hãy trở về đơn này và bấm kiểm tra kết quả.</p><FormError error={error}/>{message&&<p role="status">{message}</p>}<div className="payment-panel-actions"><button type="button" className="button" disabled={busy} onClick={()=>run('pay')}>{busy?'Đang xử lý…':'Thanh toán qua SePay'}</button><button type="button" className="button outline" disabled={busy} onClick={()=>run('reconcile')}>Đã thanh toán? Kiểm tra với SePay</button><button type="button" className="text-link" disabled={busy} onClick={()=>run('cancel')}>Dừng thanh toán đang chờ</button></div><p className="muted">Dừng thanh toán không hủy đơn hàng. Chỉ hủy đơn sau khi SePay xác nhận giao dịch đã dừng.</p></article>;
}
export function SepayReturn(){
  const {user,loading}=useSession();
  const [params]=useSearchParams(),ref=params.get('ref')||'';
  const valid=/^[a-f0-9]{32}$/.test(ref);
  const result=useQuery({queryKey:['sepay-result',ref],queryFn:()=>api<{orderId:string;status:string;paymentStatus:string}>('/payments/sepay/result?ref='+encodeURIComponent(ref)),enabled:valid && !!user && !loading,refetchInterval:q=>q.state.data?.data.status==='PENDING'&&q.state.dataUpdateCount<20?3000:false});
  const data=result.data?.data;
  if(loading)return <State loading/>;
  if(!user)return <div className="shell checkout-page"><PageHeading kicker="BERYLCORE / SEPAY" title="Trở về từ cổng thanh toán"/><div className="subtle-box"><p>Vui lòng đăng nhập để xem kết quả giao dịch. Nếu bạn vừa thanh toán, không thanh toán lại.</p><Link className="button" to="/login" state={{from:window.location.pathname+window.location.search}}>Đăng nhập xem kết quả</Link></div></div>;
  return <div className="shell checkout-page"><PageHeading kicker="BERYLCORE / SEPAY" title="Kết quả thanh toán"/><State loading={result.isLoading} error={result.error} retry={()=>result.refetch()}>{!valid?<p>Mã giao dịch thiếu hoặc không hợp lệ. Hãy kiểm tra đơn hàng trong tài khoản.</p>:data&&<div className="subtle-box"><h2>{data.paymentStatus==='PAID'?'Đã xác nhận thanh toán':data.status==='CANCELLED'?'Đã dừng thanh toán':'Đang chờ xác nhận từ SePay'}</h2><p>{data.status==='PENDING'?'Nếu đã thanh toán tại cổng, đừng trả tiền lại. Mở chi tiết đơn và kiểm tra với SePay để cập nhật kết quả.':'Bạn có thể xem trạng thái và thao tác tiếp trong chi tiết đơn hàng.'}</p><p className="muted">Kiểm tra kết quả trước khi thanh toán lại.</p><Link className="button" to={'/orders/'+data.orderId}>Xem đơn hàng</Link><button type="button" className="button outline" onClick={()=>result.refetch()}>Kiểm tra lại</button></div>}</State><Link className="text-link" to="/account?tab=orders">Đơn hàng của tôi</Link></div>;
}
