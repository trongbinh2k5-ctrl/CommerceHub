import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { State } from './components';
export type StoreInfo = {storeName:string;phone:string;email:string;address:string;hours:string;shipping:string;returns:string;warranty:string;privacy:string;terms:string;shippingConfigured:boolean;shippingFee:number;freeShippingThreshold:number|null};
const titles:Record<string,string>={shipping:'Chính sách giao hàng',returns:'Chính sách đổi trả',warranty:'Chính sách bảo hành',privacy:'Quyền riêng tư',terms:'Điều khoản mua hàng'};
export function StorePage({contact=false}:{contact?:boolean}) {
  const {slug}=useParams();const data=useQuery({queryKey:['store-info'],queryFn:()=>api<StoreInfo>('/store')});
  if(!contact&&!titles[slug||''])return <div className="shell state"><h1>Không tìm thấy trang</h1><Link to="/">Về trang chủ</Link></div>;
  const title=contact?'Liên hệ cửa hàng':titles[slug!];
  return <div className="shell information-page"><h1>{title}</h1><State loading={data.isLoading} error={data.error} retry={()=>data.refetch()}>{data.data&&<>{contact?<><h2>{data.data.data.storeName}</h2><dl>{[['Điện thoại',data.data.data.phone],['Email',data.data.data.email],['Địa chỉ',data.data.data.address],['Giờ làm việc',data.data.data.hours]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value||'Chưa cập nhật'}</dd></div>)}</dl><p>Thông tin chưa công bố cần được cửa hàng xác nhận trước khi giao dịch.</p></>:<div className="policy-content">{String(data.data.data[slug as keyof StoreInfo]||'').trim()?String(data.data.data[slug as keyof StoreInfo]).split('\n').map((line,i)=><p key={i}>{line}</p>):<p>Nội dung này chưa được cửa hàng công bố. Vui lòng liên hệ để xác nhận trước khi mua.</p>}</div>}<Link className="text-link" to={contact?'/products':'/contact'}>{contact?'Xem thiết bị':'Thông tin liên hệ'}</Link></>}</State></div>;
}
