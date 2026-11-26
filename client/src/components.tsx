import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Package, RefreshCw, X, ChevronLeft, ChevronRight, CircleAlert, Clock, Truck, CircleCheck, CircleX, CreditCard } from 'lucide-react';
import { money, statusText } from './api';
import type { Product } from './types';
import { productIllustration } from './product-media';
export function State({ loading, error, retry, empty, children }: { loading?: boolean; error?: Error | null; retry?: () => void; empty?: boolean; children?: ReactNode }) {
  if (loading) return <div className="state" role="status"><span className="spinner"/>Đang tải dữ liệu…</div>;
  if (error) return <div className="state error" role="alert"><p>{error.message}</p>{retry && <button className="button outline" onClick={retry}><RefreshCw size={16}/>Thử lại</button>}</div>;
  if (empty) return <div className="state"><Package size={36} strokeWidth={1}/><h3>Chưa có nội dung ở đây.</h3><p>Khi có dữ liệu mới, bạn sẽ tìm thấy tại đây.</p></div>;
  return <>{children}</>;
}
export function ProductImage({ product, className = '', priority = false }: { product: Pick<Product, 'name' | 'imageUrl'> & { sku?: string }; className?: string; priority?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const illustration = !product.imageUrl ? productIllustration(product) : undefined;
  const source = product.imageUrl || illustration?.src;
  const visible = source && source !== failedUrl;
  useEffect(() => { setFailedUrl(undefined); }, [source]);
  return <div className={`product-image ${className}${illustration ? ' is-illustration' : ''}`} data-image-kind={visible ? illustration ? 'illustration' : 'product' : 'missing'}>{visible ? <><img key={source} src={source} alt={illustration ? `${illustration.label}, chưa có ảnh thực tế của ${product.name}` : product.name} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} onError={() => setFailedUrl(source)}/>{illustration && <span className="illustration-label">Ảnh minh họa</span>}</>: <div className="image-placeholder" role="img" aria-label={`Chưa có ảnh cho ${product.name}`}><Package size={48} strokeWidth={.8}/><span>Ảnh đang cập nhật</span></div>}</div>;
}
export function Pagination({ page, totalPages = 0, onPage }: { page: number; totalPages?: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <nav className="pagination" aria-label="Phân trang"><button className="button outline small" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16} aria-hidden="true"/>Trang trước</button><span>Trang {page} / {totalPages}</span><button className="button outline small" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Trang sau<ChevronRight size={16} aria-hidden="true"/></button></nav>;
}
export function ProductCard({ product }: { product: Product; index?: number }) {
  return <article className="product-card"><Link to={`/products/${product._id}`} className="product-visual" aria-label={`Xem chi tiết ${product.name}`}><ProductImage product={product}/>{product.stock <= 0 && <span className="product-soldout-badge">Hết hàng</span>}</Link><div className="product-info"><Link to={`/products/${product._id}`} title={product.name}><h3>{product.name}</h3></Link><div className="product-card-bottom"><p className="price">{product.price > 0 ? money(product.price) : 'Liên hệ báo giá'}</p><span className={`product-availability ${product.stock > 0 ? 'available' : ''}`}><span className="stock-indicator-dot" aria-hidden="true"/>{product.stock > 0 ? (product.stock <= 5 ? `Còn ${product.stock}` : 'Còn hàng') : 'Hết hàng'}</span></div></div></article>;
}
export const Badge = ({ status }: { status: string }) => {
  const Icon = ({ PENDING: Clock, CONFIRMED: CircleCheck, SHIPPING: Truck, DELIVERED: CircleCheck, CANCELLED: CircleX, PAID: CircleCheck, FAILED: CircleX, REFUNDED: CreditCard } as Record<string, typeof Clock>)[status];
  return <span className={`badge ${status.toLowerCase()}`}>{Icon && <Icon size={14} aria-hidden="true"/>}{statusText[status] || status}</span>;
};
export function Dialog({ title, children, close, className }: { title: string; children: ReactNode; close: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={className} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); close(); }} onClick={e => {
    if (e.target !== e.currentTarget) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) close();
  }}><div className="dialog-inner"><div className="dialog-head"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" onClick={close} aria-label="Đóng"><X/></button></div>{children}</div></dialog>;
}
export function PageHeading({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) { return <div className="page-heading"><div><span className="eyebrow">{kicker}</span><h1>{title}</h1></div>{children}</div>; }
export const FormError = ({ error }: { error: string }) => error ? <p role="alert" className="form-error"><CircleAlert size={16} aria-hidden="true"/> {error}</p> : null;

export function PaymentBadge({status}:{status:string}) { return status === 'PENDING' ? <span className="badge pending"><Clock size={14} aria-hidden="true"/>Chưa thanh toán</span> : <Badge status={status}/>; }
