import { Product } from '../products/product.model';
import { Category } from '../categories/category.model';
import { getStoreSettings } from '../store/store.model';
import { normalize, escapeRegex, understandShopping, faqReply, type AssistantContext } from './chat.understanding';
export { normalize } from './chat.understanding';
export interface BotReply { text: string; cards?: { productId: string; name: string; imageUrl: string; price: number; stock: number }[] }
export interface AssistantProvider { reply(text: string, productId?: string, context?: AssistantContext): Promise<BotReply> }

export async function publicChatProduct(productId: string) {
  const product = await Product.findOne({ _id: productId, isActive: true }).lean();
  if (product?.categoryId && !await Category.exists({ _id: product.categoryId, isActive: true })) return null;
  return product;
}

/** Replace this provider with an API adapter later. No orders or account secrets are accessible here. */
export const scriptedAssistant: AssistantProvider = {
  async reply(text, productId, context = {}) {
    const n = normalize(text);
    if (/nhan vien|nguoi ban|gap nguoi|tu van truc tiep/.test(n)) return { text: 'Bạn có thể chọn “Chat với cửa hàng”. Trước khi chuyển, hãy kiểm tra nội dung tóm tắt; chỉ nội dung bạn xác nhận mới được gửi cho nhân viên.' };
    const faq = faqReply(text);
    if (faq) return { text: faq };
    const policies: [RegExp, string, string][] = [[/bao hanh/, 'warranty', 'bảo hành'], [/doi tra|hoan tra|doi hang|tra hang|hoan tien/, 'returns', 'đổi trả'], [/giao hang|van chuyen|\bship\b/, 'shipping', 'giao hàng'], [/lien he|dia chi|so dien thoai|hotline|gio mo cua|gio lam viec|mo cua|dong cua|shop.*o dau|cua hang.*o dau/, 'contact', 'liên hệ']];
    const policy = policies.find(([pattern]) => pattern.test(n));
    if (policy) {
      const settings = await getStoreSettings();
      const content = policy[1] === 'contact' ? [settings.phone, settings.email, settings.address, settings.hours].filter(Boolean).join('\n') : String(settings[policy[1] as 'warranty' | 'returns' | 'shipping'] || '');
      return { text: content.trim() ? `Thông tin ${policy[2]} cửa hàng đã cập nhật:\n${content.slice(0, 3000)}` : `Thông tin ${policy[2]} chưa được cửa hàng công bố. Vui lòng chat với nhân viên để xác nhận trước khi mua.` };
    }
    if (productId && /thong so|cau hinh|chi tiet|gia|ton kho|con hang|co hang|het hang|san pham nay|may nay|cai nay/.test(n)) {
      const p = await publicChatProduct(productId);
      if (!p) return { text: 'Sản phẩm này hiện không còn được công bố. Bạn có thể tìm thiết bị khác hoặc hỏi nhân viên.' };
      return { text: `${p.name}\n${p.price > 0 ? `Giá hiện tại: ${p.price.toLocaleString('vi-VN')} đ.` : 'Liên hệ báo giá.'} ${p.stock > 0 ? `Tồn kho: ${p.stock}.` : 'Hiện hết hàng.'}\n${p.specifications.length ? p.specifications.slice(0, 8).map(s => `${s.label}: ${s.value}`).join('\n').slice(0, 3000) : 'Thông số SKU chưa được cập nhật.'}`, cards: [card(p)] };
    }
    const intent = understandShopping(text, context);
    if (intent.budget?.invalid) return { text: 'Mức ngân sách chưa hợp lệ. Hãy nhập ví dụ “Laptop từ 10 đến 20 triệu”, với mức thấp trước mức cao.' };
    if (intent.shopping) {
      const categories = await Category.find({ isActive: true }).select('name slug').lean();
      const category = intent.category ? categories.find(c => intent.category!.categories.some(alias => normalize(c.name).includes(alias) || normalize(c.slug).replace(/-/g, ' ').includes(alias))) : categories.find(c => n.includes(normalize(c.name)));
      const filter: Record<string, any> = { isActive: true, $and: [{ $or: [{ categoryId: null }, { categoryId: { $in: categories.map(c => c._id) } }] }] };
      if (category) filter.categoryId = category._id;
      else if (intent.category) filter.name = { $regex: intent.category.names, $options: 'i' };
      if (intent.brand) filter.brand = { $regex: `^${escapeRegex(intent.brand)}$`, $options: 'i' };
      if (intent.budget) filter.price = { $gt: 0, ...(intent.budget.min !== undefined ? { $gte: intent.budget.min } : {}), ...(intent.budget.max !== undefined ? { $lte: intent.budget.max } : {}) };
      else if (intent.cheapest) filter.price = { $gt: 0 };
      if (intent.stock) filter.stock = intent.stock === 'IN' ? { $gt: 0 } : 0;
      if (!category && !intent.category && !intent.brand && !intent.budget && !intent.stock && !/san pham|thiet bi|goi y|tu van|gaming|van phong|hoc tap/.test(n)) {
        const tokens = text.trim().split(/\s+/).filter(t => t.length >= 3 && !/^(tim|mua|gia|cho|toi|cua|con|hang|minh|muon|can|ban|giup|voi|nhe|khong)$/i.test(normalize(t))).slice(0, 5);
        if (tokens.length) filter.$and.push({ $or: ['name', 'brand', 'sku'].map(key => ({ [key]: { $regex: tokens.map(escapeRegex).join('|'), $options: 'i' } })) });
      }
      const products = await Product.find(filter).sort(intent.cheapest ? { price: 1, _id: 1 } : { stock: -1, price: 1, _id: 1 }).limit(4).lean();
      const budget = intent.budget;
      const priceText = budget ? budget.min !== undefined && budget.max !== undefined ? ` trong khoảng ${budget.min.toLocaleString('vi-VN')}–${budget.max.toLocaleString('vi-VN')} đ` : budget.min !== undefined ? ` từ ${budget.min.toLocaleString('vi-VN')} đ` : ` không quá ${budget.max!.toLocaleString('vi-VN')} đ` : '';
      return { text: products.length ? `Mình tìm được một số ${category?.name || 'thiết bị'}${intent.brand ? ' của ' + intent.brand : ''}${priceText}${intent.stock === 'IN' ? ' còn hàng' : intent.stock === 'OUT' ? ' đang hết hàng' : ''}. Giá và tồn kho được tra tại thời điểm trả lời; mở sản phẩm để xem thông tin mới nhất. Bạn có thể hỏi tiếp mức giá hoặc tình trạng còn hàng.` : 'Chưa tìm thấy sản phẩm có dữ liệu phù hợp. Các SKU chưa cập nhật giá không được đưa vào bộ lọc ngân sách. Bạn có thể đổi danh mục, bỏ mức giá hoặc hỏi nhân viên.', cards: products.map(card) };
    }
    if (/^(xin chao|chao|hello|hi|alo|shop oi|ad oi|hey)[ !.,?]*$/.test(n)) return { text: 'Chào bạn! Mình là trợ lý tự động của BerylCore. Bạn đang tìm thiết bị gì? Thử “Laptop từ 10 đến 20 triệu”, “Chuột Logitech còn hàng” hoặc hỏi về mua hàng, tài khoản và bảo hành nhé.' };
    return { text: 'Mình chưa hiểu rõ câu hỏi. Bạn thử nêu loại thiết bị, thương hiệu và ngân sách, hoặc hỏi về tài khoản, thanh toán, giao hàng và bảo hành. Cần tư vấn thêm, bạn có thể chuyển sang Chat với cửa hàng.' };
  },
};
function card(p: { _id: unknown; name: string; imageUrl: string; price: number; stock: number }) { return { productId: String(p._id), name: p.name, imageUrl: p.imageUrl, price: p.price, stock: p.stock }; }
