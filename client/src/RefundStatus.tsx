import {useState,type FormEvent} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {api,money,date} from './api';
import {FormError} from './components';
import {useSession} from './context';
import {Link} from 'react-router-dom';
import type {Payment} from './types';
export function RefundStatus({payment,detailed=false}:{payment:Payment;detailed?:boolean}){
 const {user}=useSession();
 if(!payment.refundStatus)return null;
 const done=payment.refundStatus==='COMPLETED',processing=payment.refundStatus==='PROCESSING';
 return <section className="refund-status"><p role="status" className={done?'success-note':'subtle-box'}>{done?'Đã hoàn tiền · '+money(payment.refundAmount||0):processing?'Đang xử lý hoàn tiền.':'Đang chờ cửa hàng xử lý hoàn tiền.'}{done&&payment.refundedAt?' · '+date(payment.refundedAt):''}</p>{detailed&&<><p><strong>Số tiền hoàn: {money(payment.amount)}</strong></p><ol className="refund-progress">{[['Yêu cầu đã ghi nhận',payment.refundRequestedAt],['Cửa hàng tiếp nhận',payment.refundProcessingAt],['Cửa hàng xác nhận đã hoàn',payment.refundedAt]].map(([label,time])=><li key={label} data-done={!!time}><span>{label}</span><small>{time?new Date(time).toLocaleString('vi-VN'):'Chưa thực hiện'}</small></li>)}</ol>{done&&payment.refundReference&&<p>Mã giao dịch: <strong>{payment.refundReference}</strong></p>}{user?.role==='CUSTOMER'&&<Link className="text-link" to="/messages">Liên hệ về khoản hoàn</Link>}</>}</section>;
}
export function RefundConfirmation({payment,orderId,expanded=false,onComplete}:{payment:Payment;orderId:string;expanded?:boolean;onComplete?:()=>void}){
 const {user}=useSession();const cache=useQueryClient();const [busy,setBusy]=useState(false),[error,setError]=useState('');
 if(user?.role!=='ADMIN'||!['REQUESTED','PROCESSING'].includes(payment.refundStatus||''))return null;
 const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);setBusy(true);setError('');try{await api('/admin/payments/orders/'+orderId+'/refund-complete','POST',{amount:payment.amount,reference:String(f.get('reference')||''),confirmed:f.get('confirmed')==='on'});onComplete?.();await cache.invalidateQueries();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 if(payment.refundStatus==='REQUESTED'&&payment.refundRecipientSubmittedAt)return <Link className="button outline small" to={'/admin/refunds?order='+orderId}>Xử lý hoàn tiền</Link>;
 return <details className="refund-confirmation" open={expanded}><summary>Xác nhận hoàn tiền</summary><form onSubmit={submit}><p>Chỉ xác nhận sau khi đã chuyển {money(payment.amount)} cho khách.</p><label>Mã giao dịch hoàn tiền<input name="reference" required minLength={6} maxLength={120}/></label><label className="checkbox-label"><input name="confirmed" type="checkbox" required/>Đã hoàn đủ tiền thực tế</label><FormError error={error}/><button className="button small" disabled={busy}>{busy?'Đang lưu…':'Xác nhận đã hoàn tiền'}</button></form></details>;
}
