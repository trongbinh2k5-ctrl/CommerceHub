import { Coupon, CouponUsage } from "../modules/coupons/coupon.model";
import mongoose from "mongoose";

export const connectDatabase = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }

  await mongoose.connect(mongoUri);

  // Checkout relies on these unique indexes and pre-existing collections.
  await Promise.all([Coupon.init(), CouponUsage.init()]);

  console.log("MongoDB connected successfully");
};
