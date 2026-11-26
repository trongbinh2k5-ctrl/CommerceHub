import { Product } from '../products/product.model';
import { Category } from '../categories/category.model';
import { User } from '../auth/user.model';
import { Order } from '../orders/order.model';
import { Payment } from '../payments/payment.model';
import { StockMovement } from '../operations/operations.models';
import { Shipment } from '../shipping/shipping.model';
import { Review } from '../reviews/review.model';
import { Coupon } from '../coupons/coupon.model';
import { makeWorkbook, productColumns, type Column } from './workbook';
import { excelFail } from './import.service';
import mongoose from 'mongoose';

export const exportKinds = ['products', 'categories', 'staff', 'inventory', 'orders', 'payments', 'revenue', 'shipping', 'reviews', 'coupons'] as const;
export type ExportKind = typeof exportKinds[number];
const col = (key: string, header: string, format = '@', width = 25): Column => ({ key, header, format, width });
const labels: Record<string, string> = { PENDING: 'Chờ xử lý', CONFIRMED: 'Đã xác nhận', SHIPPING: 'Đang giao', DELIVERED: 'Đã giao', CANCELLED: 'Đã hủy', RETURNED: 'Đã hoàn', PAID: 'Đã thanh toán', READY: 'Chờ lấy hàng', PICKED_UP: 'Đã lấy hàng', IN_TRANSIT: 'Đang trung chuyển', OUT_FOR_DELIVERY: 'Đang giao', DELIVERY_FAILED: 'Giao thất bại', RETURNING: 'Đang hoàn', CUSTOMER: 'Khách hàng', STAFF: 'Nhân viên', ADMIN: 'Quản trị' };
const dateCol = (key: string, title: string) => col(key, title, 'yyyy-mm-dd hh:mm', 23);
function dateRange(filters: Record<string, unknown>, field: string) {
  const result: Record<string, Date> = {};
  for (const key of ['from', 'to']) if (filters[key]) {
    const value = filters[key];
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return excelFail(400, 'Ngày lọc không hợp lệ.');
    const date = new Date(value + 'T00:00:00.000Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return excelFail(400, 'Ngày lọc không hợp lệ.');
    result[key === 'from' ? '$gte' : '$lt'] = key === 'to' ? new Date(date.getTime() + 86400000) : date;
  }
  if (result.$gte && result.$lt && result.$gte >= result.$lt) return excelFail(400, 'Khoảng ngày không hợp lệ.');
  return Object.keys(result).length ? { [field]: result } : {};
}
export async function exportWorkbook(kind: ExportKind, scope: unknown, ids: unknown, filters: Record<string, unknown> = {}) {
  if (!['page', 'filtered'].includes(String(scope))) return excelFail(400, 'Chọn xuất trang hiện tại hoặc toàn bộ kết quả lọc.');
  if (Object.keys(filters).some(key => !['search', 'status', 'from', 'to', 'missingImages', 'role'].includes(key)) || Object.values(filters).some(v => typeof v !== 'string' && typeof v !== 'boolean')) return excelFail(400, 'Bộ lọc xuất không hợp lệ.');
  const filter: Record<string, any> = { ...dateRange(filters, kind === 'revenue' ? 'paidAt' : 'createdAt') };
  if (scope === 'page') {
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => typeof id !== 'string' || !mongoose.isValidObjectId(id))) return excelFail(400, 'Danh sách dòng xuất không hợp lệ.');
    filter._id = { $in: ids };
  }
  if (filters.search !== undefined && (typeof filters.search !== 'string' || filters.search.length > 100)) return excelFail(400, 'Từ khóa quá dài.');
  const search = String(filters.search || '').trim(), escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (search && kind !== 'revenue' && scope !== 'page') {
    const fields = kind === 'products' ? ['name', 'sku'] : kind === 'categories' ? ['name', 'slug'] : kind === 'staff' ? ['fullName', 'email'] : kind === 'orders' ? ['shippingAddress.fullName', 'shippingAddress.phone'] : kind === 'shipping' ? ['trackingCode', 'carrier'] : kind === 'reviews' ? ['title', 'comment'] : kind === 'coupons' ? ['code'] : [];
    filter.$or = fields.map(field => ({ [field]: new RegExp(escaped, 'i') }));
    if (mongoose.isValidObjectId(search)) filter.$or.push({ _id: new mongoose.Types.ObjectId(search) }, ...(['payments', 'shipping'].includes(kind) ? [{ orderId: new mongoose.Types.ObjectId(search) }] : []));
    if (!filter.$or.length) return excelFail(400, 'Màn hình này không hỗ trợ từ khóa xuất.');
  }
  if (filters.status && scope !== 'page') {
    if (!Object.keys(labels).includes(String(filters.status))) return excelFail(400, 'Trạng thái không hợp lệ.');
    filter.status = filters.status;
  }
  if (kind === 'staff') filter.role = 'STAFF';
  if (kind === 'products' && filters.missingImages === true) filter.imageUrl = { $in: ['', null] };
  if (kind === 'revenue') filter.status = 'PAID';
  let model: any = ({ products: Product, categories: Category, staff: User, inventory: StockMovement, orders: Order, payments: Payment, revenue: Payment, shipping: Shipment, reviews: Review, coupons: Coupon } as Record<string, any>)[kind];
  let query = model.find(filter).sort({ createdAt: -1, _id: -1 }).limit(10001);
  if (kind === 'products') query = query.populate('categoryId', 'slug name');
  if (kind === 'inventory') query = query.populate('productId', 'name sku').populate('actorId', 'fullName');
  const data: any[] = await query.lean();
  if (data.length > 10000) return excelFail(400, 'Kết quả vượt 10.000 dòng. Hãy thu hẹp bộ lọc hoặc khoảng ngày.');
  let columns: Column[], rows: Record<string, unknown>[];
  if (kind === 'products') {
    columns = [col('id', 'ID sản phẩm'), ...productColumns, col('stock', 'Tồn kho', '#,##0'), col('active', 'Trạng thái')];
    rows = data.map(p => ({ ...p, id: p._id, categorySlug: p.categoryId?.slug || '', specifications: p.specifications?.map((s: any) => `${s.label}: ${s.value}`).join('\n'), gallery: p.gallery?.join('\n'), active: p.isActive ? 'Đang bán' : 'Đã ẩn' }));
  } else if (kind === 'categories') {
    columns = [col('id', 'ID danh mục'), col('name', 'Tên danh mục'), col('slug', 'Mã danh mục'), col('description', 'Mô tả'), col('active', 'Trạng thái')];
    rows = data.map(c => ({ ...c, id: c._id, active: c.isActive ? 'Hiển thị' : 'Đã ẩn' }));
  } else if (kind === 'staff') {
    columns = [col('id', 'Mã nhân viên'), col('fullName', 'Họ tên'), col('email', 'Email', '@', 35), col('phone', 'Số điện thoại'), col('active', 'Trạng thái'), dateCol('createdAt', 'Ngày tạo')];
    rows = data.map(u => ({ ...u, id: u._id, active: !u.isActive ? 'Đã khóa' : u.mustChangePassword ? 'Cần đổi mật khẩu' : 'Hoạt động' }));
  } else if (kind === 'inventory') {
    columns = [col('sku', 'SKU'), col('name', 'Tên sản phẩm'), col('delta', 'Số lượng thay đổi', '#,##0'), col('before', 'Tồn trước', '#,##0'), col('after', 'Tồn sau', '#,##0'), col('actor', 'Người thực hiện'), col('reason', 'Lý do', '@', 45), dateCol('createdAt', 'Thời gian')];
    rows = data.map(r => ({ ...r, sku: r.productId?.sku || '', name: r.productId?.name || '', actor: r.actorId?.fullName || 'Hệ thống' }));
  } else if (kind === 'orders') {
    columns = [col('id', 'Mã đơn hàng'), dateCol('createdAt', 'Ngày đặt'), col('receiver', 'Người nhận'), col('phone', 'Số điện thoại'), col('address', 'Địa chỉ', '@', 45), col('statusText', 'Trạng thái'), col('subtotal', 'Tiền hàng', '#,##0'), col('discountAmount', 'Giảm giá', '#,##0'), col('shippingFee', 'Phí giao hàng', '#,##0'), col('totalAmount', 'Tổng thanh toán', '#,##0'), col('itemsText', 'Sản phẩm', '@', 55)];
    rows = data.map(o => ({ ...o, id: o._id, receiver: o.shippingAddress.fullName, phone: o.shippingAddress.phone, address: [o.shippingAddress.detail, o.shippingAddress.ward, o.shippingAddress.province].join(', '), statusText: labels[o.status] || o.status, itemsText: o.items.map((i: any) => `${i.sku} × ${i.quantity}`).join('\n') }));
  } else if (kind === 'shipping') {
    columns = [col('id', 'ID vận đơn'), col('orderId', 'Mã đơn hàng'), col('trackingCode', 'Mã vận đơn'), col('carrier', 'Đơn vị vận chuyển'), col('statusText', 'Trạng thái'), dateCol('createdAt', 'Ngày tạo')];
    rows = data.map(s => ({ ...s, id: s._id, statusText: labels[s.status] || s.status }));
  } else if (kind === 'reviews') {
    columns = [col('id', 'Mã đánh giá'), col('productId', 'Mã sản phẩm'), col('orderId', 'Mã đơn hàng'), col('rating', 'Số sao', '0'), col('title', 'Tiêu đề'), col('comment', 'Nội dung', '@', 60), col('statusText', 'Trạng thái'), dateCol('createdAt', 'Ngày tạo')];
    rows = data.map(r => ({ ...r, id: r._id, statusText: ({ VISIBLE: 'Hiển thị', HIDDEN: 'Đã ẩn', DELETED: 'Đã xóa' } as Record<string, string>)[r.status] || r.status }));
  } else if (kind === 'coupons') {
    columns = [col('code', 'Mã giảm giá'), col('typeText', 'Loại giảm'), col('value', 'Giá trị giảm', '#,##0'), col('minSubtotal', 'Đơn tối thiểu', '#,##0'), col('usedCount', 'Lượt đã dùng', '#,##0'), col('maxUses', 'Tổng lượt', '#,##0'), dateCol('startsAt', 'Bắt đầu'), dateCol('expiresAt', 'Hết hạn'), col('active', 'Trạng thái')];
    rows = data.map(c => ({ ...c, typeText: c.type === 'PERCENT' ? 'Phần trăm' : 'VND', active: c.isActive ? 'Đang bật' : 'Đã tắt' }));
  } else if (kind === 'payments') {
    columns = [col('id', 'Mã thanh toán'), col('orderId', 'Mã đơn hàng'), col('amount', 'Số tiền', '#,##0'), col('statusText', 'Trạng thái'), col('refundStatus','Hoàn tiền'),col('refundAmount','Đã hoàn (VND)','#,##0'), dateCol('paidAt', 'Ngày thu tiền'), dateCol('createdAt', 'Ngày tạo')];
    rows = data.map(p => ({ ...p, id: p._id, statusText: labels[p.status] || p.status }));
  } else {
    const days = new Map<string, { period: string; count: number; amount: number }>();
    data.forEach(p => { if (!p.paidAt) return; const period = new Date(p.paidAt).toISOString().slice(0, 10), row = days.get(period) || { period, count: 0, amount: 0 }; row.count++; row.amount += p.amount-(p.refundStatus==='COMPLETED'?(p.refundAmount||0):0); days.set(period, row); });
    columns = [col('period', 'Ngày thu tiền (UTC)'), col('count', 'Số thanh toán đã thu', '#,##0'), col('amount', 'Doanh thu sau hoàn tiền (VND)', '#,##0', 32)];
    rows = [...days.values()].sort((a, b) => a.period.localeCompare(b.period));
  }
  return makeWorkbook(columns, rows);
}
