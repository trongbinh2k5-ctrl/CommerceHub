import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, setAccessToken, enableSessionRefresh, restoreSession } from './api';
import type { User } from './types';
const Session = createContext<{ user: User | null; loading: boolean; updateUser: (user: User) => void; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; notify: (text: string) => void }>({ user: null, loading: true, updateUser: () => {}, login: async () => {}, logout: async () => {}, notify: () => {} });
export const useSession = () => useContext(Session);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const epoch = useRef(0);
  const logoutPending=useRef<Promise<void>|null>(null);
  const [notice, setNotice] = useState('');
  const query = useQueryClient();
  const clear = () => { epoch.current++; setAccessToken(null); setUser(null); setNotice(''); query.clear(); };
  const logout = () => {
    if(logoutPending.current)return logoutPending.current;
    const request=api('/auth/logout','POST');clear();
    logoutPending.current=request.then(()=>{},()=>{}).finally(()=>{logoutPending.current=null;});return logoutPending.current;
  };
  useEffect(() => {
    enableSessionRefresh(); const current = epoch.current; let active = true;
    restoreSession().then(data => { if (active && current === epoch.current) setUser(data.user); }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    const expire = () => { clear(); setNotice('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'); };
    window.addEventListener('session-expired', expire);
    const requirePassword=()=>setUser(current=>current?{...current,mustChangePassword:true}:current);
    window.addEventListener('password-change-required',requirePassword);
    return () => { active = false; window.removeEventListener('session-expired', expire); window.removeEventListener('password-change-required',requirePassword); };
  }, []);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); } }, [notice]);
  const login = async (email: string, password: string) => { await logoutPending.current; const current = ++epoch.current; setAccessToken(null); const { data } = await api<{ user: User; accessToken: string }>('/auth/login', 'POST', { email, password }); if(current !== epoch.current) return; query.clear(); setNotice(''); setAccessToken(data.accessToken); setUser(data.user); setLoading(false); };
  return <Session.Provider value={{ user, loading, updateUser: setUser, login, logout, notify: setNotice }}>{children}{notice && <div className={'toast'+(/giỏ hàng|Đã thêm thiết bị/.test(notice)?' toast-cart':'')} role="status"><div className="toast-content"><span className="toast-icon" aria-hidden="true">✓</span><span>{notice}</span></div>{notice.includes('giỏ hàng') && <Link to="/cart" className="toast-action" onClick={() => setNotice('')}>Xem giỏ hàng →</Link>}<button onClick={() => setNotice('')} aria-label="Đóng thông báo">×</button></div>}</Session.Provider>;
}
