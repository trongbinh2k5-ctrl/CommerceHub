import {useState,type FormEvent} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {api} from './api';
import {FormError,State} from './components';
import type {Payment} from './types';
export type RefundBank={bankName:string;accountNumber:string;accountHolder:string};
export function RefundRecipient({payment}:{payment:Payment}){
 const cache=useQueryClient();const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const info=useQuery({queryKey:['refund-recipient',payment.orderId],queryFn:()=>api<{recipient:RefundBank|null;submittedAt:string|null}>('/payments/orders/'+payment.orderId+'/refund-details'),enabled:!!payment.refundStatus,refetchOnWindowFocus:true});
 if(!payment.refundStatus)return null;
 const recipient=info.data?.data.recipient,editable=payment.refundStatus==='REQUESTED';
 const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(busy)return;const form=new FormData(e.currentTarget);setBusy(true);setError('');try{await api('/payments/orders/'+payment.orderId+'/refund-details','PATCH',Object.fromEntries(['bankName','accountNumber','accountHolder'].map(k=>[k,String(form.get(k)||'')])));await Promise.all([info.refetch(),cache.invalidateQueries({queryKey:['payment',payment.orderId]})]);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <section className="refund-recipient"><State loading={info.isLoading} error={info.error} retry={()=>info.refetch()}>{info.data&&<>{recipient&&<div className="subtle-box"><strong>Tài khoản nhận tiền</strong><p>{recipient.bankName} · •••• {recipient.accountNumber.slice(-4)}<br/>{recipient.accountHolder}</p><small>{editable?'Đã gửi thông tin nhận tiền.':'Thông tin đã khóa để xử lý hoàn tiền.'}</small></div>}{editable&&<details open={!recipient} key={info.data.data.submittedAt||'new'}><summary>{recipient?'Sửa tài khoản nhận tiền':'Nhập tài khoản nhận tiền'}</summary><form onSubmit={submit}><label>Ngân hàng<input name="bankName" required minLength={2} maxLength={80} defaultValue={recipient?.bankName||''} placeholder="MB, Vietcombank…" autoComplete="off"/></label><label>Số tài khoản<input name="accountNumber" required pattern="[0-9]{6,30}" inputMode="numeric" maxLength={30} defaultValue={recipient?.accountNumber||''} autoComplete="off"/></label><label>Tên chủ tài khoản<input name="accountHolder" required minLength={2} maxLength={100} defaultValue={recipient?.accountHolder||''} autoComplete="off"/></label><FormError error={error}/><button className="button small" disabled={busy}>{busy?'Đang lưu…':'Gửi thông tin nhận tiền'}</button></form></details>}</>}</State></section>;
}
