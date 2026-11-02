import { Schema, model } from "mongoose";
const integer = { validator: Number.isSafeInteger, message: "Must be a safe integer" };
const couponSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: ["FIXED", "PERCENT"], required: true },
  value: { type: Number, required: true, min: 1, validate: integer },
  minSubtotal: { type: Number, default: 0, min: 0, validate: integer },
  maxUses: { type: Number, required: true, min: 1, validate: integer },
  usedCount: { type: Number, default: 0, min: 0, validate: integer },
  startsAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
export const Coupon = model("Coupon", couponSchema);
const usageSchema = new Schema({
  couponId: { type: Schema.Types.ObjectId, required: true, ref: "Coupon" },
  userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  orderId: { type: Schema.Types.ObjectId, required: true, ref: "Order", unique: true },
  active: { type: Boolean, default: true },
  releasedAt: Date,
}, { timestamps: true });
usageSchema.index({ couponId: 1, userId: 1 }, { unique: true, partialFilterExpression: { active: true } });
export const CouponUsage = model("CouponUsage", usageSchema);
