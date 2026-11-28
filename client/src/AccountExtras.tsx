import { LogOut } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useSession } from './context';
import { FormError, State } from './components';
import type { User } from './types';

export function RecoveryPage({ mode }: { mode: 'forgot' | 'reset' | 'verify' }) {
  const { logout } = useSession();
  const location = useLocation();
  const regState = location.state as { email?: string; emailSent?: boolean } | null;
  const [params] = useSearchParams(); const navigate = useNavigate(); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const options = useQuery({ queryKey: ['auth-options'], queryFn: () => api<{emailDeliveryAvailable: boolean}>('/auth/options') });
  const token = params.get('token');
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setError(''); const form = new FormData(e.currentTarget);
    try {
      let response;
      if (mode === 'reset') {
        if (form.get('password') !== form.get('confirm')) throw new Error('Mật khẩu nhập lại chưa khớp.');
        response = await api('/auth/reset-password', 'POST', { token, password: form.get('password') });
      } else if (mode === 'verify' && token) response = await api('/auth/verify-email', 'POST', { token });
      else response = await api(mode === 'forgot' ? '/auth/forgot-password' : '/auth/resend-verification', 'POST', { email: form.get('email') });
      if (token && (mode === 'reset' || mode === 'verify')) logout();
      setMessage(response.message || 'Yêu cầu đã được tiếp nhận.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const title = mode === 'forgot' ? 'Quên mật khẩu' : mode === 'reset' ? 'Đặt lại mật khẩu' : 'Xác minh email';
  return <div className="shell recovery-page"><div className="auth-form"><h1>{title}</h1>{message ? <><p role="status" className="success-note">{message}</p><button className="button" onClick={() => navigate('/login')}>Đến đăng nhập</button></> : <form onSubmit={submit}>
    {mode === 'verify' && !token && regState?.emailSent && <p role="status" className="success-note">Đã gửi liên kết xác minh đến <strong>{regState.email}</strong>. Vui lòng kiểm tra hộp thư (kể cả Thư rác) và bấm vào liên kết.</p>}
    {!token && options.data && !options.data.data.emailDeliveryAvailable && <p className="subtle-box">Cửa hàng chưa kết nối dịch vụ email. Chức năng gửi liên kết sẽ khả dụng sau khi quản trị cấu hình.</p>}
    {mode === 'reset' ? <>{!token && <p role="alert">Liên kết chưa có mã khôi phục.</p>}<label>Mật khẩu mới<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required/></label><label>Nhập lại mật khẩu<input name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} required/></label></> : token ? <p>Nhấn xác nhận để hoàn tất xác minh email. Liên kết chỉ dùng một lần.</p> : <label>Email tài khoản<input name="email" type="email" autoComplete="email" maxLength={254} defaultValue={regState?.email || ''} required/></label>}
    <FormError error={error}/><button className="button" disabled={busy || (mode === 'reset' && !token) || (!token && options.data?.data.emailDeliveryAvailable === false)}>{busy ? 'Đang xử lý…' : token && mode === 'verify' ? 'Xác nhận email' : mode === 'reset' ? 'Lưu mật khẩu mới' : regState?.emailSent ? 'Gửi lại liên kết' : 'Gửi liên kết'}</button>
  </form>}<p><Link className="text-link" to="/login">Quay lại đăng nhập</Link></p></div></div>;
}

export function ProfileSettings() {
  const { user, updateUser, logout, notify } = useSession(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const options = useQuery({ queryKey: ['auth-options'], queryFn: () => api<{emailDeliveryAvailable: boolean}>('/auth/options') });
  const sessions = useQuery({ queryKey: ['sessions', user?.id], queryFn: () => api<{_id:string;userAgent:string;createdAt:string;lastUsedAt:string;current:boolean}[]>('/auth/sessions') });
  const run = async (e: FormEvent<HTMLFormElement>, kind: 'profile' | 'password' | 'email') => {
    e.preventDefault(); setBusy(true); setError(''); const f = new FormData(e.currentTarget); const form = e.currentTarget;
    try {
      if (kind === 'profile') { const { data } = await api<User>('/auth/profile', 'PATCH', { fullName: f.get('fullName'), phone: f.get('phone') }); updateUser(data); notify('Đã lưu hồ sơ.'); }
      else if (kind === 'password') {
        if (f.get('password') !== f.get('confirm')) throw new Error('Mật khẩu nhập lại chưa khớp.');
        await api('/auth/change-password', 'POST', { currentPassword: f.get('currentPassword'), password: f.get('password') }); logout();
      } else { const r = await api('/auth/email-change', 'POST', { email: f.get('email'), password: f.get('currentPassword') }); notify(r.message || 'Kiểm tra email mới để xác nhận.'); }
      if (kind !== 'profile') form.reset();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="profile-settings"><FormError error={error}/><section className="subtle-box"><h2>Hồ sơ cá nhân</h2><form onSubmit={e => run(e, 'profile')}><label>Họ và tên<input name="fullName" defaultValue={user?.fullName} required maxLength={100} autoComplete="name"/></label><label>Số điện thoại liên hệ<input name="phone" type="tel" defaultValue={user?.phone || ''} pattern="0[0-9]{9}" maxLength={10} autoComplete="tel"/></label><p>{user?.email} · {user?.emailVerified ? 'Đã xác minh' : 'Chưa xác minh email'}</p>{!user?.emailVerified && <Link className="text-link" to="/verify-email">Xác minh email</Link>}<button className="button" disabled={busy}>Lưu hồ sơ</button></form></section>
    <section className="subtle-box"><h2>Đổi mật khẩu</h2><p>Đổi mật khẩu sẽ đăng xuất tất cả các thiết bị.</p><form onSubmit={e => run(e, 'password')}><label>Mật khẩu hiện tại<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={72}/></label><label>Mật khẩu mới<input name="password" type="password" autoComplete="new-password" minLength={user?.role==='CUSTOMER'?8:10} maxLength={72} required/></label><label>Nhập lại mật khẩu mới<input name="confirm" type="password" autoComplete="new-password" minLength={user?.role==='CUSTOMER'?8:10} maxLength={72} required/></label><button className="button" disabled={busy}>Đổi mật khẩu</button></form></section>
    <section className="subtle-box"><h2>Đổi email</h2>{options.data?.data.emailDeliveryAvailable ? <form onSubmit={e => run(e, 'email')}><label>Email mới<input name="email" type="email" maxLength={254} required/></label><label>Mật khẩu hiện tại<input name="currentPassword" type="password" autoComplete="current-password" maxLength={72} required/></label><button className="button outline" disabled={busy}>Gửi xác nhận đổi email</button></form> : <p>Dịch vụ email chưa được cấu hình. Email tài khoản chưa thể thay đổi.</p>}</section>
    <div className="account-devices-column"><div className="account-session-actions"><button type="button" className="account-logout" onClick={logout}><span>Đăng xuất</span><LogOut size={19} aria-hidden="true"/></button></div><section className="subtle-box"><h2>Thiết bị đăng nhập</h2><State loading={sessions.isLoading} error={sessions.error} retry={() => sessions.refetch()} empty={!sessions.data?.data.length}>{sessions.data?.data.map(s => <article className="session-row" key={s._id}><div><strong>{s.current ? 'Thiết bị hiện tại' : 'Phiên đăng nhập'}</strong><p>{s.userAgent || 'Không có thông tin trình duyệt'}</p><small>Lần làm mới: {new Date(s.lastUsedAt).toLocaleString('vi-VN')}</small></div><button className="button outline small" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await api(`/auth/sessions/${s._id}`, 'DELETE'); if (s.current) logout(); else await sessions.refetch(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Đăng xuất phiên</button></article>)}</State></section></div>
  </div>;
}
