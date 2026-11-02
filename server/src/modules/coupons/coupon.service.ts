import { ClientSession, Types } from "mongoose";
import { Coupon, CouponUsage } from "./coupon.model";
export class CouponError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message); }
}
export function normalizeCouponCode(input: unknown): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(input.trim())) {
    throw new CouponError(400, "Invalid couponCode");
  }
  return input.trim().toUpperCase();
}
export async function reserveCoupon(code: string, subtotal: number, userId: string, orderId: Types.ObjectId, session: ClientSession) {
  const now = new Date();
  const coupon = await Coupon.findOneAndUpdate({
    code, isActive: true, startsAt: { $lte: now }, expiresAt: { $gt: now },
    minSubtotal: { $lte: subtotal }, $expr: { $lt: ["$usedCount", "$maxUses"] },
  }, { $inc: { usedCount: 1 } }, { returnDocument: "after", session });
  if (!coupon) throw new CouponError(409, "Coupon unavailable, expired, not started, exhausted or minimum subtotal not met");
  if (await CouponUsage.exists({ couponId: coupon._id, userId, active: true }).session(session)) {
    throw new CouponError(409, "Customer already has an active order using this coupon");
  }
  await CouponUsage.create([{ couponId: coupon._id, userId, orderId, active: true }], { session });
  const discountAmount = Math.min(subtotal, coupon.type === "FIXED" ? coupon.value :
    Number(BigInt(subtotal) * BigInt(coupon.value) / 100n));
  return { couponId: coupon._id, couponCode: coupon.code, discountAmount };
}
export async function releaseCoupon(orderId: Types.ObjectId, session: ClientSession) {
  const usage = await CouponUsage.findOneAndUpdate({ orderId, active: true },
    { $set: { active: false, releasedAt: new Date() } }, { returnDocument: "after", session });
  if (!usage) return;
  const result = await Coupon.updateOne({ _id: usage.couponId, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } }, { session });
  if (result.modifiedCount !== 1) throw new CouponError(409, "Coupon usage counter is inconsistent");
}
