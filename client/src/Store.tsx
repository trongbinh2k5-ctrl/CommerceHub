import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Minus, Plus, SlidersHorizontal, Star } from 'lucide-react';
import { api, money } from './api';
import { useSession } from './context';
import { FormError, PageHeading, Pagination, ProductCard, ProductImage, State } from './components';
import type { Category, Product, ReviewPage } from './types';
import { ProductGallery, ProductInformation } from './ProductDetails';
export { Home } from './Home';
export function Catalog({ collection, brand }: { collection?: Category; brand?: string } = {}) {
  const [params, setParams] = useSearchParams(); const [search, setSearch] = useState(params.get('search') || '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = ['search', 'categoryId', 'maxPrice', 'brand', 'inStock'].filter(key => !!params.get(key)).length;
  const searchParam = params.get('search') || '';
  useEffect(() => { setSearch(searchParam); }, [searchParam]);
  const page = Number(params.get('page') || 1);
  const query = new URLSearchParams(params); query.set('limit', '12');
  if (collection) query.set('categoryId', collection._id);
  if (brand) query.set('brand', brand);
  const products = useQuery({ queryKey: ['products', query.toString()], queryFn: () => api<Product[]>(`/products?${query}`) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') });
  const facets = useQuery({ queryKey: ['product-facets'], queryFn: () => api<{brands:string[]}>('/products/facets') });
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); if (key !== 'page') next.delete('page'); setParams(next); };
  const clearFilters = () => { setSearch(''); setParams({}); };
  return <div className="shell catalog">
    {(collection || brand) && <nav className="catalog-breadcrumb" aria-label="Đường dẫn"><Link to="/">Trang chủ</Link><span>/</span><Link to={collection ? '/collections' : '/brands'}>{collection ? 'Danh mục' : 'Thương hiệu'}</Link><span>/</span><span aria-current="page">{collection?.name || brand}</span></nav>}
    <PageHeading kicker={collection ? 'BC / DANH MỤC THIẾT BỊ' : brand ? 'BC / THƯƠNG HIỆU' : 'BC / THIẾT BỊ & PHỤ KIỆN'} title={collection?.name || brand || 'Tất cả thiết bị'}/>
    {(collection || brand) && <p className="catalog-intro">{collection?.description || (collection ? `Khám phá ${collection.name.toLowerCase()} và lọc theo mức giá, thương hiệu hoặc tình trạng hàng để chọn thiết bị phù hợp.` : `Khám phá thiết bị ${brand} đang có tại cửa hàng. Chọn danh mục và mức giá để thu hẹp lựa chọn.`)}</p>}
    <div className="mobile-filter-bar"><button type="button" className="button outline filter-toggle" aria-label={activeFilters ? `Bộ lọc, ${activeFilters} điều kiện đang áp dụng` : 'Bộ lọc'} aria-expanded={filtersOpen} aria-controls="catalog-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={17}/>Bộ lọc{activeFilters > 0 && <span className="filter-count" aria-hidden="true">{activeFilters}</span>}</button>{activeFilters > 0 && <button type="button" className="filter-reset" onClick={clearFilters}>Xóa bộ lọc</button>}</div>
    {(categories.isLoading || !!categories.error) && <div className="catalog-filter-status">
      {categories.isLoading && <p className="filter-feedback muted" role="status">Đang tải danh mục…</p>}
      {categories.error && <div className="filter-feedback" role="alert"><p>{categories.error.message}</p><button type="button" className="text-link" onClick={() => categories.refetch()}>Tải lại danh mục</button></div>}
    </div>}
    <div className="catalog-layout">
      <aside id="catalog-filters" className={`filters${filtersOpen ? ' is-open' : ''}`}>
        <h3><SlidersHorizontal size={17}/>Bộ lọc</h3>
        <form onSubmit={e => { e.preventDefault(); update('search', search); }}>
          <label>Tìm thiết bị<input placeholder="Tên sản phẩm…" maxLength={100} value={search} onChange={e => setSearch(e.target.value)}/></label>
          <button className="button outline small">Tìm kiếm <ArrowRight size={15}/></button>
        </form>
        <span className="eyebrow">DANH MỤC</span>
        {collection ? <><p>{collection.name}</p><Link className="text-link" to="/collections">Đổi danh mục <ArrowUpRight size={16}/></Link></> : <>
        <button className={!params.get('categoryId') ? 'filter-option active' : 'filter-option'} onClick={() => update('categoryId', '')}>Tất cả thiết bị <ArrowUpRight size={16}/></button>
        {categories.data?.data.map(c => <button key={c._id} className={params.get('categoryId') === c._id ? 'filter-option active' : 'filter-option'} onClick={() => update('categoryId', c._id)}>{c.name}<ArrowUpRight size={16}/></button>)}
        </>}
        <label>Khoảng giá<select value={params.get('maxPrice') || ''} onChange={e => update('maxPrice', e.target.value)}>
          <option value="">Tất cả mức giá</option>
          <option value="500000">Đến 500.000 ₫</option>
          <option value="2000000">Đến 2.000.000 ₫</option>
          <option value="5000000">Đến 5.000.000 ₫</option>
          <option value="10000000">Đến 10.000.000 ₫</option>
          <option value="20000000">Đến 20.000.000 ₫</option>
          <option value="40000000">Đến 40.000.000 ₫</option>
        </select></label>
        {brand ? <p>Thương hiệu: <strong>{brand}</strong> · <Link to="/brands">Đổi thương hiệu</Link></p> : <label>Thương hiệu<select value={params.get('brand') || ''} onChange={e => update('brand', e.target.value)}><option value="">Tất cả thương hiệu</option>{facets.data?.data.brands.map(brand=><option key={brand} value={brand}>{brand}</option>)}</select></label>}
        <label>Tình trạng hàng<select value={params.get('inStock') || ''} onChange={e => update('inStock', e.target.value)}><option value="">Tất cả</option><option value="true">Còn hàng</option><option value="false">Hết hàng</option></select></label>
        <button className="text-link" onClick={clearFilters}>Xóa bộ lọc ×</button>
      </aside>
      <div>
        <div className="catalog-toolbar">
          <span>{products.data?.pagination?.total ?? '—'} thiết bị{params.get('search') && ` cho “${params.get('search')}”`}</span>
          <label className="sort-label">Sắp xếp<select aria-label="Sắp xếp sản phẩm" value={params.get('sort') || ''} onChange={e => update('sort', e.target.value)}><option value="">Mới nhất</option><option value="price_asc">Giá tăng dần</option><option value="price_desc">Giá giảm dần</option></select></label>
        </div>
        <State loading={products.isLoading} error={products.error} retry={() => products.refetch()} empty={!products.data?.data.length}>
          <div className="product-grid catalog-grid">{products.data?.data.map((p, i) => <ProductCard key={p._id} product={p} index={(page - 1) * 12 + i}/>)}</div>
        </State>
        {!!products.data?.pagination?.totalPages && products.data.pagination.totalPages > 1 && <div className="pagination"><button className="icon-button" disabled={page <= 1} onClick={() => update('page', String(page - 1))} aria-label="Trang trước"><ChevronLeft/></button><span>Trang {page} / {products.data.pagination.totalPages}</span><button className="icon-button" disabled={page >= products.data.pagination.totalPages} onClick={() => update('page', String(page + 1))} aria-label="Trang sau"><ChevronRight/></button></div>}
      </div>
    </div>
  </div>;
}
export function ProductDetail() {
  const { id } = useParams(); const { user, notify } = useSession(); const navigate = useNavigate(); const client = useQueryClient();
  const [quantity, setQuantity] = useState(1); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [reviewPage, setReviewPage] = useState(1);
  useEffect(() => { setQuantity(1); setError(''); setReviewPage(1); }, [id]);
  const product = useQuery({ queryKey: ['product', id], queryFn: () => api<Product>(`/products/${id}`) });
  const reviews = useQuery({ queryKey: ['product-reviews', id, reviewPage], queryFn: () => api<ReviewPage>(`/reviews/products/${id}?page=${reviewPage}`) });
  const reviewPages = reviews.data?.data.pagination?.totalPages;
  useEffect(() => { if (reviewPages !== undefined && reviewPage > Math.max(1, reviewPages)) setReviewPage(Math.max(1, reviewPages)); }, [reviewPages, reviewPage]);
  const summary = useQuery({ queryKey: ['review-summary', id], queryFn: () => api<{ totalReviews: number; averageRating: number }>(`/reviews/products/${id}/summary`) });
  const p = product.data?.data;
  const add = async () => { if (!user) { navigate('/login', { state: { from: `/products/${id}` } }); return; } setBusy(true); setError(''); try { await api('/cart/items', 'POST', { productId: id, quantity }); await client.invalidateQueries({ queryKey: ['cart'] }); notify('Đã thêm thiết bị vào giỏ hàng.'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  return <div className="shell detail-page"><Link to="/products" className="text-link"><ChevronLeft size={16}/>Bộ sưu tập</Link><State loading={product.isLoading} error={product.error} retry={() => product.refetch()}>{p && <><div className="detail-grid"><ProductGallery product={p}/><div className="detail-copy"><span className="eyebrow">{p.sku} / {typeof p.categoryId === 'object' ? p.categoryId?.name || 'THIẾT BỊ' : 'THIẾT BỊ'}</span><h1>{p.name}</h1><div className="rating"><Star size={16}/>{summary.data?.data.averageRating || '—'}<span>({summary.data?.data.totalReviews || 0} đánh giá)</span></div><p className="detail-price">{p.price > 0 ? money(p.price) : 'Liên hệ báo giá'}</p><p className="description">{p.description || 'Thông tin chi tiết đang được cập nhật.'}</p>{p.price === 0 && <p className="catalog-price-note">Giá bán và hàng thực tế đang được xác nhận. <Link to="/contact">Liên hệ cửa hàng</Link></p>}<div className={`stock stock-badge ${p.stock > 0 ? (p.stock <= 5 ? 'low-stock' : 'in-stock') : 'out-stock'}`}><span className="live-dot"/><strong>{p.stock > 0 ? (p.stock <= 5 ? `Chỉ còn ${p.stock} sản phẩm (Sắp hết)` : `Còn ${p.stock} sản phẩm sẵn sàng giao`) : 'Tạm hết hàng'}</strong></div>{p.stock > 0 && p.price > 0 && <div className="buy-row"><div className="quantity-controls"><div className="quantity-stepper"><button type="button" className="qty-btn" aria-label="Giảm số lượng" disabled={busy || p.stock < 1 || quantity <= 1} onClick={() => setQuantity(q => Math.max(1, q - 1))}><Minus size={14}/></button><input aria-label="Số lượng" type="number" min="1" max={Math.max(1, Math.min(99, p.stock))} disabled={p.stock < 1} value={quantity} onChange={e => setQuantity(Number(e.target.value))}/><button type="button" className="qty-btn" aria-label="Tăng số lượng" disabled={busy || p.stock < 1 || quantity >= Math.min(99, p.stock)} onClick={() => setQuantity(q => Math.min(Math.min(99, p.stock), q + 1))}><Plus size={14}/></button></div></div><button className="button" disabled={busy || p.stock < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > Math.min(99, p.stock) || (!!user && user.role !== 'CUSTOMER')} onClick={add}>{busy ? 'Đang thêm…' : 'Thêm vào giỏ'}<ArrowUpRight size={20}/></button></div>}<button className={p.stock < 1 || p.price <= 0 ? "button product-inquiry" : "button outline small product-inquiry"} onClick={() => window.dispatchEvent(new CustomEvent('chat-product', {detail:{productId:p._id}}))}>Hỏi về sản phẩm</button><FormError error={error}/><div className="detail-notes"><span><Check size={16}/>Thanh toán khi nhận hàng (COD)</span><span><Check size={16}/>Theo dõi trạng thái trong tài khoản</span></div></div></div><ProductInformation product={p}/><section className="reviews-section"><div className="section-heading"><div><span className="eyebrow">TỪ NGƯỜI ĐÃ TRẢI NGHIỆM</span><h2>Đánh giá sản phẩm.</h2></div><span>{summary.data?.data.totalReviews || 0} đánh giá</span></div><State loading={reviews.isLoading} error={reviews.error} retry={() => reviews.refetch()} empty={!reviews.data?.data.items.length}><div className="review-grid">{reviews.data?.data.items.map(r => <article key={r._id} className="review"><span>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span><h3>{r.title}</h3><p>{r.comment}</p><small>Đã mua hàng</small></article>)}</div></State><Pagination page={reviewPage} totalPages={reviews.data?.data.pagination?.totalPages} onPage={setReviewPage}/><p className="muted">Bạn có thể viết đánh giá từ đơn hàng sau khi nhận sản phẩm.</p></section></>}</State></div>;
}
export function Story() { return <div className="shell story"><span className="eyebrow">VỀ BERYLCORE / BC</span><h1>Đồ công nghệ.<br/>Câu chuyện <span className="serif-word">con người.</span></h1><div className="story-grid"><span className="story-symbol">✳</span><div><p className="lead">Một thiết bị tốt là thứ bạn muốn sử dụng mỗi ngày.</p><p>BerylCore là nơi bạn tìm thiết bị cho công việc, giải trí và những thói quen riêng. Chúng mình muốn việc lựa chọn trở nên rõ ràng hơn: tên gọi dễ hiểu, giá dễ tìm, trạng thái đơn hàng luôn trong tầm tay.</p><p>Không cần một góc làm việc giống ai. Chỉ cần những món đồ phù hợp với cách bạn làm việc và tận hưởng.</p><Link to="/products" className="button">Khám phá theo cách của bạn <ArrowUpRight size={19}/></Link></div></div></div>; }
