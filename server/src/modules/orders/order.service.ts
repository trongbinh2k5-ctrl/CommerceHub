import { normalizeCouponCode, reserveCoupon, releaseCoupon } from "../coupons/coupon.service";
import mongoose, { isValidObjectId, Types } from "mongoose";

import { Cart } from "../cart/cart.model";
import { Product } from "../products/product.model";
import { getStoreSettings, shippingAmount } from '../store/store.model';
import { Notification, StockMovement } from '../operations/operations.models';
import { recordAudit } from '../operations/audit.service';
import { Category } from "../categories/category.model";
import { Address } from "../addresses/address.model";
import {validateDeliveryAddress} from '../addresses/address-catalog';

import {
  rejectManualShippingOrderStatus,
  cancelReadyShipmentForOrder,
} from "../shipping/shipping-order-hooks";

import { Payment, PaymentStatus } from "../payments/payment.model";

import { Order, OrderStatus, PaymentMethod } from "./order.model";

import { createCheckoutRequestHash } from "./checkout-idempotency";
import { vnpayConfig } from '../payments/vnpay.config';
import { sepayConfig } from '../payments/sepay.config';
import {GhnBooking} from '../shipping/ghn.model';
import {Shipment} from '../shipping/shipping.model';
import {cancelGhn,cancelUncertainGhn} from '../shipping/ghn.service';

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
  expectedTotal?: number,
  paymentMethod: PaymentMethod = PaymentMethod.COD,
) => {
  if (!Object.values(PaymentMethod).includes(paymentMethod)) throw new OrderError(400, 'Phương thức thanh toán không hợp lệ.');
  const couponCode = normalizeCouponCode(couponInput);
  const requestHash = createCheckoutRequestHash(addressId, couponCode, paymentMethod);

  // Replays must work even after the cart has been cleared.
  const existing = await findExistingCheckout(userId, checkoutKey, requestHash);

  if (existing) {
    return {
      order: existing,
      replayed: true,
    };
  }

  if (paymentMethod === PaymentMethod.VNPAY && !vnpayConfig()) throw new OrderError(503, 'VNPAY sandbox chưa được cấu hình.');
  if (paymentMethod === PaymentMethod.SEPAY && !sepayConfig()) throw new OrderError(503, 'SePay chưa được cấu hình.');
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
      Object.assign(address,validateDeliveryAddress(address));

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

      const orderId = new Types.ObjectId();
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

        await StockMovement.create([{productId:product._id,actorId:userId,delta:-quantity,before:updatedProduct.stock+quantity,after:updatedProduct.stock,reason:'Đặt hàng',orderId}],{session});
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

      const subtotal = totalAmount;
      const coupon = couponCode ? await reserveCoupon(couponCode, subtotal, userId, orderId, session) : undefined;
      totalAmount -= coupon?.discountAmount ?? 0;
      const shippingFee = shippingAmount(totalAmount, await getStoreSettings());
      totalAmount += shippingFee;
      if (paymentMethod === PaymentMethod.SEPAY && (!Number.isSafeInteger(totalAmount) || totalAmount < 1)) throw new OrderError(400, 'SePay yêu cầu tổng tiền nguyên dương hợp lệ.');
      if (paymentMethod === PaymentMethod.VNPAY && (totalAmount < 5000 || !Number.isSafeInteger(totalAmount*100))) throw new OrderError(400, 'VNPAY yêu cầu tổng tiền tối thiểu 5.000đ và trong giới hạn hợp lệ.');
      if (!Number.isSafeInteger(totalAmount)) throw new OrderError(400, 'Tổng tiền không hợp lệ.');
      if (expectedTotal !== undefined && totalAmount !== expectedTotal) throw new OrderError(409, 'Giá hoặc phí giao hàng đã thay đổi. Vui lòng kiểm tra lại tổng tiền.');

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
            shippingFee,
            paymentMethod,
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
      await Notification.create([{ userId, title: 'Đặt hàng thành công', message: paymentMethod===PaymentMethod.COD?'Đơn hàng đang chờ cửa hàng xác nhận.':'Đơn hàng đang chờ thanh toán. Hoàn tất thanh toán để cửa hàng tiếp nhận đơn.', href: `/orders/${createdOrder._id}`, dedupeKey: `order:${createdOrder._id}:PENDING` }], { session });

      // Payment and Order commit together.
      await Payment.create(
        [
          {
            orderId: createdOrder._id,
            userId: createdOrder.userId,
            method: paymentMethod,
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

      if (payment.activeVnpayRef) throw new OrderError(409, 'Giao dịch VNPAY đang chờ xác nhận/đối soát; chưa thể hủy đơn.');
      if (payment.activeSepayRef) throw new OrderError(409, 'Giao dịch SePay đang chờ xác nhận. Dừng thanh toán tại SePay và kiểm tra kết quả trước khi hủy đơn.');
      if (![PaymentStatus.PENDING,PaymentStatus.PAID].includes(payment.status as PaymentStatus)) {
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
          status: payment.status,
        },
        {
          $set: payment.status===PaymentStatus.PAID?{refundStatus:'REQUESTED',refundRequestedAt:new Date()}:{
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
        await StockMovement.create([{productId:item.productId,actorId,delta:item.quantity,before:updatedProduct.stock-item.quantity,after:updatedProduct.stock,reason:"Hủy đơn trước giao",orderId:order._id}],{session});
      }

      await Notification.create([{userId:order.userId,title:"Đơn hàng đã hủy",message:payment.status===PaymentStatus.PAID?'Đơn đã hủy. Cửa hàng cần xử lý hoàn tiền riêng; tiền chưa được tự động hoàn.':'Đơn hàng đã ngừng xử lý. Bạn chưa thanh toán nên không có tiền cần hoàn.',href:`/orders/${order._id}`,dedupeKey:`order:${order._id}:CANCELLED`}],{session});
      await recordAudit(actorId,'ORDER_UPDATED','ORDER',order._id,'Hủy đơn trước giao.',[{field:'status',before:order.status,after:'CANCELLED'}],session);
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

// CUSTOMER: Cancel own order before carrier handover. Paid money remains PAID pending refund.
export const cancelMyOrder = async (userId: string, orderId: string) => {
  const owned=await Order.findOne({_id:orderId,userId});
  if(!owned)throw new OrderError(404,'Không tìm thấy đơn hàng.');
  if(![OrderStatus.PENDING,OrderStatus.CONFIRMED].includes(owned.status))throw new OrderError(409,'Đơn đã bàn giao vận chuyển hoặc kết thúc; không thể hủy.');
  const booking=await GhnBooking.findOne({orderId,state:{$ne:'CANCELLED'}});
  if(booking){
    const payment=await Payment.findOne({orderId,userId});
    if(!payment||payment.activeSepayRef||payment.activeVnpayRef)throw new OrderError(409,'Cần đối soát thanh toán trước khi hủy vận đơn.');
    const shipment=await Shipment.findOne({orderId});
    if(!shipment&&['PENDING','UNCERTAIN','CANCEL_CHECK'].includes(booking.state))await cancelUncertainGhn(orderId,userId);
    else{
      if(booking.state!=='CREATED'||shipment?.status!=='READY')throw new OrderError(409,'Yêu cầu GHN cần được cửa hàng đối soát trước khi hủy.');
      const result=await cancelGhn(orderId,userId);
      if(result?.status!=='CANCELLED')throw new OrderError(409,'GHN chưa xác nhận hủy vận đơn. Đơn hàng chưa được hủy.');
    }
  }
  return cancelOrderByFilter(
    {
      _id: orderId,
      userId,
    },
    [OrderStatus.PENDING,OrderStatus.CONFIRMED],
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

  const session = await mongoose.startSession();
  try { return await session.withTransaction(async () => {
  if (order.paymentMethod !== PaymentMethod.COD && !await Payment.exists({orderId:order._id,method:order.paymentMethod,status:PaymentStatus.PAID,amount:order.totalAmount,userId:order.userId}).session(session)) throw new OrderError(409, 'Đơn thanh toán online phải được trả tiền trước khi xác nhận.');
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
      session,
    },
  );

  if (!updated) {
    throw new OrderError(409, "Order status changed concurrently");
  }
  await Notification.create([{userId:updated.userId,title:'Đơn hàng đã xác nhận',message:'Cửa hàng đang chuẩn bị đơn hàng của bạn.',href:`/orders/${updated._id}`,dedupeKey:`order:${updated._id}:CONFIRMED`}],{session});
  await recordAudit(actorId,'ORDER_UPDATED','ORDER',updated._id,'Xác nhận đơn hàng.',[{field:'status',before:order.status,after:updated.status}],session);
  return updated;
  }); } finally { await session.endSession(); }
};
