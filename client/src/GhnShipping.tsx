import { useState,type FormEvent } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { api,money } from './api';
import { Dialog,FormError,State } from './components';

type OrderOption={_id:string;totalAmount:number;paymentMethod:string;shippingAddress:{fullName:string;detail:string;ward:string;province:string}};
type Parcel={weight:number;length:number;width:number;height:number};
const fields=[['weight','Khối lượng sau đóng gói (gram)',19999],['length','Dài (cm)',200],['width','Rộng (cm)',200],['height','Cao (cm)',200]] as const;
export function GhnShippingPanel(){
  const query=useQueryClient(),[orderId,setOrderId]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [fee,setFee]=useState<{fee:number;codAmount:number}|null>(null);
  const options=useQuery({queryKey:['ghn-options'],queryFn:()=>api<{enabled:boolean}>('/admin/shipping/ghn/options')});
  const orders=useQuery({queryKey:['ghn-confirmed-orders'],queryFn:()=>api<OrderOption[]>('/admin/orders?status=CONFIRMED&limit=50'),enabled:!!options.data?.data.enabled});
  const booking=useQuery({queryKey:['ghn-booking',orderId],queryFn:()=>api<{state:string;parcel:Parcel}|null>(`/admin/shipping/ghn/orders/${orderId}`),enabled:!!orderId});
  const o=orders.data?.data.find(o=>o._id===orderId),b=booking.data?.data;
  const ready=!!options.data?.data.enabled;
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(busy||!orderId)return;
    const button=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null,operation=button?.value==='create'?'create':'preview';
    const form=new FormData(event.currentTarget);
    const parcel=b?.parcel||Object.fromEntries(fields.map(([key])=>[key,Number(form.get(key))]));
    setBusy(true);setError('');setMessage('');
    try{
      const response=await api<any>(`/admin/shipping/ghn/orders/${orderId}/${operation}`,'POST',parcel);
      if(operation==='preview')setFee(response.data);
      else{setMessage('Đã tạo vận đơn GHN test: '+response.data.trackingCode);await Promise.all([query.invalidateQueries({queryKey:['admin-resource','shipping']}),query.invalidateQueries({queryKey:['ghn-booking',orderId]})]);}
    }catch(e){setError((e as Error).message);await query.invalidateQueries({queryKey:['ghn-booking',orderId]});}
    finally{setBusy(false);}
  };
  return <section className="admin-panel ghn-panel"><h2>GHN · Môi trường test</h2><State loading={options.isLoading} error={options.error} retry={()=>options.refetch()}>{!ready?<p>GHN chưa được kết nối. Bạn vẫn có thể tạo vận đơn thủ công bằng nút Thêm mới; kết nối GHN test khi có Token và Shop ID.</p>:<form onSubmit={submit}>
    <p>Tạo vận đơn thử nghiệm cho kiện dưới 20 kg. Không phát sinh chuyến giao thật.</p>
    <label>Đơn hàng đã xác nhận<select value={orderId} required onChange={e=>{setOrderId(e.target.value);setFee(null);setMessage('');setError('');}}><option value="">Chọn đơn hàng</option>{orders.data?.data.map(o=><option key={o._id} value={o._id}>#{o._id.slice(-8)} · {o.shippingAddress.fullName} · {money(o.totalAmount)}</option>)}</select></label>
    <State loading={orders.isLoading} error={orders.error} retry={()=>orders.refetch()}/>
    {o&&<p>{o.shippingAddress.detail}, {o.shippingAddress.ward}, {o.shippingAddress.province}<br/>Tiền thu hộ: <strong>{money(o.paymentMethod==='COD'?o.totalAmount:0)}</strong>. Đơn online đã thanh toán không thu tiền lần nữa.</p>}
    <div className="ghn-parcel-grid" key={orderId+String(!!b)}>{fields.map(([key,label,max])=><label key={key}>{label}<input name={key} type="number" min={1} max={max} step={1} required disabled={!!b} defaultValue={b?.parcel[key]??''} onChange={()=>setFee(null)}/></label>)}</div>
    {b&&<p role="status">{b.state==='UNCERTAIN'?'Yêu cầu trước chưa rõ kết quả. Giữ nguyên thông số và bấm tạo lại để lấy đúng mã GHN, không tạo đơn trùng.':b.state==='CREATED'?'Đã tạo vận đơn. Đồng bộ từ dòng vận đơn bên dưới để xem hành trình mới.':'Yêu cầu GHN: '+b.state}</p>}
    {fee&&<p role="status">Phí GHN dự kiến: <strong>{money(fee.fee)}</strong> · COD: {money(fee.codAmount)}. Đây là chi phí nội bộ, không đổi tổng tiền của khách.</p>}
    <FormError error={error||booking.error?.message||''}/>{message&&<p className="success-note" role="status">{message}</p>}
    <div className="inline-actions"><button className="button outline" name="operation" value="preview" disabled={busy||!orderId||!!b}>Xem phí GHN</button><button className="button" name="operation" value="create" disabled={busy||!orderId||b?.state==='CREATED'||b?.state==='CANCELLED'}>{busy?'Đang xử lý…':b?'Thử tạo lại cùng mã đơn':'Tạo vận đơn GHN test'}</button></div>
    <p className="muted">Địa chỉ người nhận dùng tỉnh/thành và phường/xã theo danh mục mới của GHN. Địa chỉ lấy hàng theo Shop ID đã cấu hình. 50 đơn xác nhận gần nhất được hiển thị.</p>
  </form>}</State></section>;
}
export function GhnShipmentActions({orderId,canCancel}:{orderId:string;canCancel:boolean}){
  const query=useQueryClient(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false),[message,setMessage]=useState('');
  const run=async(operation:'sync'|'cancel')=>{setBusy(true);setError('');setMessage('');try{await api(`/admin/shipping/ghn/orders/${orderId}/${operation}`,'POST');await query.invalidateQueries();setMessage('Đã đồng bộ GHN.');setConfirm(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <><button disabled={busy} onClick={()=>run('sync')}>Đồng bộ GHN</button>{canCancel&&<button disabled={busy} data-tone="danger" onClick={()=>setConfirm(true)}>Hủy tại GHN</button>}<FormError error={error}/>{message&&<span role="status">{message}</span>}{confirm&&<Dialog title="Hủy vận đơn GHN test?" close={()=>setConfirm(false)}><p>Chỉ hủy vận đơn tại hãng. Đơn hàng và tiền thanh toán chưa được hủy/hoàn. Hãy kiểm tra trạng thái sau khi đồng bộ.</p><FormError error={error}/><button className="button danger" disabled={busy} onClick={()=>run('cancel')}>Xác nhận hủy vận đơn</button></Dialog>}</>;
}
