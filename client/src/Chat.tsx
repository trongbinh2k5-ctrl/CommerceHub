import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, X, ArrowLeft, Send, Bot, Headphones, ExternalLink } from 'lucide-react';
import { api, money } from './api';
import { useSession } from './context';
import { State } from './components';

type Kind = 'STORE' | 'BOT';
type Person = { _id: string; fullName: string };
type Conversation = { _id: string; customerId: Person | string; assignedTo: Person | string | null; kind: Kind; open: boolean; seq: number; customerReadSeq: number; staffReadSeq: number; status: string; unread: boolean; preview: string; updatedAt: string };
type Card = { productId: string; name: string; imageUrl?: string; price: number; stock: number };
type Message = { _id: string; seq: number; senderRole: string; text: string; cards?: Card[]; createdAt: string };
type Thread = { conversation: Conversation; messages: Message[]; hasMore: boolean };
const statuses: Record<string, string> = { WAITING: 'Chờ tiếp nhận', ACTIVE: 'Đang xử lý', CLOSED: 'Đã đóng' };
const personName = (p: Person | string | null) => p && typeof p !== 'string' ? p.fullName : '';
const personId = (p: Person | string | null) => typeof p === 'string' ? p : p?._id;
const suggestions = ['Tìm laptop dưới 20 triệu', 'Gợi ý màn hình', 'Chính sách bảo hành', 'Tra cứu đơn hàng'];

export function useChatUnread(enabled = true) {
  const { user } = useSession();
  return useQuery({ queryKey: ['chat-unread', user?.id], queryFn: () => api<{ count: number }>('/chat/unread'), enabled: enabled && !!user && !user.mustChangePassword, refetchInterval: 15000 });
}

function Bubbles({ messages, staff = false }: { messages: Message[]; staff?: boolean }) {
  return <>{messages.map(m => <article key={m._id} className={`chat-message ${(staff ? ['STAFF', 'ADMIN'].includes(m.senderRole) : m.senderRole === 'CUSTOMER') ? 'mine' : ''}`}>
    <span className="chat-sender">{m.senderRole === 'BOT' ? 'Trợ lý tự động' : m.senderRole === 'CUSTOMER' ? 'Khách hàng' : m.senderRole === 'ADMIN' ? 'Admin' : 'Nhân viên BerylCore'}</span>
    <p>{m.text}</p>
    {m.cards?.map(c => <Link key={c.productId} className="chat-product" to={'/products/' + c.productId}>{c.imageUrl && <img src={c.imageUrl} alt="" loading="lazy"/>}<span><strong>{c.name}</strong><span>{c.price > 0 ? money(c.price) : 'Liên hệ báo giá'}</span><small>{c.stock > 0 ? `Còn ${c.stock} sản phẩm` : 'Hết hàng'} · Xem chi tiết ↗</small></span></Link>)}
    <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time>
  </article>)}</>;
}

export function ChatWorkspace({ compact = false, initialKind, productId, onBack }: { compact?: boolean; initialKind?: Kind; productId?: string; onBack?: () => void }) {
  const { user, notify } = useSession(), cache = useQueryClient();
  const staff = !!user && user.role !== 'CUSTOMER';
  const [selected, setSelected] = useState(''), [page, setPage] = useState(1), [status, setStatus] = useState('');
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [older, setOlder] = useState<Message[]>([]), [historyMore, setHistoryMore] = useState(true), [assign, setAssign] = useState('');
  const [handoff, setHandoff] = useState<string | null>(null);
  const pending = useRef<{ text: string; clientId: string; id: string; productId?: string } | null>(null);
  const scroll = useRef<HTMLDivElement>(null), nearBottom = useRef(true), lastRead = useRef(0), initialStarted = useRef(false);
  const conversations = useQuery({ queryKey: ['chat-list', user?.id, page, status], queryFn: () => api<Conversation[]>(`/chat/conversations?page=${page}${status ? '&status=' + status : ''}`), enabled: !!user, refetchInterval: 5000 });
  const thread = useQuery({ queryKey: ['chat-thread', user?.id, selected], queryFn: () => api<Thread>(`/chat/conversations/${selected}/messages`), enabled: !!user && !!selected, refetchInterval: 3000 });
  const agents = useQuery({ queryKey: ['chat-agents'], queryFn: () => api<Person[]>('/chat/staff'), enabled: user?.role === 'ADMIN' });
  const c = thread.data?.data.conversation;
  const merged = [...new Map([...older, ...(thread.data?.data.messages || [])].map(m => [m.seq, m])).values()].sort((a, b) => a.seq - b.seq);
  // After a long background pause, show one contiguous suffix; older paging fills any missing interval.
  let first = Math.max(0, merged.length - 1);
  while (first > 0 && merged[first - 1].seq === merged[first].seq - 1) first--;
  const messages = merged.slice(first), historyGap = first > 0;
  const canReply = !!c?.open && (!staff || personId(c.assignedTo) === user?.id);
  const invalidate = async () => { await Promise.all([cache.invalidateQueries({ queryKey: ['chat-list'] }), cache.invalidateQueries({ queryKey: ['chat-thread'] }), cache.invalidateQueries({ queryKey: ['chat-unread'] })]); };
  const select = (id: string) => { setSelected(id); setDraft(''); pending.current = null; setOlder([]); setHistoryMore(true); setError(''); lastRead.current = 0; nearBottom.current = true; setHandoff(null); };
  const start = async (kind: Kind) => {
    setBusy(true); setError('');
    try { const result = await api<Conversation>('/chat/conversations', 'POST', { kind }); select(result.data._id); await invalidate(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { if (initialKind && user?.role === 'CUSTOMER' && !initialStarted.current) { initialStarted.current = true; void start(initialKind); } }, [initialKind, user?.id]);
  const markRead = async () => {
    if (!c || !nearBottom.current || document.visibilityState !== 'visible' || (staff && personId(c.assignedTo) !== user?.id) || lastRead.current >= c.seq) return;
    const seq = c.seq; lastRead.current = seq;
    try { await api(`/chat/conversations/${c._id}/read`, 'PATCH', { seq }); await cache.invalidateQueries({ queryKey: ['chat-unread'] }); }
    catch { lastRead.current = 0; }
  };
  const lastSeq = messages.at(-1)?.seq;
  useEffect(() => { if (nearBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; void markRead(); }, [lastSeq, c?.assignedTo]);
  useEffect(() => { const visible = () => { void markRead(); }; document.addEventListener('visibilitychange', visible); return () => document.removeEventListener('visibilitychange', visible); }, [c?.seq, selected]);
  const send = async (value = draft) => {
    if (!value.trim() || !selected || busy) return;
    setBusy(true); setError('');
    if (!pending.current || pending.current.text !== value.trim() || pending.current.id !== selected) pending.current = { text: value.trim(), clientId: crypto.randomUUID(), id: selected, productId };
    try { await api(`/chat/conversations/${selected}/messages`, 'POST', pending.current); pending.current = null; setDraft(''); nearBottom.current = true; await invalidate(); }
    catch (e) { setError((e as Error).message + ' Bạn có thể bấm gửi lại; hệ thống sẽ tránh lưu trùng.'); } finally { setBusy(false); }
  };
  const action = async (action: string) => {
    setBusy(true); setError('');
    try {
      await api(`/chat/conversations/${selected}`, 'PATCH', { action, ...(action === 'assign' ? { assignedTo: assign } : {}) });
      if (action === 'assign') {
        const name = agents.data?.data.find(agent => agent._id === assign)?.fullName;
        notify(name ? `Đã phân công hội thoại cho ${name}.` : 'Đã phân công hội thoại thành công.');
      }
      await invalidate();
    }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const loadOlder = async () => {
    if (!messages.length || busy) return; setBusy(true); setError('');
    try { const result = await api<Thread>(`/chat/conversations/${selected}/messages?before=${messages[0].seq}`); nearBottom.current = false; setOlder(v => [...result.data.messages, ...v]); setHistoryMore(result.data.hasMore); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const transfer = async () => {
    if (!handoff?.trim() || busy) return; setBusy(true); setError('');
    try {
      const target = await api<Conversation>('/chat/conversations', 'POST', { kind: 'STORE' });
      const key = pending.current?.id === target.data._id && pending.current.text === handoff.trim() ? pending.current.clientId : crypto.randomUUID();
      pending.current = { id: target.data._id, text: handoff.trim(), clientId: key, productId };
      await api(`/chat/conversations/${target.data._id}/messages`, 'POST', pending.current);
      select(target.data._id); await invalidate();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className={`chat-workspace ${compact ? 'compact' : ''} ${selected ? 'has-selection' : ''}`}>
    <aside className="chat-inbox" aria-label="Danh sách hội thoại"><div className="chat-inbox-heading"><h2>{staff ? 'Hội thoại khách hàng' : 'Tin nhắn của bạn'}</h2>{onBack && <button className="icon-button" onClick={onBack} aria-label="Quay lại lựa chọn chat"><ArrowLeft size={18}/></button>}</div>
      {!staff && <div className="chat-start"><button disabled={busy} onClick={() => start('STORE')}><Headphones size={17}/>Chat với cửa hàng</button><button disabled={busy} onClick={() => start('BOT')}><Bot size={17}/>Trợ lý tự động</button></div>}
      {staff && <label>Lọc hội thoại<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Tất cả</option>{Object.entries(statuses).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>}
      <State loading={conversations.isLoading} error={conversations.error} retry={() => conversations.refetch()}>{!conversations.data?.data.length && <p className="chat-hint">{staff ? 'Chưa có hội thoại trong danh sách này.' : 'Bắt đầu trò chuyện để nhận tư vấn. Lịch sử sẽ được lưu trong tài khoản.'}</p>}{conversations.data?.data.map(item => <button key={item._id} className={`chat-inbox-item ${selected === item._id ? 'selected' : ''}`} onClick={() => select(item._id)}><strong>{staff ? personName(item.customerId) || 'Khách hàng' : item.kind === 'BOT' ? 'Trợ lý tự động' : 'Cửa hàng BerylCore'}{item.unread && <span className="chat-unread-dot" aria-label="Có tin chưa đọc"/>}</strong><small>{item.kind === 'BOT' ? 'Tự động' : statuses[item.status]} · {new Date(item.updatedAt).toLocaleDateString('vi-VN')}</small><span>{item.preview || 'Chưa có tin nhắn'}</span></button>)}</State>
      {(conversations.data?.pagination?.totalPages || 0) > 1 && <div className="chat-pages"><button disabled={page <= 1} onClick={() => setPage(v => v - 1)}>Trước</button><span>{page}/{conversations.data?.pagination?.totalPages}</span><button disabled={page >= (conversations.data?.pagination?.totalPages || 1)} onClick={() => setPage(v => v + 1)}>Sau</button></div>}
    </aside>
    <section className="chat-thread" aria-label="Nội dung hội thoại">
      {!selected ? <div className="chat-welcome"><MessageCircle size={40}/><h2>{staff ? 'Tiếp nhận và hỗ trợ khách hàng' : 'BerylCore luôn sẵn sàng lắng nghe'}</h2><p>{staff ? 'Chọn hội thoại trong hàng chờ, sau đó tiếp nhận để trả lời.' : 'Chọn chat với cửa hàng hoặc thử trợ lý tự động.'}</p></div> : <>
        <div className="chat-thread-heading"><button className="icon-button chat-back" onClick={() => select('')} aria-label="Về danh sách hội thoại"><ArrowLeft size={18}/></button><div><strong>{c?.kind === 'BOT' ? 'Trợ lý tự động' : 'Chat với cửa hàng'}</strong><small>{c?.kind === 'BOT' ? 'Hỗ trợ tìm thiết bị và mua sắm' : `${statuses[c?.status || 'WAITING']} ${personName(c?.assignedTo || null) ? '· ' + personName(c?.assignedTo || null) : ''}`}</small></div>{c && <button className="chat-text-button" disabled={busy || (!c.open && user?.role !== 'ADMIN')} onClick={() => action(c.open ? 'close' : 'reopen')}>{c.open ? 'Đóng hội thoại' : user?.role === 'ADMIN' ? 'Mở lại' : 'Đã đóng'}</button>}</div>
        {staff && c?.open && <div className="chat-controls">{!c.assignedTo && <button disabled={busy} className="button small" onClick={() => action('claim')}>Tiếp nhận hội thoại</button>}{user?.role === 'ADMIN' && <><label className="sr-only" htmlFor="chat-assignee">Nhân viên phụ trách</label><select id="chat-assignee" value={assign} onChange={e => setAssign(e.target.value)}><option value="">Chọn người phụ trách</option>{agents.data?.data.map(a => <option key={a._id} value={a._id}>{a.fullName}</option>)}</select><button disabled={busy || !assign} onClick={() => action('assign')}>Phân công</button></>}</div>}
        <State loading={thread.isLoading} error={thread.error} retry={() => thread.refetch()}/>
        <div className="chat-messages" ref={scroll} role="log" aria-label="Lịch sử tin nhắn" aria-live="polite" aria-relevant="additions" onScroll={() => { const el = scroll.current!; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (nearBottom.current) void markRead(); }}>
          {!!messages.length && ((historyMore && (thread.data?.data.hasMore || older.length > 0)) || historyGap) && <button className="chat-load" disabled={busy} onClick={loadOlder}>Tải tin nhắn cũ hơn</button>}
          {!messages.length && c && <p className="chat-hint">{c.kind === 'BOT' ? 'Chào bạn! Hãy hỏi về thiết bị hoặc chọn một gợi ý. Bạn có thể hỏi về sản phẩm, tài khoản, thanh toán và chính sách.' : 'Gửi câu hỏi của bạn. Cửa hàng sẽ trả lời khi có người tiếp nhận; hiện chưa có cam kết thời gian phản hồi.'}</p>}
          <Bubbles messages={messages} staff={staff}/>
        </div>
        {c?.kind === 'BOT' && c.open && <div className="chat-suggestions">{suggestions.map(s => <button disabled={busy} key={s} onClick={() => send(s)}>{s}</button>)}<button disabled={busy} onClick={() => setHandoff('Tôi cần nhân viên hỗ trợ.\n' + messages.filter(m => m.senderRole === 'CUSTOMER').slice(-3).map(m => m.text).join('\n').slice(0, 1700))}>Chuyển sang nhân viên</button></div>}
        {handoff !== null && <div className="chat-handoff"><label>Kiểm tra nội dung gửi cho nhân viên<textarea maxLength={2000} value={handoff} onChange={e => setHandoff(e.target.value)}/></label><button disabled={busy || !handoff.trim()} onClick={transfer}>Xác nhận chuyển tiếp</button><button disabled={busy} onClick={() => setHandoff(null)}>Hủy</button></div>}
        {error && <p className="chat-error" role="alert">{error}</p>}
        {productId && canReply && <p className="chat-context">Tin nhắn sẽ kèm sản phẩm bạn đang hỏi.</p>}
        <form className="chat-composer" onSubmit={e => { e.preventDefault(); void send(); }}><label className="sr-only" htmlFor={compact ? 'chat-widget-input' : 'chat-page-input'}>Nội dung tin nhắn</label><textarea id={compact ? 'chat-widget-input' : 'chat-page-input'} placeholder={canReply ? 'Nhập câu hỏi…' : c?.open ? 'Cần tiếp nhận để trả lời' : 'Hội thoại đã đóng'} maxLength={2000} value={draft} disabled={!canReply || busy} onChange={e => setDraft(e.target.value)}/><button type="submit" aria-label="Gửi tin nhắn" disabled={!canReply || busy || !draft.trim()}><Send size={19}/></button></form>
        <span className="chat-sync" role="status">{busy ? 'Đang xử lý…' : 'Tin nhắn tự cập nhật mỗi vài giây'}</span>
      </>}
    </section>
    {!selected && error && <p className="chat-error" role="alert">{error}</p>}
  </div>;
}

function GuestAssistant({ productId, onBack }: { productId?: string; onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]), [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);
  const send = async (value = draft) => {
    if (!value.trim() || busy) return; setBusy(true); setError('');
    try { const result = await api<{ text: string; cards?: Card[] }>('/chat/assistant', 'POST', { text: value.trim(), productId, recentQuestions: messages.filter(m => m.senderRole === 'CUSTOMER').slice(-3).map(m => m.text) }); const now = new Date().toISOString(); setMessages(v => [...v.slice(-38), { _id: crypto.randomUUID(), seq: v.length + 1, senderRole: 'CUSTOMER', text: value.trim(), createdAt: now }, { _id: crypto.randomUUID(), seq: v.length + 2, senderRole: 'BOT', ...result.data, createdAt: now }]); setDraft(''); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="chat-guest"><div className="chat-thread-heading"><button className="icon-button" aria-label="Quay lại lựa chọn chat" onClick={onBack}><ArrowLeft size={18}/></button><div><strong>Trợ lý tự động</strong><small>Hỗ trợ tìm thiết bị và mua sắm</small></div></div><div className="chat-messages" role="log" aria-live="polite"><p className="chat-hint">Hỏi về thiết bị, giá hoặc chính sách. Phiên khách chỉ giữ tạm trong cửa sổ này. <Link to="/login" state={{ from: '/messages' }}>Đăng nhập để lưu lịch sử hoặc gặp nhân viên.</Link></p><Bubbles messages={messages}/><div ref={end}/></div><div className="chat-suggestions">{suggestions.map(s => <button key={s} disabled={busy} onClick={() => send(s)}>{s}</button>)}</div>{error && <p role="alert" className="chat-error">{error}</p>}<form className="chat-composer" onSubmit={e => { e.preventDefault(); void send(); }}><label className="sr-only" htmlFor="guest-chat-input">Nội dung tin nhắn</label><textarea id="guest-chat-input" maxLength={2000} value={draft} onChange={e => setDraft(e.target.value)} disabled={busy} placeholder="Bạn muốn tìm thiết bị gì?"/><button aria-label="Gửi tin nhắn" disabled={busy || !draft.trim()}><Send size={19}/></button></form><span className="chat-sync" role="status">{busy ? 'Đang tra cứu…' : 'BerylCore · Trợ lý tự động'}</span></div>;
}

export function ChatWidget() {
  const { user } = useSession(), location = useLocation();
  const [open, setOpen] = useState(false), [mode, setMode] = useState<Kind | null>(null), [product, setProduct] = useState<string | undefined>();
  const [promptDismissed, setPromptDismissed] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const hidden = location.pathname.startsWith('/admin') || location.pathname === '/messages';
  const compactLauncher=['/account','/cart','/checkout'].includes(location.pathname)||location.pathname.startsWith('/orders/');
  const unread = useChatUnread(!location.pathname.startsWith('/admin'));
  useEffect(() => { setOpen(false); setMode(null); setProduct(undefined); }, [user?.id, location.pathname]);
  useEffect(() => { const ask = (event: Event) => { const detail = (event as CustomEvent<{ productId: string }>).detail; setProduct(detail.productId); setMode('STORE'); setOpen(true); }; window.addEventListener('chat-product', ask); return () => window.removeEventListener('chat-product', ask); }, []);
  useEffect(() => { if (!open) return; panel.current?.focus(); const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); launcher.current?.focus(); } }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, [open]);
  if (hidden || user?.mustChangePassword) return null;
  return <>{!open && !compactLauncher && !promptDismissed && !unread.data?.data.count && <div className="chat-prompt-pill"><button type="button" className="chat-prompt-open" onClick={() => { setPromptDismissed(true); setOpen(true); setMode('STORE'); }}><MessageCircle size={16} aria-hidden="true"/><span>Cần tư vấn thiết bị? Chat ngay</span></button><button type="button" className="chat-prompt-dismiss" aria-label="Ẩn gợi ý chat" onClick={() => setPromptDismissed(true)}><X size={14}/></button></div>}<button ref={launcher} className={'chat-launcher'+(compactLauncher?' chat-launcher-compact':'')} aria-label={open ? 'Đóng hỗ trợ chat' : `Mở hỗ trợ chat${unread.data?.data.count ? ', có tin chưa đọc' : ''}`} aria-expanded={open} aria-controls="support-chat" onClick={() => { setOpen(v => !v); setMode(null); setProduct(undefined); }}><MessageCircle size={22}/><span>Chat hỗ trợ</span>{!!unread.data?.data.count && <b>{unread.data.data.count > 99 ? '99+' : unread.data.data.count}</b>}</button>{open && <div ref={panel} tabIndex={-1} className="chat-widget" id="support-chat" role="dialog" aria-label="Hỗ trợ BerylCore"><div className="chat-widget-heading"><strong>BerylCore / Hỗ trợ</strong><Link to={user?.role && user.role !== 'CUSTOMER' ? '/admin/chat' : '/messages'} aria-label="Mở trang tin nhắn"><ExternalLink size={17}/></Link><button className="icon-button" aria-label="Đóng cửa sổ chat" onClick={() => { setOpen(false); launcher.current?.focus(); }}><X size={19}/></button></div>{!mode ? <div className="chat-choices"><h2>Bạn cần hỗ trợ gì?</h2><p>Tư vấn thiết bị và giải đáp khi mua sắm.</p><button onClick={() => setMode('STORE')}><Headphones/><span><strong>Chat với cửa hàng</strong></span></button><button onClick={() => setMode('BOT')}><Bot/><span><strong>Trợ lý tự động</strong></span></button></div> : user?.role === 'CUSTOMER' ? <ChatWorkspace key={mode} compact initialKind={mode} productId={product} onBack={() => setMode(null)}/> : mode === 'BOT' ? <GuestAssistant productId={product} onBack={() => setMode(null)}/> : <div className="chat-welcome"><Headphones size={36}/><h2>Chat với cửa hàng</h2>{user ? <Link className="button" to="/admin/chat">Mở hộp thư quản trị</Link> : <><p>Đăng nhập để nhân viên nhận diện tài khoản và lưu lịch sử hỗ trợ.</p><Link className="button" to="/login" state={{ from: '/messages' }}>Đăng nhập để chat</Link></>}</div>}</div>}</>;
}

export function MessagesPage() {
  const { user, loading } = useSession();
  if (loading) return <State loading/>;
  if (!user) return <Navigate to="/login" state={{ from: '/messages' }} replace/>;
  if (user.role !== 'CUSTOMER') return <Navigate to="/admin/chat" replace/>;
  return <div className="shell messages-page"><span className="eyebrow">BC / HỖ TRỢ</span><h1>Tin nhắn của bạn.</h1><p>Trao đổi với cửa hàng hoặc sử dụng trợ lý tự động.</p><ChatWorkspace/></div>;
}
