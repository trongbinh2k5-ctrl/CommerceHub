export function productIllustration(product: { name: string; sku?: string }) {
  const text = `${product.name} ${product.sku || ''}`;
  if (/laptop|notebook|macbook|ultrabook/i.test(text)) return { src: '/images/laptop-illustration.png', label: 'Ảnh minh họa laptop' };
  if (/\bcpu\b|\bintel\b|\bryzen\b|processor|vi xử lý/i.test(text)) return { src: '/images/processor-illustration.png', label: 'Ảnh minh họa bộ xử lý' };
  return undefined;
}
