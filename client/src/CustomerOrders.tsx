import {useState,useRef} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api,date,money} from './api';
import {useSession} from './context';
import {FormError,Pagination,State} from './components';
import {CustomerOrderStatus} from './CustomerOrderStatus';
import type {Order} from './types';
const tabs=[['all','Tất cả'],['unpaid','Chờ thanh toán'],['pending','Chờ xử lý'],['shipping','Đang giao'],['delivered','Đã giao'],['cancelled','Đã hủy'],['returns','Đã hoàn hàng']];
export function ReorderButton({orderId}:{orderId:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const cache=useQueryClient(),navigate=useNavigate();const {notify}=useSession();
 const key=useRef('');
 return <><button className="button outline small" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{key.current||=crypto.randomUUID();await api('/orders/'+orderId+'/reorder','POST',undefined,{'Idempotency-Key':key.current});await cache.invalidateQueries({queryKey:['cart']});notify('Đã thêm vào giỏ hàng.');navigate('/cart');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Đang thêm…':'Mua lại'}</button><FormError error={error}/></>;
}
export function CustomerOrders(){
 const {user}=useSession();const [view,setView]=useState('all'),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 const orders=useQuery({queryKey:['orders',user?.id,page,view,search],queryFn:()=>api<Order[]>('/orders?page='+page+'&limit=20&view='+view+(search?'&search='+encodeURIComponent(search):'')),refetchInterval:15000});
 return <><h2>Đơn hàng của tôi</h2><nav className="customer-order-filters" aria-label="Trạng thái đơn hàng">{tabs.map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>{setView(key);setPage(1);}}>{label}</button>)}</nav>
 <label className="customer-order-search">Tìm đơn hàng<input type="search" value={search} maxLength={100} placeholder="Tên sản phẩm hoặc mã đơn" onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label>
 <State loading={orders.isLoading} error={orders.error} retry={()=>orders.refetch()}>{orders.data&&!orders.data.data.length?<p className="subtle-box">Chưa có đơn hàng.</p>:orders.data?.data.map(o=><article className="order-card" key={o._id}><div className="order-card-top"><span className="eyebrow">CH—{o._id.slice(-8).toUpperCase()} / {date(o.createdAt)}</span><CustomerOrderStatus order={o} action/></div>{o.items.map(i=><p key={i.productId}><Link to={'/products/'+i.productId}>{i.name}</Link><span>× {i.quantity}</span></p>)}<div className="order-card-bottom"><strong>{money(o.totalAmount)}</strong><div className="inline-actions"><Link to={'/orders/'+o._id} className="text-link">Chi tiết đơn hàng</Link>{['CANCELLED','DELIVERED','RETURNED'].includes(o.status)&&<ReorderButton orderId={o._id}/>}</div></div></article>)}</State>
 <Pagination page={page} totalPages={orders.data?.pagination?.totalPages} onPage={setPage}/></>;
}
