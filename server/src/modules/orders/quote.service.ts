import { getCart } from '../cart/cart.service';
import { Coupon, CouponUsage } from '../coupons/coupon.model';
import { CouponError, normalizeCouponCode } from '../coupons/coupon.service';
import { getStoreSettings, shippingAmount } from '../store/store.model';
export async function quoteOrder(userId: string, input: { couponCode?: unknown }) {
  const cart = await getCart(userId);
  if (!cart.items.length || cart.unavailableCount) throw new CouponError(409, 'Giỏ hàng trống hoặc có sản phẩm không còn đủ tồn kho.');
  const code = normalizeCouponCode(input.couponCode);
  let discountAmount = 0;
  if (code) {
    const now = new Date();
    const c = await Coupon.findOne({ code, isActive: true, startsAt: { $lte: now }, expiresAt: { $gt: now }, minSubtotal: { $lte: cart.totalAmount }, $expr: { $lt: ['$usedCount', '$maxUses'] } });
    if (!c || await CouponUsage.exists({ couponId: c._id, userId, active: true })) throw new CouponError(409, 'Mã giảm giá không khả dụng hoặc đã được sử dụng.');
    discountAmount = Math.min(cart.totalAmount, c.type === 'FIXED' ? c.value : Number(BigInt(cart.totalAmount) * BigInt(c.value) / 100n));
  }
  const settings = await getStoreSettings();
  const shippingFee = shippingAmount(cart.totalAmount - discountAmount, settings);
  if (!Number.isSafeInteger(cart.totalAmount - discountAmount + shippingFee)) throw new CouponError(400, 'Tổng tiền vượt giới hạn cho phép.');
  return { subtotal: cart.totalAmount, discountAmount, shippingFee, totalAmount: cart.totalAmount - discountAmount + shippingFee, couponCode: code || '', shippingNote: settings.shippingConfigured ? 'Phí tính theo chính sách cửa hàng; ngưỡng miễn phí áp dụng sau giảm giá.' : 'Phí trên hệ thống hiện là 0 ₫; cửa hàng chưa cập nhật chính sách giao hàng.', quotedAt: new Date().toISOString() };
}
