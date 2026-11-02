import { Schema, model } from "mongoose";

export enum OrderStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  SHIPPING = "SHIPPING",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
  RETURNED = "RETURNED",
}

export enum PaymentMethod {
  COD = "COD",
}

const orderItemSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 99,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const shippingAddressSchema = new Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    province: { type: String, required: true },
    ward: { type: String, required: true },
    detail: { type: String, required: true },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) =>
          Array.isArray(items) && items.length > 0,
        message: "Order must have at least one item",
      },
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },
    couponId: { type: Schema.Types.ObjectId, ref: "Coupon" },
    couponCode: String,
    subtotal: { type: Number, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value),
        message: "Order total must be a safe integer",
      },
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      default: PaymentMethod.COD,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING,
      required: true,
    },

    // Optional for orders created before Module 13.
    checkoutKey: {
      type: String,
      immutable: true,
      minlength: 16,
      maxlength: 128,
    },
    checkoutRequestHash: {
      type: String,
      immutable: true,
      minlength: 64,
      maxlength: 64,
    },
  },
  { timestamps: true },
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

// Prevent duplicate checkout requests per customer.
// Legacy orders without checkoutKey are excluded.
orderSchema.index(
  { userId: 1, checkoutKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      checkoutKey: { $type: "string" },
    },
  },
);

export const Order = model("Order", orderSchema);
