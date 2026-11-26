import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api } from './api';
import { ProductCard, State } from './components';
import type { Category, Product } from './types';
import { categoryIcon, categoryPath, DiscoverySection } from './Discovery';
import { HeroSpotlight } from './HeroSpotlight';

export function Home() {
  const products = useQuery({ queryKey: ['home-products'], queryFn: () => api<Product[]>('/products?limit=24') });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/categories') });
  const available = [...(products.data?.data || [])].sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0));
  const categoryKey = (product: Product) => typeof product.categoryId === 'object' ? product.categoryId?._id : product.categoryId;
  const seen = new Set<string | null | undefined>();
  const diverse = available.filter(product => { const key = categoryKey(product); if (seen.has(key)) return false; seen.add(key); return true; });
  const chosen = new Set(diverse.map(product => product._id));
  const selection = [...diverse, ...available.filter(product => !chosen.has(product._id))].slice(0, 8);
  const featured = selection.find(product => typeof product.categoryId === 'object' && /laptop/i.test(product.categoryId?.slug || '')) || selection[0];
  const heroProducts = featured ? [featured, ...selection.filter(product => product._id !== featured._id)].slice(0, 4) : [];

  return <>
    <div className="home-showcase">
      <section className="showcase-layout shell" aria-label="Thiết bị nổi bật">
        <div className="hero-copy">
          <span className="showcase-kicker">Công nghệ cho mỗi ngày</span>
          <h1>Chọn thiết bị.<br/><span>Nâng trải nghiệm.</span></h1>
          <p>Laptop, màn hình và phụ kiện cho góc làm việc của bạn.</p>
          <div className="showcase-actions">
            <Link to="/products" className="button">Xem thiết bị <ArrowRight size={17}/></Link>
          </div>
        </div>
        <HeroSpotlight products={heroProducts}/>
      </section>
    </div>

    <DiscoverySection compact/>
    <section id="featured-products" className="shell selected-products">
      <div className="section-heading collection-heading"><div className="collection-title"><p className="collection-kicker">GỢI Ý CHO BẠN</p><h2>Thiết bị nổi bật</h2><p className="collection-description">Khám phá thiết bị cho góc làm việc và giải trí của bạn.</p></div><Link to="/products" className="text-link">Xem tất cả <ArrowRight size={17}/></Link></div>
      <State loading={categories.isLoading} error={categories.error} retry={() => categories.refetch()}>
        <nav className="collection-tabs" aria-label="Danh mục sản phẩm"><Link to="/products" className="active">Tất cả thiết bị</Link>{categories.data?.data.map(category => {
          const Icon = categoryIcon(category);
          return <Link key={category._id} to={categoryPath(category)}><Icon size={18} strokeWidth={1.6}/>{category.name}</Link>;
        })}</nav>
      </State>
      <State loading={products.isLoading} error={products.error} retry={() => products.refetch()} empty={!products.data?.data.length}>
        <div className="product-grid home-product-grid">{selection.map(product => <ProductCard key={product._id} product={product}/>)}</div>
      </State>
    </section>
  </>;
}
