import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, date } from './api';
import { Dialog, FormError, Pagination, State } from './components';
import { useSession } from './context';
import './staff-applications.css';

type Application = {
  _id: string; fullName: string; email: string; phone: string; position: string; message: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED'; response: string; createdAt: string; reviewedAt?: string;
};
const labels = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' };

export function StaffApplicationForm() {
  const { user, notify } = useSession();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [page, setPage] = useState(1);
  const latest = useQuery({ queryKey: ['staff-applications', user?.id, 1], queryFn: () => api<Application[]>('/staff-applications'), refetchInterval: 30000 });
  const history = useQuery({ queryKey: ['staff-applications', user?.id, page], queryFn: () => api<Application[]>('/staff-applications?page=' + page), enabled: page > 1 });
  const records = page === 1 ? latest : history;
  const pending = latest.data?.data.some(item => item.status === 'PENDING');
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    const form = e.currentTarget, data = new FormData(form);
    try {
      await api('/staff-applications', 'POST', { phone: data.get('phone'), position: data.get('position'), message: data.get('message') });
      form.reset(); setPage(1); await latest.refetch(); notify('Đã gửi đăng ký làm nhân viên. Bạn có thể theo dõi kết quả tại đây.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="staff-applications"><h2>Đăng ký làm nhân viên</h2><p>Gửi thông tin ứng tuyển để cửa hàng xem xét. Trong thời gian chờ duyệt, bạn vẫn sử dụng tài khoản khách hàng bình thường.</p>
    <FormError error={error}/>
    <State loading={latest.isLoading} error={latest.error} retry={() => latest.refetch()}>
      {pending ? <p className="subtle-box" role="status">Bạn đã có một đăng ký đang chờ duyệt. Kết quả và phản hồi của cửa hàng sẽ xuất hiện bên dưới.</p> : latest.data && <section className="subtle-box"><h3>Thông tin ứng tuyển</h3><p><strong>{user?.fullName}</strong><br/>{user?.email}</p><form onSubmit={submit}>
        <label>Số điện thoại liên hệ<input name="phone" type="tel" autoComplete="tel" defaultValue={user?.phone || ''} pattern="0[0-9]{9}" maxLength={10} placeholder="0901234567" required/></label>
        <label>Vị trí mong muốn<input name="position" maxLength={100} placeholder="Ví dụ: Nhân viên tư vấn bán hàng" required/></label>
        <label>Giới thiệu và kinh nghiệm<textarea name="message" minLength={20} maxLength={2000} rows={5} placeholder="Chia sẻ kinh nghiệm, kỹ năng và thời gian bạn có thể làm việc…" required/></label>
        <p className="muted">Khi được duyệt, bạn dùng tài khoản hiện tại và đổi mật khẩu để bắt đầu làm việc.</p><button className="button" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi đăng ký'}</button>
      </form></section>}
    </State>
    <h3>Lịch sử đăng ký</h3><State loading={records.isLoading} error={records.error} retry={() => records.refetch()}>
      {records.data?.data.length === 0 && <p className="muted">Bạn chưa gửi đăng ký nào.</p>}
      {records.data?.data.map(item => <ApplicationCard key={item._id} item={item}/>)}
    </State><Pagination page={page} totalPages={records.data?.pagination?.totalPages} onPage={setPage}/>
  </div>;
}

function ApplicationCard({ item, applicant = false }: { item: Application; applicant?: boolean }) {
  return <article className="order-card staff-application-card">{applicant && <><h3>{item.fullName}</h3><p>{item.email} · {item.phone}</p></>}<strong>{item.position}</strong><p><span className={`badge ${item.status.toLowerCase()}`}>{labels[item.status]}</span> · Gửi ngày {date(item.createdAt)}</p><p className="application-message">{item.message}</p>{item.response && <div className="subtle-box"><strong>Phản hồi cửa hàng</strong><p className="application-message">{item.response}</p></div>}{item.reviewedAt && <small>Xử lý ngày {date(item.reviewedAt)}</small>}</article>;
}

export function AdminStaffApplications() {
  const [status, setStatus] = useState('PENDING'), [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ item: Application; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const query = useQueryClient(); const { notify } = useSession();
  const records = useQuery({ queryKey: ['admin-staff-applications', status, page], queryFn: () => api<Application[]>(`/admin/staff-applications?page=${page}${status ? '&status=' + status : ''}`), refetchInterval: 30000 });
  const review = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!selected || busy) return; setBusy(true); setError('');
    const data = new FormData(e.currentTarget);
    try {
      await api('/admin/staff-applications/' + selected.item._id, 'PATCH', { status: selected.decision, response: data.get('response') });
      setSelected(null); await Promise.all(['admin-staff-applications', 'admin-users', 'admin-audit'].map(key => query.invalidateQueries({ queryKey: [key] })));
      notify('Đã xử lý đăng ký làm nhân viên.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="staff-applications"><div className="section-heading"><div><h2>Đăng ký làm nhân viên</h2><p>Xem hồ sơ khách hàng gửi và phản hồi kết quả.</p></div></div>
    <label>Lọc đăng ký<select aria-label="Lọc đăng ký" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="PENDING">Chờ duyệt</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Đã từ chối</option><option value="">Tất cả</option></select></label>
    <State loading={records.isLoading} error={records.error} retry={() => records.refetch()}>
      {records.data?.data.length === 0 && <p className="subtle-box">Chưa có đăng ký trong mục này.</p>}
      {records.data?.data.map(item => <div key={item._id}><ApplicationCard item={item} applicant/>{item.status === 'PENDING' && <div className="inline-actions application-actions"><button className="button small" onClick={() => { setError(''); setSelected({ item, decision: 'APPROVED' }); }}>Duyệt đăng ký của {item.fullName}</button><button className="button outline small" onClick={() => { setError(''); setSelected({ item, decision: 'REJECTED' }); }}>Từ chối đăng ký của {item.fullName}</button></div>}</div>)}
    </State><Pagination page={page} totalPages={records.data?.pagination?.totalPages} onPage={setPage}/>
    {selected && <Dialog title={selected.decision === 'APPROVED' ? 'Duyệt đăng ký nhân viên' : 'Từ chối đăng ký nhân viên'} close={() => { if (!busy) setSelected(null); }}><form onSubmit={review}><p><strong>{selected.item.fullName}</strong> · {selected.item.email}</p>{selected.decision === 'APPROVED' && <p>Tài khoản này sẽ được cấp quyền nhân viên. Các phiên cũ được đăng xuất; người dùng đăng nhập lại và đổi mật khẩu trước khi làm việc.</p>}<label>{selected.decision === 'REJECTED' ? 'Lý do từ chối' : 'Lời nhắn cho ứng viên (tùy chọn)'}<textarea name="response" rows={4} minLength={selected.decision === 'REJECTED' ? 10 : undefined} maxLength={500} required={selected.decision === 'REJECTED'}/></label><FormError error={error}/><button className="button" disabled={busy}>{busy ? 'Đang xử lý…' : 'Xác nhận'}</button></form></Dialog>}
  </section>;
}
