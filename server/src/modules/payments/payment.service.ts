import mongoose from "mongoose";

import { Order, OrderStatus, PaymentMethod } from "../orders/order.model";

import { Payment, PaymentStatus } from "./payment.model";

export class PaymentError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

const hasErrorLabel = (error: unknown, label: string): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    hasErrorLabel?: (label: string) => boolean;
  };

  return (
    typeof candidate.hasErrorLabel === "function" &&
    candidate.hasErrorLabel(label)
  );
};

const handlePaymentError = (error: unknown): never => {
  if (error instanceof PaymentError) {
    throw error;
  }

  if (hasErrorLabel(error, "UnknownTransactionCommitResult")) {
    throw new PaymentError(
      503,
      "Payment result is uncertain. Check payment status before retrying",
    );
  }

  if (hasErrorLabel(error, "TransientTransactionError")) {
    throw new PaymentError(
      409,
      "Payment data changed concurrently. Please check and retry",
    );
  }

  throw error;
};

// CUSTOMER: Read own payment.
export const getMyPaymentByOrderId = async (
  userId: string,
  orderId: string,
) => {
  const payment = await Payment.findOne({
    orderId,
    userId,
  }).lean();

  if (!payment) {
    throw new PaymentError(404, "Payment not found");
  }

  return payment;
};

// STAFF/ADMIN: Read payment.
export const getPaymentByOrderId = async (orderId: string) => {
  const payment = await Payment.findOne({
    orderId,
  }).lean();

  if (!payment) {
    throw new PaymentError(404, "Payment not found");
  }

  return payment;
};

// STAFF/ADMIN: List all payments.
export const getAllPayments = async () => {
  return Payment.find().sort({ createdAt: -1 }).lean();
};

// STAFF/ADMIN: Confirm collected COD.
export const confirmCodPayment = async (
  orderId: string,
  confirmedBy: string,
) => {
  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);

      if (!order) {
        throw new PaymentError(404, "Order not found");
      }

      if (order.status !== OrderStatus.DELIVERED) {
        throw new PaymentError(
          409,
          "Only delivered orders can be marked as paid",
        );
      }

      if (order.paymentMethod !== PaymentMethod.COD) {
        throw new PaymentError(409, "Order payment method is not COD");
      }

      const payment = await Payment.findOne({
        orderId: order._id,
      }).session(session);

      if (!payment) {
        throw new PaymentError(409, "Payment record missing for order");
      }

      if (payment.status !== PaymentStatus.PENDING) {
        throw new PaymentError(409, "Payment is not pending");
      }

      if (
        payment.method !== PaymentMethod.COD ||
        String(payment.userId) !== String(order.userId) ||
        !Number.isSafeInteger(order.totalAmount) ||
        !Number.isSafeInteger(payment.amount) ||
        payment.amount !== order.totalAmount
      ) {
        throw new PaymentError(409, "Payment data does not match order");
      }

      const updated = await Payment.findOneAndUpdate(
        {
          _id: payment._id,
          orderId: order._id,
          status: PaymentStatus.PENDING,
          method: PaymentMethod.COD,
          amount: order.totalAmount,
        },
        {
          $set: {
            status: PaymentStatus.PAID,
            paidAt: new Date(),
            confirmedBy,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      );

      if (!updated) {
        throw new PaymentError(409, "Payment status changed concurrently");
      }

      return updated;
    });

    if (!result) {
      throw new PaymentError(500, "Payment confirmation failed");
    }

    return result;
  } catch (error) {
    return handlePaymentError(error);
  } finally {
    await session.endSession();
  }
};
