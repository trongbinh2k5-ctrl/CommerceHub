import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ProductImage } from './components';
import type { Product } from './types';

const DURATION = 4500;
const fallback = { name: 'ASUS ROG Strix G16 (2024)', imageUrl: '/images/products/asus-rog-strix-g16-2024.png' };

export function HeroSpotlight({ products }: { products: Product[] }) {
  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [linkFocused, setLinkFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [announcement, setAnnouncement] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const count = products.length || 1;
  const current = index % count;
  const product = products[current];
  const id = product?._id || 'introduction';
  const image = product || fallback;
  const target = product ? `/products/${product._id}` : '/products';
  // Autoplay is explicitly requested. Reduced-motion changes the fade, not rotation.
  const running = products.length > 1 && !linkFocused && visible && pageVisible;

  useEffect(() => {
    const visibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false), { threshold: .1 }) : null;
    if (root.current) observer?.observe(root.current);
    return () => { document.removeEventListener('visibilitychange', visibility); observer?.disconnect(); };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setIndex(value => (value + 1) % products.length), DURATION);
    return () => window.clearTimeout(timer);
  }, [running, id, products.length, cycle]);

  const choose = (next: number) => {
    const selected = (next + count) % count;
    setIndex(selected); setCycle(value => value + 1);
    setAnnouncement(`Thiết bị ${selected + 1} trên ${count}: ${products[selected]?.name || fallback.name}`);
  };

  return <div ref={root} className="spotlight banner-spotlight" role="region" aria-roledescription="carousel" aria-label="Khám phá thiết bị nổi bật" data-motion={running ? 'running' : 'paused'}
    onFocusCapture={event => setLinkFocused(!!(event.target as Element).closest('a'))}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setLinkFocused(false); }}>
    <div className="banner-stage">
      {(products.length ? products : [null]).map((item, itemIndex) => {
        const active = itemIndex === current;
        const display = item || fallback;
        return <Link key={item?._id || 'introduction'} className="spotlight-visual banner-slide" data-active={active ? 'true' : 'false'} aria-hidden={!active} tabIndex={active ? 0 : -1}
          to={item ? `/products/${item._id}` : '/products'} aria-label={`Xem ${display.name}`}>
          <ProductImage product={display} priority={itemIndex === 0}/>
        </Link>;
      })}
      {products.length > 1 && <>
        <button type="button" className="banner-direction banner-previous" aria-label="Thiết bị trước" onClick={() => choose(current - 1)}><ChevronLeft size={22} strokeWidth={2.2}/></button>
        <button type="button" className="banner-direction banner-next" aria-label="Thiết bị tiếp theo" onClick={() => choose(current + 1)}><ChevronRight size={22} strokeWidth={2.2}/></button>
        <div className="banner-pagination" role="group" aria-label="Chọn thiết bị trong banner">{products.map((item, itemIndex) => <button key={item._id} type="button" aria-label={`Xem thiết bị ${itemIndex + 1}: ${item.name}`} aria-current={itemIndex === current ? 'true' : undefined} onClick={() => choose(itemIndex)}><span aria-hidden="true"/></button>)}</div>
      </>}
    </div>
    <div className="spotlight-caption" aria-live="off">
      <div className="spotlight-info">
        {!product && <span className="spotlight-label">Hình giới thiệu</span>}
        <Link to={target} className="spotlight-name" title={image.name}>{image.name}</Link>
      </div>
    </div>
    <span className="banner-announcement" role="status" aria-live="polite">{announcement}</span>
  </div>;
}
