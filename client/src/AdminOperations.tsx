import { useState,type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useSession } from './context';
import { FormError,State } from './components';
import { AdminStaff } from './AdminStaff';
import type { StoreInfo } from './StorePages';
export function AdminOperations({section}:{section:string}) {return section==='users'?<AdminStaff/>:<StoreSettingsEditor/>;}
function StoreSettingsEditor() {
  const {notify}=useSession();const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const settings=useQuery({queryKey:['admin-settings'],queryFn:()=>api<StoreInfo&{integrations:Record<string,boolean>}>('/admin/settings')});
  const save=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);try{
    const body:any=Object.fromEntries(f);body.shippingConfigured=f.get('shippingConfigured')==='on';body.shippingFee=Number(f.get('shippingFee')||0);body.freeShippingThreshold=f.get('freeShippingThreshold')?Number(f.get('freeShippingThreshold')):null;
    await api('/admin/settings','PATCH',body);await settings.refetch();notify('Đã cập nhật thông tin cửa hàng.');
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <><h1>Cửa hàng & tích hợp</h1><FormError error={error}/><State loading={settings.isLoading} error={settings.error} retry={()=>settings.refetch()}>{settings.data&&<><div className="integration-status"><h2>Trạng thái kết nối</h2>{[['Email',settings.data.data.integrations.email],['Thanh toán online',settings.data.data.integrations.onlinePayment],['Hãng vận chuyển',settings.data.data.integrations.shippingCarrier]].map(([label,ready])=><p key={String(label)}>{label}: <strong>{ready?'Đã cấu hình':'Chưa cấu hình'}</strong></p>)}<p>Khóa dịch vụ được cấu hình trên máy chủ, không nhập vào giao diện khách hàng.</p></div><form className="settings-form" onSubmit={save}>{[['storeName','Tên cửa hàng'],['phone','Điện thoại'],['email','Email liên hệ'],['address','Địa chỉ'],['hours','Giờ làm việc']].map(([key,label])=><label key={key}>{label}<input name={key} defaultValue={String(settings.data!.data[key as keyof StoreInfo]||'')} maxLength={500} required={key==='storeName'}/></label>)}<h2>Phí giao hàng</h2><label className="checkbox-label"><input type="checkbox" name="shippingConfigured" defaultChecked={settings.data.data.shippingConfigured}/>Đã công bố chính sách phí</label><label>Phí cố định (VND)<input type="number" min={0} step={1} name="shippingFee" defaultValue={settings.data.data.shippingFee}/></label><label>Miễn phí khi tiền hàng sau giảm từ (để trống nếu không áp dụng)<input type="number" min={0} step={1} name="freeShippingThreshold" defaultValue={settings.data.data.freeShippingThreshold??''}/></label>{[['shipping','Giao hàng'],['returns','Đổi trả'],['warranty','Bảo hành'],['privacy','Quyền riêng tư'],['terms','Điều khoản']].map(([key,label])=><label key={key}>{label}<textarea name={key} rows={6} maxLength={12000} defaultValue={String(settings.data!.data[key as keyof StoreInfo]||'')} placeholder="Nhập chính sách thực tế. Để trống sẽ hiển thị chưa cập nhật."/></label>)}<button className="button" disabled={busy}>Lưu thông tin cửa hàng</button></form></>}</State></>;
}
