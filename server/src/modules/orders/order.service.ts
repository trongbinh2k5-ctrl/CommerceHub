import { normalizeCouponCode, reserveCoupon, releaseCoupon } from "../coupons/coupon.service";
import mongoose, { isValidObjectId, Types } from "mongoose";

import { Cart } from "../cart/cart.model";
import { Product } from "../products/product.model";
import { Category } from "../categories/category.model";
import { Address } from "../addresses/address.model";

import {
  rejectManualShippingOrderStatus,
  cancelReadyShipmentForOrder,
} from "../shipping/shipping-order-hooks";

import { Payment, PaymentStatus } from "../payments/payment.model";

import { Order, OrderStatus, PaymentMethod } from "./order.model";

import { createCheckoutRequestHash } from "./checkout-idempotency";

export class OrderError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "OrderError";
  }
}

export const isValidOrderId = (id: unknown): id is string =>
  typeof id === "string" && isValidObjectId(id);

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

const isDuplicateKeyError = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
};

export const handleOrderServiceError = (error: unknown): never => {
  if (error instanceof OrderError) {
    throw error;
  }

  // Preserve errors from the shipping module.
  if (
    error instanceof Error &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    throw error;
  }

  if (hasErrorLabel(error, "UnknownTransactionCommitResult")) {
    throw new OrderError(
      503,
      "Transaction result is uncertain. Check order history before retrying",
    );
  }

  if (hasErrorLabel(error, "TransientTransactionError")) {
    throw new OrderError(
      409,
      "Order data changed concurrently. Please check and retry",
    );
  }

  if (isDuplicateKeyError(error)) {
    throw new OrderError(
      409,
      "Duplicate order request. Check order history and retry with the same key",
    );
  }

  throw error;
};

// Find a previous checkout using the same customer and key.
const findExistingCheckout = async (
  userId: string,
  checkoutKey: string,
  requestHash: string,
) => {
  const existing = await Order.findOne({
    userId,
    checkoutKey,
  });

  if (!existing) {
    return null;
  }

  if (existing.checkoutRequestHash !== requestHash) {
    throw new OrderError(
      409,
      "Idempotency key was already used with different request data",
    );
  }

  return existing;
};

// CUSTOMER: Create order and payment in one transaction.
export const createOrder = async (
  userId: string,
  addressId: string,
  checkoutKey: string,
  couponInput?: unknown,
) => {
  const couponCode = normalizeCouponCode(couponInput);
  const requestHash = createCheckoutRequestHash(addressId, couponCode);

  // Replays must work even after the cart has been cleared.
  const existing = await findExistingCheckout(userId, checkoutKey, requestHash);

  if (existing) {
    return {
      order: existing,
      replayed: true,
    };
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const previous = await Order.findOne({
        userId,
        checkoutKey,
      }).session(session);

      if (previous) {
        if (previous.checkoutRequestHash !== requestHash) {
          throw new OrderError(
            409,
            "Idempotency key was already used with different request data",
          );
        }

        return {
          order: previous,
          replayed: true,
        };
      }

      const address = await Address.findOne({
        _id: addressId,
        userId,
      }).session(session);

      if (!address) {
        throw new OrderError(404, "Shipping address not found");
      }

      const cart = await Cart.findOne({
        userId,
      }).session(session);

      if (!cart || cart.items.length === 0) {
        throw new OrderError(400, "Cart is empty");
      }

      const orderItems: {
        productId: Types.ObjectId;
        name: string;
        sku: string;
        price: number;
        quantity: number;
        subtotal: number;
      }[] = [];

      let totalAmount = 0;

      for (const item of cart.items) {
        const quantity = item.quantity;

        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
          throw new OrderError(400, "Invalid cart item quantity");
        }

        const product = await Product.findOne({
          _id: item.productId,
          isActive: true,
        }).session(session);

        if (!product) {
          throw new OrderError(409, "A product is unavailable");
        }

        if (product.categoryId) {
          const category = await Category.findOne({
            _id: product.categoryId,
            isActive: true,
          }).session(session);

          if (!category) {
            throw new OrderError(409, "A product category is unavailable");
          }
        }

        if (!Number.isSafeInteger(product.price) || product.price < 0) {
          throw new OrderError(409, "Invalid product price");
        }

        // Decrease stock atomically.
        const updatedProduct = await Product.findOneAndUpdate(
          {
            _id: product._id,
            isActive: true,
            stock: { $gte: quantity },
          },
          {
            $inc: {
              stock: -quantity,
            },
          },
          {
            new: true,
            session,
            runValidators: true,
          },
        );

        if (!updatedProduct) {
          throw new OrderError(409, `Insufficient stock for ${product.name}`);
        }

        const subtotal = product.price * quantity;

        if (!Number.isSafeInteger(subtotal)) {
          throw new OrderError(409, "Order amount exceeds safe integer range");
        }

        totalAmount += subtotal;

        if (!Number.isSafeInteger(totalAmount)) {
          throw new OrderError(409, "Order total exceeds safe integer range");
        }

        orderItems.push({
          productId: product._id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          quantity,
          subtotal,
        });
      }

      const orderId = new Types.ObjectId();
      const subtotal = totalAmount;
      const coupon = couponCode ? await reserveCoupon(couponCode, subtotal, userId, orderId, session) : undefined;
      totalAmount -= coupon?.discountAmount ?? 0;

      const createdOrders = await Order.create(
        [
          {
            _id: orderId,
            subtotal,
            ...coupon,
            userId: new Types.ObjectId(userId),

            items: orderItems,

            shippingAddress: {
              fullName: address.fullName,
              phone: address.phone,
              province: address.province,
              ward: address.ward,
              detail: address.detail,
            },

            totalAmount,
            paymentMethod: PaymentMethod.COD,
            status: OrderStatus.PENDING,

            checkoutKey,
            checkoutRequestHash: requestHash,
          },
        ],
        { session },
      );

      const createdOrder = createdOrders[0];

      if (!createdOrder) {
        throw new OrderError(500, "Order creation failed");
      }

      // Payment and Order commit together.
      await Payment.create(
        [
          {
            orderId: createdOrder._id,
            userId: createdOrder.userId,
            method: PaymentMethod.COD,
            amount: totalAmount,
            status: PaymentStatus.PENDING,
          },
        ],
        { session },
      );

      // Prevent clearing a cart changed concurrently.
      const clearResult = await Cart.updateOne(
        {
          _id: cart._id,
          __v: cart.__v,
        },
        {
          $set: {
            items: [],
          },
          $inc: {
            __v: 1,
          },
        },
        { session },
      );

      if (clearResult.modifiedCount !== 1) {
        throw new OrderError(409, "Cart changed during checkout");
      }

      return {
        order: createdOrder,
        replayed: false,
      };
    });

    if (!result) {
      throw new OrderError(500, "Order creation failed");
    }

    return result;
  } catch (error) {
    // Recover a committed checkout if its response was lost.
    if (
      isDuplicateKeyError(error) ||
      hasErrorLabel(error, "TransientTransactionError") ||
      hasErrorLabel(error, "UnknownTransactionCommitResult")
    ) {
      try {
        const recovered = await findExistingCheckout(
          userId,
          checkoutKey,
          requestHash,
        );

        if (recovered) {
          return {
            order: recovered,
            replayed: true,
          };
        }
      } catch (recoveryError) {
        if (recoveryError instanceof OrderError) {
          throw recoveryError;
        }
      }
    }

    return handleOrderServiceError(error);
  } finally {
    await session.endSession();
  }
};

// CUSTOMER: List own orders.
export const getMyOrders = async (userId: string) => {
  return Order.find({ userId }).sort({ createdAt: -1 }).lean();
};

// CUSTOMER: Get own order.
export const getMyOrderById = async (userId: string, orderId: string) => {
  const order = await Order.findOne({
    _id: orderId,
    userId,
  }).lean();

  if (!order) {
    throw new OrderError(404, "Order not found");
  }

  return order;
};

// Shared cancellation transaction.
const cancelOrderByFilter = async (
  filter: Record<string, unknown>,
  allowedStatuses: OrderStatus[],
  actorId: string,
) => {
  if (!isValidOrderId(actorId)) {
    throw new OrderError(400, "Invalid actor ID");
  }

  const session = await mongoose.startSession();

  try {
    const result = await session.withTransaction(async () => {
      const order = await Order.findOne(filter).session(session);

      if (!order) {
        throw new OrderError(404, "Order not found");
      }

      if (!allowedStatuses.includes(order.status)) {
        throw new OrderError(
          409,
          "Order cannot be cancelled in its current status",
        );
      }

      const payment = await Payment.findOne({
        orderId: order._id,
      }).session(session);

      if (!payment) {
        throw new OrderError(409, "Payment record missing for order");
      }

      if (payment.status !== PaymentStatus.PENDING) {
        throw new OrderError(
          409,
          "Payment is not pending. Cancellation requires a separate workflow",
        );
      }

      if (
        String(payment.userId) !== String(order.userId) ||
        payment.method !== order.paymentMethod ||
        payment.amount !== order.totalAmount
      ) {
        throw new OrderError(409, "Payment data does not match order");
      }

      // MODULE 14:
      // Cancel an existing READY shipment in the same transaction.
      // A shipment already picked up cannot be cancelled here.
      await cancelReadyShipmentForOrder(
        order._id,
        new Types.ObjectId(actorId),
        session,
      );

      const updatedOrder = await Order.findOneAndUpdate(
        {
          _id: order._id,
          status: order.status,
        },
        {
          $set: {
            status: OrderStatus.CANCELLED,
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      );

      if (!updatedOrder) {
        throw new OrderError(409, "Order status changed concurrently");
      }

      const updatedPayment = await Payment.findOneAndUpdate(
        {
          _id: payment._id,
          orderId: order._id,
          status: PaymentStatus.PENDING,
        },
        {
          $set: {
            status: PaymentStatus.CANCELLED,
            cancelledAt: new Date(),
          },
        },
        {
          new: true,
          session,
          runValidators: true,
        },
      );

      if (!updatedPayment) {
        throw new OrderError(409, "Payment status changed concurrently");
      }

      await releaseCoupon(order._id, session);

      // Restore stock only for orders cancelled before dispatch.
      for (const item of order.items) {
        const updatedProduct = await Product.findOneAndUpdate(
          {
            _id: item.productId,
            stock: {
              $lte: Number.MAX_SAFE_INTEGER - item.quantity,
            },
          },
          {
            $inc: {
              stock: item.quantity,
            },
          },
          {
            new: true,
            session,
            runValidators: true,
          },
        );

        if (!updatedProduct) {
          throw new OrderError(409, "Unable to restore product stock");
        }
      }

      return updatedOrder;
    });

    if (!result) {
      throw new OrderError(500, "Cancellation failed");
    }

    return result;
  } catch (error) {
    return handleOrderServiceError(error);
  } finally {
    await session.endSession();
  }
};

// CUSTOMER: Cancel own PENDING order.
export const cancelMyOrder = async (userId: string, orderId: string) => {
  return cancelOrderByFilter(
    {
      _id: orderId,
      userId,
    },
    [OrderStatus.PENDING],
    userId,
  );
};

// STAFF/ADMIN: List all orders.
export const getAllOrders = async () => {
  return Order.find().sort({ createdAt: -1 }).lean();
};

// STAFF/ADMIN: Update order status.
export const updateOrderStatus = async (
  orderId: string,
  nextStatus: OrderStatus,
  actorId: string,
) => {
  if (!isValidOrderId(orderId)) {
    throw new OrderError(400, "Invalid order ID");
  }

  if (!Object.values(OrderStatus).includes(nextStatus)) {
    throw new OrderError(400, "Invalid order status");
  }

  if (nextStatus === OrderStatus.CANCELLED) {
    return cancelOrderByFilter(
      { _id: orderId },
      [OrderStatus.PENDING, OrderStatus.CONFIRMED],
      actorId,
    );
  }

  // MODULE 14:
  // Shipping states must be changed via the shipment workflow.
  rejectManualShippingOrderStatus(nextStatus);

  const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING]: [OrderStatus.CONFIRMED],

    [OrderStatus.CONFIRMED]: [],

    [OrderStatus.SHIPPING]: [],

    [OrderStatus.DELIVERED]: [],

    [OrderStatus.CANCELLED]: [],

    [OrderStatus.RETURNED]: [],
  };

  const order = await Order.findById(orderId);

  if (!order) {
    throw new OrderError(404, "Order not found");
  }

  if (!allowedTransitions[order.status].includes(nextStatus)) {
    throw new OrderError(409, "Invalid order status transition");
  }

  const updated = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: order.status,
    },
    {
      $set: {
        status: nextStatus,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    throw new OrderError(409, "Order status changed concurrently");
  }

  return updated;
};
