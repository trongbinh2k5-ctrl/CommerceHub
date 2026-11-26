import { isValidProductImage } from './product-image';
export type ProductDetails = { brand?: string; modelName?: string; condition?: string; warrantyText?: string; origin?: string; bundle?: string; variantGroup?: string; variantLabel?: string; gallery?: string[]; specifications?: { label: string; value: string }[] };
export function parseProductDetails(input: Record<string, unknown>): ProductDetails {
  const data: ProductDetails = {};
  for (const key of ['brand', 'modelName', 'condition', 'warrantyText', 'origin', 'bundle', 'variantGroup', 'variantLabel'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > (['warrantyText', 'bundle'].includes(key) ? 2000 : 160)) throw new Error('Thông tin chi tiết sản phẩm không hợp lệ.');
    data[key] = value.trim();
  }
  if (input.gallery !== undefined) {
    if (!Array.isArray(input.gallery) || input.gallery.length > 12 || input.gallery.some(v => !v || !isValidProductImage(v))) throw new Error('Bộ ảnh chỉ gồm tối đa 12 URL ảnh hợp lệ.');
    data.gallery = [...new Set(input.gallery as string[])];
  }
  if (input.specifications !== undefined) {
    if (!Array.isArray(input.specifications) || input.specifications.length > 50 || input.specifications.some(s => !s || typeof s.label !== 'string' || !s.label.trim() || s.label.length > 100 || typeof s.value !== 'string' || !s.value.trim() || s.value.length > 500)) throw new Error('Thông số kỹ thuật không hợp lệ.');
    data.specifications = input.specifications.map(s => ({ label: s.label.trim(), value: s.value.trim() }));
  }
  return data;
}
