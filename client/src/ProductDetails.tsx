import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { Dialog, ProductImage, ProductCard, State } from './components';
import type { Product } from './types';

export function ProductGallery({ product }: { product: Product }) {
  const photos = [...new Set([product.imageUrl, ...(product.gallery || [])].filter(Boolean))] as string[];
  const [selected, setSelected] = useState(''); const [zoom, setZoom] = useState(false);
  const current = photos.includes(selected) ? selected : photos[0];
  return <div className="product-gallery"><button type="button" className="gallery-main" onClick={() => setZoom(true)} aria-label={`Phóng to ảnh ${product.name}`}><ProductImage product={{...product,imageUrl:current}} priority/></button><p className="muted">Nhấn ảnh để phóng to · {photos.length || 0} ảnh sản phẩm</p>{photos.length > 1 && <div className="gallery-thumbnails">{photos.map((src,i) => <button type="button" key={src} aria-label={`Ảnh ${i+1} của ${product.name}`} aria-pressed={src===current} onClick={()=>setSelected(src)}><img src={src} alt=""/></button>)}</div>}{zoom&&<Dialog title={product.name} close={()=>setZoom(false)}><div className="zoomed-product"><ProductImage product={{...product,imageUrl:current}}/></div></Dialog>}</div>;
}
export function ProductInformation({ product: p }: { product: Product }) {
  const related=useQuery({queryKey:['related',p._id],queryFn:()=>api<Product[]>('/products/'+p._id+'/related')});
  const options=useQuery({queryKey:['product-options',p._id],queryFn:()=>api<Product[]>('/products/'+p._id+'/options')});
  useEffect(()=>{
    const oldTitle=document.title; const meta=document.querySelector('meta[name="description"]'); const oldDescription=meta?.getAttribute('content') || '';
    document.title=p.name+' | BerylCore'; meta?.setAttribute('content',(p.description || p.name).slice(0,160));
    const script=document.createElement('script'); script.type='application/ld+json'; script.textContent=JSON.stringify({'@context':'https://schema.org','@type':'Product',name:p.name,sku:p.sku,description:p.description,image:[p.imageUrl,...(p.gallery||[])].filter(Boolean).map(src=>new URL(src!,window.location.origin).href),...(p.brand?{brand:{'@type':'Brand',name:p.brand}}:{}),...(p.price > 0 ? {offers:{'@type':'Offer',priceCurrency:'VND',price:p.price,availability:p.stock>0?'https://schema.org/InStock':'https://schema.org/OutOfStock',url:window.location.href.split('?')[0]}} : {})});document.head.appendChild(script);
    const canonical=document.createElement('link');canonical.rel='canonical';canonical.href=window.location.origin+'/products/'+p._id;document.head.appendChild(canonical);
    return ()=>{document.title=oldTitle;meta?.setAttribute('content',oldDescription);script.remove();canonical.remove();};
  },[p]);
  return <><section className="product-information"><div className="product-facts"><h2>Thông tin sản phẩm</h2><dl><div><dt>Mã SKU</dt><dd>{p.sku}</dd></div><div><dt>Thương hiệu</dt><dd>{p.brand||'Chưa cập nhật'}</dd></div><div><dt>Model</dt><dd>{p.modelName||'Chưa cập nhật'}</dd></div><div><dt>Tình trạng</dt><dd>{p.condition||'Chưa cập nhật'}</dd></div><div><dt>Xuất xứ</dt><dd>{p.origin||'Chưa cập nhật'}</dd></div></dl>{!!options.data?.data.length&&<><h3>Phiên bản cùng dòng</h3><div className="variant-links">{options.data.data.map(o=><Link className="button outline small" aria-current={o._id===p._id?'page':undefined} key={o._id} to={'/products/'+o._id}>{o.variantLabel||o.name}</Link>)}</div></>}<h3>Bảo hành</h3><p>{p.warrantyText||'Cửa hàng chưa cập nhật thông tin bảo hành cho SKU này.'} <Link className="text-link" to="/policies/warranty">Xem chính sách</Link></p><h3>Phụ kiện đi kèm</h3><p>{p.bundle||'Chưa cập nhật phụ kiện đi kèm.'}</p></div><div><h2>Thông số kỹ thuật</h2>{p.specifications?.length?<dl className="specification-table">{p.specifications.map((s,i)=><div key={i}><dt>{s.label}</dt><dd>{s.label === 'Nguồn thông tin' && /^https:\/\//.test(s.value) ? <a href={s.value} target="_blank" rel="noopener noreferrer">Xem thông tin từ hãng ↗</a> : s.value}</dd></div>)}</dl>:<div className="subtle-box"><p>Thông số chính xác của SKU này chưa được cửa hàng cập nhật.</p><Link className="text-link" to="/contact">Liên hệ để xác nhận cấu hình trước khi mua</Link></div>}<p><Link to="/policies/shipping">Giao hàng</Link> · <Link to="/policies/returns">Đổi trả</Link></p></div></section><section className="related-products"><h2>Thiết bị liên quan</h2><State loading={related.isLoading} error={related.error} retry={()=>related.refetch()} empty={!related.data?.data.length}><div className="product-grid">{related.data?.data.map(product=><ProductCard key={product._id} product={product}/>)}</div></State></section></>;
}
