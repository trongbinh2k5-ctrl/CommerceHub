import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { api } from './api';
import { useSession } from './context';
import { FormError, State } from './components';
import { useQuery } from '@tanstack/react-query';

export function CredentialGate({children}:{children:ReactNode}) {
  const {user}=useSession(), location=useLocation();
  if(user?.mustChangePassword && location.pathname!=='/change-password-required') return <Navigate to="/change-password-required" replace/>;
  return children;
}
export function StaffOnboarding() {
  const {user,loading,logout}=useSession();
  const options=useQuery({queryKey:['auth-options'],queryFn:()=>api<{verificationRequired:boolean;emailDeliveryAvailable:boolean}>('/auth/options')});
  const [needsVerification,setNeedsVerification]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[show,setShow]=useState(false);
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(busy)return;setBusy(true);setError('');const form=e.currentTarget,f=new FormData(form);
    try {
      if(f.get('password')!==f.get('confirm'))throw new Error('Mật khẩu nhập lại chưa khớp.');
      await api('/auth/change-password','POST',{currentPassword:f.get('currentPassword'),password:f.get('password')});
      form.reset();setNeedsVerification(Boolean(options.data?.data.verificationRequired&&!user?.emailVerified));setDone(true);await logout();
    } catch(e){setError((e as Error).message);} finally {setBusy(false);}
  };
  if(loading)return <State loading/>;
  if(done&&busy)return <State loading/>;
  if(done)return <div className="shell recovery-page"><section className="subtle-box onboarding"><h1>Đã thiết lập mật khẩu riêng</h1><p role="status">Mật khẩu tạm và các phiên đăng nhập cũ đã hết hiệu lực. Đăng nhập lại bằng mật khẩu mới để tiếp tục.</p>{needsVerification&&<p>Cửa hàng yêu cầu xác minh email trước khi vận hành. <Link className="text-link" to="/verify-email">Xác minh email tài khoản</Link>{options.data?.data.emailDeliveryAvailable===false&&' · Dịch vụ email chưa được cấu hình; liên hệ admin để hoàn tất kết nối.'}</p>}<Link className="button" to="/login">Đăng nhập lại</Link></section></div>;
  if(!user)return <Navigate to="/login" replace/>;
  if(!user.mustChangePassword)return <Navigate to={user.role==='CUSTOMER'?'/account':'/admin'} replace/>;
  return <div className="shell recovery-page"><section className="subtle-box onboarding"><span className="eyebrow">THIẾT LẬP TÀI KHOẢN</span><h1>Đổi mật khẩu trước khi làm việc</h1><p>Chào {user.fullName}. Tài khoản {user.email} cần có mật khẩu riêng. Các chức năng vận hành chỉ mở sau khi bạn hoàn tất bước này.</p><form onSubmit={submit}>
    <label>Mật khẩu hiện tại hoặc mật khẩu tạm<input name="currentPassword" type={show?'text':'password'} autoComplete="current-password" required maxLength={72}/></label>
    <label>Mật khẩu mới<input name="password" type={show?'text':'password'} autoComplete="new-password" minLength={10} maxLength={72} required aria-describedby="staff-password-hint"/></label><p id="staff-password-hint" className="muted">Ít nhất 10 ký tự; phải khác mật khẩu hiện tại. Có thể dùng một cụm từ dài, dễ nhớ.</p>
    <label>Nhập lại mật khẩu mới<input name="confirm" type={show?'text':'password'} autoComplete="new-password" minLength={10} maxLength={72} required/></label>
    <button className="text-link" type="button" aria-pressed={show} onClick={()=>setShow(!show)}>{show?'Ẩn mật khẩu':'Hiện mật khẩu'}</button><FormError error={error}/><button className="button" disabled={busy}>{busy?'Đang cập nhật…':'Lưu mật khẩu riêng'}</button>
  </form><button type="button" className="text-link" disabled={busy} onClick={logout}>Đăng xuất</button></section></div>;
}
