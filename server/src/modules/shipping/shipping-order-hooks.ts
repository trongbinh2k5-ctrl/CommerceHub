import { Types, type ClientSession } from "mongoose";

import { Shipment } from "./shipping.model";

import { ShippingError } from "./shipping.service";

export async function cancelReadyShipmentForOrder(
  orderId: Types.ObjectId,
  actorId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  const shipment = await Shipment.findOne({
    orderId,
  }).session(session);

  if (!shipment) {
    return;
  }

  if (shipment.status !== "READY") {
    throw new ShippingError(
      "Shipment already dispatched; use return workflow",
      409,
    );
  }

  const result = await Shipment.updateOne(
    {
      _id: shipment._id,
      status: "READY",
      __v: shipment.__v,
    },
    {
      $set: {
        status: "CANCELLED",
        updatedBy: actorId,
      },

      $inc: {
        __v: 1,
      },

      $push: {
        events: {
          fromStatus: "READY",
          toStatus: "CANCELLED",
          note: "Order cancelled before pickup",
          actorId,
          createdAt: new Date(),
        },
      },
    },
    { session },
  );

  if (result.modifiedCount !== 1) {
    throw new ShippingError("Shipment changed concurrently", 409);
  }
}

export function rejectManualShippingOrderStatus(nextStatus: string): void {
  if (["SHIPPING", "DELIVERED", "RETURNED"].includes(nextStatus)) {
    throw new ShippingError(
      "Shipping-related order status must be updated via shipment workflow",
      409,
    );
  }
}
