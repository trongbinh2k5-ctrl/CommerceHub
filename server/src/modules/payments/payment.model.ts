import { Schema, model } from "mongoose";
import { PaymentMethod } from "../orders/order.model";

export enum PaymentStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  CANCELLED = "CANCELLED",
}

const paymentSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      immutable: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    method: {
      type: String,
      enum: Object.values(PaymentMethod),
      required: true,
      immutable: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value),
        message: "Payment amount must be a safe integer",
      },
    },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
      required: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    confirmedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

paymentSchema.index({ orderId: 1 }, { unique: true });

paymentSchema.index({
  userId: 1,
  createdAt: -1,
});

paymentSchema.index({
  status: 1,
  createdAt: -1,
});

export const Payment = model("Payment", paymentSchema);
