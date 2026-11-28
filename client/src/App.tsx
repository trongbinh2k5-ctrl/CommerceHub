import { Dialog } from './components';
import {HeaderNotifications} from './HeaderNotifications';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Search, ShoppingCart, UserRound, Menu, X, Cpu, ShieldCheck, Truck, LayoutDashboard, Package, MapPin, Bell, Star, MessageCircle, LogOut } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, money } from './api';
import { useSession } from './context';
import type { Cart, Product } from './types';
import { Home, Catalog, ProductDetail, Story } from './Store';
import { SepayReturn } from './Sepay';
import { VnpayReturn } from './Vnpay';
import { Auth, Account, CartPage, Checkout, OrderDetail } from './Account';
import { Admin } from './Admin';
import { RecoveryPage } from './AccountExtras';
import { StorePage } from './StorePages';
import { ShoppingHelp } from './ShoppingHelp';
import { BrandPage, BrandsPage, CollectionPage, CollectionsPage, DiscoveryNav } from './Discovery';
import { ChatWidget, MessagesPage } from './Chat';
import { BrandLogo } from './BrandLogo';
import { usePageMotion } from './usePageMotion';
import { CredentialGate, StaffOnboarding } from './StaffOnboarding';
function Layout() {
  const { user, logout } = useSession(); const [menu, setMenu] = useState(false); const [search, setSearch] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBoxRef = useRef<HTMLFormElement>(null);
  const inputFocused = useRef(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  usePageMotion(content);
  const navigate = useNavigate(); const location = useLocation();
  const cart = useQuery({ queryKey: ['cart', user?.id], queryFn: () => api<Cart>('/cart'), enabled: user?.role === 'CUSTOMER' });
  const cartQuantity = cart.data?.data.totalQuantity || 0;
  useEffect(() => { setMenu(false); setSearchOpen(false); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [location.pathname, location.search]);
  useEffect(() => { if (location.pathname === '/products') setSearch(new URLSearchParams(location.search).get('search') || ''); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); menuButton.current?.focus(); } };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [menu]);
  useEffect(() => {
    const q = search.trim();
    let active = true;
    setSearchSuggestions([]);
    setSearchLoading(q.length >= 2);
    if (q.length < 2) { setSearchOpen(false); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await api<Product[]>(`/products?search=${encodeURIComponent(q)}&limit=5`);
        if (!active) return;
        setSearchSuggestions(res.data || []);
        if (inputFocused.current) setSearchOpen(true);
      } catch { if (active) setSearchSuggestions([]); }
      finally { if (active) setSearchLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);
  useEffect(() => {
    const dismissSearch = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', dismissSearch);
    return () => document.removeEventListener('mousedown', dismissSearch);
  }, []);
  const currentTab = new URLSearchParams(location.search).get('tab') || 'profile';
  return <>
    <a href="#main" className="skip-link">Đến nội dung chính</a>
    {menu && <Dialog title="Menu" className="customer-menu-drawer" close={() => setMenu(false)}><nav id="customer-menu" aria-label="Menu tài khoản">
      <span className="drawer-section-label">Khám phá</span>
      {[['/', 'Trang chủ', Cpu], ['/products', 'Khám phá thiết bị', Package], ['/collections', 'Danh mục sản phẩm', LayoutDashboard], ['/story', 'Về BerylCore', ShieldCheck], ['/help', 'Hướng dẫn & FAQ', Star]].map(([href, label, Icon]) => { const ItemIcon = Icon as typeof Package; return <Link key={String(href)} to={String(href)} onClick={() => setMenu(false)}><ItemIcon size={20} aria-hidden="true"/>{String(label)}</Link>; })}
      {user && user.role !== 'CUSTOMER' ? <>
        <span className="drawer-section-label">Vận hành & Tài khoản</span>
        {[['/admin', 'Trang quản trị', LayoutDashboard], ['/admin/chat', 'Tin nhắn khách hàng', MessageCircle], ['/account?tab=profile', 'Hồ sơ & bảo mật', UserRound]].map(([href, label, Icon]) => { const ItemIcon = Icon as typeof Package; return <Link key={String(href)} to={String(href)} onClick={() => setMenu(false)}><ItemIcon size={20} aria-hidden="true"/>{String(label)}</Link>; })}
      </> : <>
        <span className="drawer-section-label">Mua sắm & Tài khoản</span>
        {[['/account?tab=orders', 'Đơn hàng của tôi', Truck], ['/cart', 'Giỏ hàng', ShoppingCart], ['/account?tab=profile', 'Hồ sơ & bảo mật', UserRound], ['/account?tab=addresses', 'Sổ địa chỉ', MapPin], ['/account?tab=reviews', 'Đánh giá của tôi', Star], ['/account?tab=support', 'Đổi trả & bảo hành', ShieldCheck], ['/account?tab=notifications', 'Thông báo', Bell], ['/messages', 'Tin nhắn & tư vấn', MessageCircle]].map(([href, label, Icon]) => { const ItemIcon = Icon as typeof Package; return <Link key={String(href)} to={String(href)} onClick={() => setMenu(false)}><ItemIcon size={20} aria-hidden="true"/>{String(label)}</Link>; })}
      </>}
      {user ? <button className="drawer-logout-btn" onClick={() => { setMenu(false); logout(); }}><LogOut size={20} aria-hidden="true"/>Đăng xuất</button> : <Link to="/login" onClick={() => setMenu(false)}><UserRound size={20} aria-hidden="true"/>Đăng nhập / Đăng ký</Link>}
    </nav></Dialog>}
    <header className="site-header">
      <div className="header-main shell">
        <button ref={menuButton} type="button" className="icon-button left-menu" aria-label="Mở menu" aria-expanded={menu} aria-controls={menu ? 'customer-menu' : undefined} onClick={() => setMenu(true)}><Menu/></button><BrandLogo/>
        <div className="navigation">
          <nav id="primary-navigation" className="header-navigation" aria-label="Điều hướng chính">
            <div className="header-links"><NavLink to="/" end>Trang chủ</NavLink><NavLink to="/products">Tất cả thiết bị</NavLink><NavLink to="/story">Về BerylCore</NavLink>{user && (user.role === 'CUSTOMER' ? <Link to="/account?tab=orders" className={location.pathname === '/account' && currentTab === 'orders' ? 'active' : ''}>Đơn hàng của tôi</Link> : <NavLink to="/account">Tài khoản</NavLink>)}</div>
            {user && <button className="mobile-logout" onClick={logout}>Đăng xuất</button>}
          </nav>
        </div>
        <form ref={searchBoxRef} className="header-search" role="search" onSubmit={e => { e.preventDefault(); setSearchOpen(false); navigate(`/products?search=${encodeURIComponent(search)}`); }}>
          <Search size={18} aria-hidden="true"/>
          <input aria-label="Tìm kiếm sản phẩm" placeholder="Tìm laptop, linh kiện…" maxLength={100} value={search} onChange={e => { inputFocused.current = true; setSearch(e.target.value); }} onFocus={() => { inputFocused.current = true; if (search.trim().length >= 2) setSearchOpen(true); }} onBlur={() => { inputFocused.current = false; setTimeout(() => setSearchOpen(false), 200); }}/>
          {searchOpen && search.trim().length >= 2 && (
            <div className="search-dropdown-menu" role="listbox" aria-label="Gợi ý tìm kiếm">
              {searchLoading ? (
                <div className="search-dropdown-loading"><span className="spinner"/> Đang tìm thiết bị…</div>
              ) : searchSuggestions.length > 0 ? (
                <>
                  <div className="search-dropdown-header">Gợi ý thiết bị ({searchSuggestions.length})</div>
                  {searchSuggestions.map(p => (
                    <Link key={p._id} to={`/products/${p._id}`} className="search-dropdown-item" onClick={() => setSearchOpen(false)}>
                      <div className="search-item-thumb">
                        {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy"/> : <Package size={20}/>}
                      </div>
                      <div className="search-item-info">
                        <span className="search-item-title">{p.name}</span>
                        <span className="search-item-price">{p.price > 0 ? money(p.price) : 'Liên hệ báo giá'}</span>
                      </div>
                      <span className={`search-item-stock ${p.stock > 0 ? 'in-stock' : 'out-stock'}`}>
                        {p.stock > 0 ? 'Còn hàng' : 'Hết hàng'}
                      </span>
                    </Link>
                  ))}
                  <button type="submit" className="search-dropdown-all">
                    Xem tất cả kết quả cho "{search.trim()}" <ArrowRight size={14}/>
                  </button>
                </>
              ) : (
                <div className="search-dropdown-empty">
                  <p>Không tìm thấy thiết bị khớp với "{search.trim()}".</p>
                  <button type="submit" className="text-link">Xem tất cả thiết bị</button>
                </div>
              )}
            </div>
          )}
        </form>
        <div className="header-actions">
          <Link to={user ? '/account' : '/login'} className="account-link" aria-label={user ? `Tài khoản ${user.fullName}` : 'Đăng nhập tài khoản'}><UserRound size={20}/><span>{user ? user.fullName.split(' ').at(-1) : 'Tài khoản'}</span></Link>
          <HeaderNotifications/>{user?.role === 'CUSTOMER' || !user ? <Link to="/cart" className="bag-link cart-link" aria-label={`Giỏ hàng, ${cartQuantity} sản phẩm`}><ShoppingCart size={24} strokeWidth={2} aria-hidden="true"/><span className="cart-label">Giỏ hàng</span><span className="cart-count" aria-hidden="true">{cartQuantity > 99 ? '99+' : cartQuantity}</span></Link> : <Link to="/admin" className="text-link" aria-label="Quản trị"><span>Quản trị</span><LayoutDashboard size={20}/></Link>}

        </div>
      </div>
      <DiscoveryNav/>
    </header>
    <main id="main" tabIndex={-1}><div ref={content} className="page-content"><CredentialGate><Outlet/></CredentialGate></div></main>
    <section className="service-strip shell" aria-label="Thông tin mua sắm">
      <div><Truck aria-hidden="true"/><span>Theo dõi đơn hàng<small>Trạng thái ngay trong tài khoản</small></span></div>
      <div><ShieldCheck aria-hidden="true"/><span>Giá và tồn kho rõ ràng<small>Thông tin trên từng sản phẩm</small></span></div>
      <div><Cpu aria-hidden="true"/><span>Tìm thiết bị phù hợp<small>Lọc theo danh mục và mức giá</small></span></div>
    </section>
    <footer className="site-footer">
      <div className="shell footer-top">
        <div className="footer-brand"><BrandLogo/><p>Thiết bị cho công việc và những điều bạn thích.</p></div>
        <div><span className="eyebrow footer-label">Khám phá</span><Link to="/products">Tất cả thiết bị</Link><Link to="/story">Về BerylCore</Link><Link to="/contact">Liên hệ</Link></div><div><span className="eyebrow footer-label">Chính sách</span><Link to="/policies/shipping">Giao hàng</Link><Link to="/policies/returns">Đổi trả</Link><Link to="/policies/warranty">Bảo hành</Link></div>
        <div><span className="eyebrow footer-label">Mua sắm & hỗ trợ</span><Link to="/account?tab=orders">Đơn hàng & địa chỉ</Link><Link to="/cart">Giỏ hàng</Link><Link to="/messages">Tin nhắn</Link><Link to="/help">Hướng dẫn & FAQ</Link></div>
      </div>
      <div className="shell footer-bottom"><span>© {new Date().getFullYear()} BerylCore</span><nav className="footer-legal" aria-label="Thông tin pháp lý"><Link to="/policies/privacy">Quyền riêng tư</Link><Link to="/policies/terms">Điều khoản</Link></nav></div>
    </footer>
    <ChatWidget/>
  </>;
}
export function CustomerGate() { const { user, loading } = useSession(); const location = useLocation(); if (loading) return <div className="state" role="status">Đang khôi phục phiên…</div>; return !user ? <Navigate to="/login" state={{ from: location.pathname + location.search }} replace/> : user.role !== 'CUSTOMER' ? <div className="shell state"><p>Chức năng này dành cho tài khoản khách hàng.</p><Link className="button" to="/admin">Đến quản trị</Link></div> : <Outlet/>; }
export default function App() { return <Routes><Route element={<Layout/>}><Route index element={<Home/>}/><Route path="products" element={<Catalog/>}/><Route path="products/:id" element={<ProductDetail/>}/><Route path="collections" element={<CollectionsPage/>}/><Route path="collections/:slug" element={<CollectionPage/>}/><Route path="brands" element={<BrandsPage/>}/><Route path="brands/:brand" element={<BrandPage/>}/><Route path="contact" element={<StorePage contact/>}/><Route path="help" element={<ShoppingHelp/>}/><Route path="policies/:slug" element={<StorePage/>}/><Route path="story" element={<Story/>}/><Route path="forgot-password" element={<RecoveryPage mode="forgot"/>}/><Route path="reset-password" element={<RecoveryPage mode="reset"/>}/><Route path="verify-email" element={<RecoveryPage mode="verify"/>}/><Route path="login" element={<Auth/>}/><Route path="change-password-required" element={<StaffOnboarding/>}/><Route path="register" element={<Auth register/>}/><Route path="account" element={<Account/>}/><Route path="messages" element={<MessagesPage/>}/><Route path="payments/sepay/return" element={<SepayReturn/>}/><Route element={<CustomerGate/>}><Route path="cart" element={<CartPage/>}/><Route path="checkout" element={<Checkout/>}/><Route path="payments/vnpay/return" element={<VnpayReturn/>}/><Route path="orders/:id" element={<OrderDetail/>}/></Route><Route path="admin/*" element={<Admin/>}/><Route path="*" element={<div className="shell state"><span className="eyebrow">404 / TRANG KHÔNG TỒN TẠI</span><h1>Có lẽ bạn đã rẽ nhầm.</h1><Link to="/" className="button">Về trang chủ <ArrowRight size={17}/></Link></div>}/></Route></Routes>; }
