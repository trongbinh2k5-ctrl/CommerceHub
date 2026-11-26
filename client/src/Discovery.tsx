import { useEffect, useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, ChevronDown, Cpu, Headphones, Keyboard, Laptop, Monitor, Mouse, Package } from 'lucide-react';
import { api } from './api';
import { PageHeading, ProductImage, State } from './components';
import { Catalog } from './Store';
import type { Category, Product } from './types';

export const categoryPath = (category: Category) => `/collections/${encodeURIComponent(category.slug)}`;
export function categoryIcon(category: Category) {
  const text = `${category.name} ${category.slug}`.toLowerCase();
  if (/laptop|notebook/.test(text)) return Laptop;
  if (/cpu|chip|linh-kien|linh kiện/.test(text)) return Cpu;
  if (/am-thanh|âm thanh|tai-nghe|tai nghe/.test(text)) return Headphones;
  if (/ban-phim|bàn phím/.test(text)) return Keyboard;
  if (/man-hinh|màn hình/.test(text)) return Monitor;
  if (/phu-kien|phụ kiện|chuot|chuột/.test(text)) return Mouse;
  return Package;
}
const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') });
const useBrands = () => useQuery({ queryKey: ['product-facets'], queryFn: () => api<{ brands: string[] }>('/products/facets') });

function CollectionCard({ category }: { category: Category }) {
  const preview = useQuery({ queryKey: ['collection-preview', category._id], queryFn: () => api<Product[]>(`/products?categoryId=${encodeURIComponent(category._id)}&limit=1`) });
  const Icon = categoryIcon(category);
  const product = preview.data?.data[0];
  return <Link className="discovery-card" to={categoryPath(category)}>
    <div className="discovery-card-art" aria-hidden="true">{product ? <ProductImage product={product}/> : <Icon size={64} strokeWidth={1}/>}</div>
    <div className="discovery-card-copy"><span className="discovery-card-count">{preview.data?.pagination ? `${preview.data.pagination.total} thiết bị` : 'Khám phá danh mục'}</span><h3>{category.name}<ArrowUpRight size={20}/></h3><p>{category.description || `Xem các thiết bị trong danh mục ${category.name}.`}</p></div>
  </Link>;
}

export function DiscoverySection({ compact = false }: { compact?: boolean }) {
  const categories = useCategories();
  return <section id={compact ? 'collections' : undefined} className={compact ? 'shell discovery-section' : 'discovery-section'} aria-labelledby="discovery-title">
    <div className="section-heading"><div><span className="eyebrow">KHÁM PHÁ THEO CÁCH CỦA BẠN</span><h2 id="discovery-title">Một góc công nghệ cho bạn.</h2><p className="muted">Bắt đầu từ nhóm thiết bị bạn đang tìm.</p></div>{compact && <Link className="text-link" to="/collections">Tất cả danh mục <ArrowRight size={17}/></Link>}</div>
    <State loading={categories.isLoading} error={categories.error} retry={() => categories.refetch()} empty={!categories.data?.data.length}>
      <div className="discovery-grid">{(compact ? categories.data?.data.slice(0, 4) : categories.data?.data)?.map(category => <CollectionCard key={category._id} category={category}/>)}</div>
    </State>
  </section>;
}

export function CollectionsPage() {
  return <div className="shell discovery-page"><PageHeading kicker="BC / DANH MỤC THIẾT BỊ" title="Bạn đang tìm thiết bị gì?"/><p className="discovery-lead">Từng nhóm thiết bị, từng lựa chọn cho góc làm việc và giải trí của bạn.</p><DiscoverySection/><div className="discovery-callout"><div><h2>Đã có thương hiệu yêu thích?</h2><p>Khám phá các hãng đang có sản phẩm tại BerylCore.</p></div><Link to="/brands" className="button outline">Xem thương hiệu <ArrowRight size={18}/></Link></div></div>;
}

export function CollectionPage() {
  const { slug } = useParams(); const categories = useCategories();
  const category = categories.data?.data.find(item => item.slug === slug);
  return <State loading={categories.isLoading} error={categories.error} retry={() => categories.refetch()}>{category ? <Catalog key={category._id} collection={category}/> : <div className="shell state"><h1>Không tìm thấy danh mục</h1><Link className="button" to="/collections">Khám phá danh mục khác</Link></div>}</State>;
}

export function BrandsPage() {
  const brands = useBrands();
  return <div className="shell discovery-page"><PageHeading kicker="BC / THƯƠNG HIỆU" title="Tìm thiết bị theo thương hiệu."/><p className="discovery-lead">Các thương hiệu có sản phẩm trong danh mục hiện tại của cửa hàng.</p><State loading={brands.isLoading} error={brands.error} retry={() => brands.refetch()} empty={!brands.data?.data.brands.length}><div className="brand-directory">{brands.data?.data.brands.map(brand => <Link key={brand} to={`/brands/${encodeURIComponent(brand)}`}><span className="brand-initial" aria-hidden="true">{Array.from(brand)[0]}</span><h2>{brand}</h2><span className="text-link">Khám phá thiết bị <ArrowUpRight size={18}/></span></Link>)}</div></State><div className="discovery-callout"><div><h2>Muốn chọn theo loại thiết bị?</h2><p>Xem các danh mục để thu hẹp lựa chọn.</p></div><Link className="button outline" to="/collections">Xem danh mục <ArrowRight size={18}/></Link></div></div>;
}

export function BrandPage() {
  const { brand } = useParams(); const brands = useBrands();
  const selected = brands.data?.data.brands.find(item => item === brand);
  return <State loading={brands.isLoading} error={brands.error} retry={() => brands.refetch()}>{selected ? <Catalog key={selected} brand={selected}/> : <div className="shell state"><h1>Không tìm thấy thương hiệu</h1><Link className="button" to="/brands">Xem các thương hiệu</Link></div>}</State>;
}

export function DiscoveryNav() {
  const categories = useCategories(); const location = useLocation(); const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (menu.current) menu.current.open = false; }, [location.pathname, location.search]);
  useEffect(() => {
    const dismiss = (e: PointerEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) menu.current.open = false; };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && menu.current?.open) { menu.current.open = false; menu.current.querySelector('summary')?.focus(); } };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, []);
  return <div className="discovery-nav"><div className="shell discovery-nav-inner"><details ref={menu} className="category-menu"><summary><Package size={17}/>Danh mục thiết bị<ChevronDown size={15}/></summary><nav className="category-menu-panel" aria-label="Chọn danh mục thiết bị"><Link to="/collections">Khám phá tất cả danh mục <ArrowRight size={16}/></Link>{categories.isLoading && <p role="status">Đang tải danh mục…</p>}{categories.error && <button className="text-link" onClick={() => categories.refetch()}>Thử tải lại danh mục</button>}{categories.data?.data.map(category => { const Icon = categoryIcon(category); return <Link key={category._id} to={categoryPath(category)}><Icon size={18}/>{category.name}</Link>; })}<Link to="/brands">Thương hiệu <ArrowUpRight size={16}/></Link></nav></details><nav className="discovery-quick-links" aria-label="Khám phá thiết bị">{categories.data?.data.slice(0, 4).map(category => <Link key={category._id} to={categoryPath(category)}>{category.name}</Link>)}<Link to="/brands">Thương hiệu <ArrowUpRight size={14}/></Link></nav></div></div>;
}
