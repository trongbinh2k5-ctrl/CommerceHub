import mongoose, { Types, type ClientSession } from "mongoose";

import { Shipment } from "./shipping.model";

import {
  MAX_DELIVERY_ATTEMPTS,
  canTransition,
  isShippingStatus,
  isValidCarrier,
  isValidCarrierFee,
  isValidTrackingCode,
  type ShippingStatus,
} from "./shipping.types";

import { Order } from "../orders/order.model";
import { Payment } from "../payments/payment.model";

export class ShippingError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "ShippingError";
  }
}

const objectId = (value: string, label: string): Types.ObjectId => {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    throw new ShippingError(`${label} is invalid`, 400);
  }

  return new Types.ObjectId(value);
};

const textValue = (value: unknown, max = 500): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length > max) {
    throw new ShippingError(`Text must be at most ${max} characters`, 400);
  }

  return value.trim() || undefined;
};

const conflict = (error: unknown): never => {
  if (error instanceof ShippingError) {
    throw error;
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 11000
  ) {
    throw new ShippingError("Shipment or tracking code already exists", 409);
  }

  if (
    error &&
    typeof error === "object" &&
    "hasErrorLabel" in error &&
    typeof error.hasErrorLabel === "function" &&
    error.hasErrorLabel("TransientTransactionError")
  ) {
    throw new ShippingError("Concurrent update; please retry", 409);
  }

  throw error;
};

async function inTransaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();

  try {
    return (await session.withTransaction(async () => work(session), {
      readConcern: {
        level: "snapshot",
      },
      writeConcern: {
        w: "majority",
      },
    })) as T;
  } catch (error) {
    return conflict(error);
  } finally {
    await session.endSession();
  }
}

export interface CreateShipmentInput {
  orderId: string;
  carrier: string;
  trackingCode: string;
  carrierFee: number;
}

export async function createShipment(
  input: CreateShipmentInput,
  actorId: string,
) {
  const orderId = objectId(input.orderId, "orderId");

  const staffId = objectId(actorId, "actorId");

  const carrier = typeof input.carrier === "string" ? input.carrier.trim() : "";

  const trackingCode =
    typeof input.trackingCode === "string"
      ? input.trackingCode.trim().toUpperCase()
      : "";

  if (!isValidCarrier(carrier)) {
    throw new ShippingError("Invalid carrier", 400);
  }

  if (!isValidTrackingCode(trackingCode)) {
    throw new ShippingError("Invalid trackingCode", 400);
  }

  if (!isValidCarrierFee(input.carrierFee)) {
    throw new ShippingError("Invalid carrierFee", 400);
  }

  return inTransaction(async (session) => {
    const order = await Order.findById(orderId).session(session);

    if (!order) {
      throw new ShippingError("Order not found", 404);
    }

    if (order.status !== "CONFIRMED") {
      throw new ShippingError("Only CONFIRMED orders can be shipped", 409);
    }

    const payment = await Payment.findOne({
      orderId,
    }).session(session);

    if (
      !payment ||
      payment.status !== "PENDING" ||
      !payment.userId.equals(order.userId) ||
      payment.amount !== order.totalAmount
    ) {
      throw new ShippingError("Order requires a matching PENDING payment", 409);
    }

    const existingShipment = await Shipment.exists({
      orderId,
    }).session(session);

    if (existingShipment) {
      throw new ShippingError("Order already has a shipment", 409);
    }

    const address = order.shippingAddress;

    if (
      !address ||
      !address.fullName ||
      !address.phone ||
      !address.province ||
      !address.ward ||
      !address.detail
    ) {
      throw new ShippingError("Order shipping address is incomplete", 409);
    }

    const now = new Date();

    const [shipment] = await Shipment.create(
      [
        {
          orderId,
          userId: order.userId,
          carrier,
          trackingCode,

          carrierFee: input.carrierFee,

          shippingAddress: {
            fullName: address.fullName,
            phone: address.phone,
            province: address.province,
            ward: address.ward,
            detail: address.detail,
          },

          status: "READY",
          deliveryAttempts: 0,

          createdBy: staffId,
          updatedBy: staffId,

          events: [
            {
              fromStatus: null,
              toStatus: "READY",
              actorId: staffId,
              createdAt: now,
            },
          ],
        },
      ],
      { session },
    );

    return shipment;
  });
}

export interface UpdateShipmentInput {
  status: string;
  note?: unknown;
}

export async function updateShipmentStatus(
  id: string,
  input: UpdateShipmentInput,
  actorId: string,
) {
  const shipmentId = objectId(id, "shipmentId");

  const staffId = objectId(actorId, "actorId");

  if (!isShippingStatus(input.status)) {
    throw new ShippingError("Invalid shipping status", 400);
  }

  const next: ShippingStatus = input.status;

  const note = textValue(input.note);

  if (["DELIVERY_FAILED", "RETURNING"].includes(next) && !note) {
    throw new ShippingError("A reason is required for failure or return", 400);
  }

  return inTransaction(async (session) => {
    const shipment = await Shipment.findById(shipmentId).session(session);

    if (!shipment) {
      throw new ShippingError("Shipment not found", 404);
    }

    if (shipment.status === next) {
      return shipment;
    }

    if (!canTransition(shipment.status, next)) {
      throw new ShippingError(
        `Cannot transition ${shipment.status} -> ${next}`,
        409,
      );
    }

    const order = await Order.findById(shipment.orderId).session(session);

    if (!order || !order.userId.equals(shipment.userId)) {
      throw new ShippingError("Shipment/order mismatch", 409);
    }

    const payment = await Payment.findOne({
      orderId: shipment.orderId,
    }).session(session);

    if (
      !payment ||
      !payment.userId.equals(order.userId) ||
      payment.amount !== order.totalAmount
    ) {
      throw new ShippingError("Payment/order mismatch", 409);
    }

    if (payment.status !== "PENDING") {
      throw new ShippingError(
        "Cannot change shipment after payment is finalized",
        409,
      );
    }

    const expectedOrderStatus =
      shipment.status === "READY" ? "CONFIRMED" : "SHIPPING";

    if (order.status !== expectedOrderStatus) {
      throw new ShippingError(
        "Order status is inconsistent with shipment",
        409,
      );
    }

    if (
      next === "OUT_FOR_DELIVERY" &&
      shipment.deliveryAttempts >= MAX_DELIVERY_ATTEMPTS
    ) {
      throw new ShippingError("Maximum delivery attempts reached", 409);
    }

    const now = new Date();

    const set: Record<string, unknown> = {
      status: next,
      updatedBy: staffId,
    };

    if (next === "PICKED_UP") {
      set.pickedUpAt = now;
    }

    if (next === "DELIVERED") {
      set.deliveredAt = now;
    }

    if (next === "RETURNED") {
      set.returnedAt = now;
    }

    if (next === "DELIVERY_FAILED") {
      set.failureReason = note;
    }

    const inc: Record<string, number> = {
      __v: 1,
    };

    if (next === "OUT_FOR_DELIVERY") {
      inc.deliveryAttempts = 1;
    }

    const updated = await Shipment.findOneAndUpdate(
      {
        _id: shipmentId,
        status: shipment.status,
        __v: shipment.__v,
      },
      {
        $set: set,
        $inc: inc,

        $push: {
          events: {
            fromStatus: shipment.status,
            toStatus: next,
            note,
            actorId: staffId,
            createdAt: now,
          },
        },
      },
      {
        new: true,
        runValidators: true,
        session,
      },
    );

    if (!updated) {
      throw new ShippingError("Shipment changed concurrently", 409);
    }

    let nextOrderStatus: string | undefined;

    if (next === "PICKED_UP") {
      nextOrderStatus = "SHIPPING";
    }

    if (next === "DELIVERED") {
      nextOrderStatus = "DELIVERED";
    }

    if (next === "RETURNED") {
      nextOrderStatus = "RETURNED";
    }

    if (nextOrderStatus) {
      const orderUpdate = await (Order as any).updateOne(
        {
          _id: order._id,
          status: expectedOrderStatus,
        },
        {
          $set: {
            status: nextOrderStatus,
          },
        },
        { session },
      );

      if (orderUpdate.modifiedCount !== 1) {
        throw new ShippingError("Order changed concurrently", 409);
      }
    }

    if (next === "RETURNED") {
      const paymentUpdate = await (Payment as any).updateOne(
        {
          _id: payment._id,
          status: "PENDING",
        },
        {
          $set: {
            status: "CANCELLED",
            cancelledAt: now,
          },
        },
        { session },
      );

      if (paymentUpdate.modifiedCount !== 1) {
        throw new ShippingError("Payment changed concurrently", 409);
      }

      // Không tự động nhập lại tồn kho.
      // Hàng hoàn phải được kiểm tra thực tế.
    }

    return updated;
  });
}

const pagination = (pageRaw: unknown, limitRaw: unknown) => {
  const page = pageRaw === undefined ? 1 : Number(pageRaw);

  const limit = limitRaw === undefined ? 20 : Number(limitRaw);

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new ShippingError("Invalid pagination", 400);
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

export async function getMyShipments(
  userId: string,
  pageRaw?: unknown,
  limitRaw?: unknown,
) {
  const user = objectId(userId, "userId");

  const { page, limit, skip } = pagination(pageRaw, limitRaw);

  const filter = {
    userId: user,
  };

  const [items, total] = await Promise.all([
    Shipment.find(filter)
      .select("-carrierFee -createdBy -updatedBy -events.actorId -__v")
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    Shipment.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page,
    limit,
  };
}

export async function getMyShipmentByOrder(userId: string, orderId: string) {
  const shipment = await Shipment.findOne({
    userId: objectId(userId, "userId"),
    orderId: objectId(orderId, "orderId"),
  })
    .select("-carrierFee -createdBy -updatedBy -events.actorId -__v")
    .lean();

  if (!shipment) {
    throw new ShippingError("Shipment not found", 404);
  }

  return shipment;
}

export async function getAdminShipment(id: string) {
  const shipment = await Shipment.findById(objectId(id, "shipmentId")).lean();

  if (!shipment) {
    throw new ShippingError("Shipment not found", 404);
  }

  return shipment;
}

export async function getAdminShipments(query: Record<string, unknown>) {
  const { page, limit, skip } = pagination(query.page, query.limit);

  const filter: Record<string, unknown> = {};

  if (query.status !== undefined) {
    if (!isShippingStatus(query.status)) {
      throw new ShippingError("Invalid status filter", 400);
    }

    filter.status = query.status;
  }

  if (query.orderId !== undefined) {
    filter.orderId = objectId(String(query.orderId), "orderId");
  }

  if (query.carrier !== undefined) {
    if (!isValidCarrier(query.carrier)) {
      throw new ShippingError("Invalid carrier filter", 400);
    }

    filter.carrier = (query.carrier as string).trim();
  }

  const [items, total] = await Promise.all([
    Shipment.find(filter)
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    Shipment.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page,
    limit,
  };
}
