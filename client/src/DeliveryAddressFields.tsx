import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from './api';
import type {Address} from './types';
export function DeliveryAddressFields({address}:{address?:Address}){
 const [province,setProvince]=useState(address?.province||''),[ward,setWard]=useState(address?.ward||'');
 const provinces=useQuery({queryKey:['address-catalog'],queryFn:()=>api<{provinces:{name:string;aliases:string[]}[]}>('/addresses/catalog')});
 const wards=useQuery({queryKey:['address-wards',province],queryFn:()=>api<{wards?:string[]}>('/addresses/catalog?province='+encodeURIComponent(province)),enabled:!!province});
 return <><label>Tỉnh / Thành phố<input name="province" required maxLength={100} list="delivery-provinces" autoComplete="address-level1" value={province} onChange={e=>{setProvince(e.target.value);setWard('');}} placeholder="Chọn hoặc gõ tên tỉnh/thành"/></label><datalist id="delivery-provinces">{provinces.data?.data.provinces.map(p=><option key={p.name} value={p.name}/>)}</datalist>
 <label>Phường / Xã<input name="ward" required maxLength={100} list="delivery-wards" value={ward} onChange={e=>setWard(e.target.value)} placeholder="Chọn phường/xã thuộc tỉnh/thành"/></label><datalist id="delivery-wards">{wards.data?.data.wards?.map(w=><option key={w} value={w}/>)}</datalist>
 <p className="muted">Gõ để xem gợi ý tỉnh/thành và phường/xã hiện hành. Địa chỉ chi tiết cần số nhà, đường hoặc thôn/xóm; không nhập các ký tự thử như “kq”. Sửa sổ địa chỉ không đổi địa chỉ trong đơn đã đặt.</p>{(provinces.error||wards.error)&&<p role="alert">Chưa tải được gợi ý địa chỉ. Kiểm tra kết nối và thử lại.</p>}</>;
}
