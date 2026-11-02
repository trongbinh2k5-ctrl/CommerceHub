import { Schema, model, Types } from "mongoose";

import { SHIPPING_STATUSES, type ShippingStatus } from "./shipping.types";

export interface ShippingEvent {
  fromStatus: ShippingStatus | null;
  toStatus: ShippingStatus;
  note?: string;
  actorId: Types.ObjectId;
  createdAt: Date;
}

export interface ShipmentDocument {
  orderId: Types.ObjectId;
  userId: Types.ObjectId;

  carrier: string;
  trackingCode: string;
  carrierFee: number;

  shippingAddress: {
    fullName: string;
    phone: string;
    province: string;
    ward: string;
    detail: string;
  };

  status: ShippingStatus;
  deliveryAttempts: number;
  failureReason?: string;

  pickedUpAt?: Date;
  deliveredAt?: Date;
  returnedAt?: Date;

  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;

  events: ShippingEvent[];

  createdAt: Date;
  updatedAt: Date;
  __v: number;
}

const shippingEventSchema = new Schema<ShippingEvent>(
  {
    fromStatus: {
      type: String,
      enum: SHIPPING_STATUSES,
      default: null,
    },

    toStatus: {
      type: String,
      enum: SHIPPING_STATUSES,
      required: true,
    },

    note: {
      type: String,
      maxlength: 500,
    },

    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    createdAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false },
);

const shipmentSchema = new Schema<ShipmentDocument>(
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

    carrier: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },

    trackingCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    carrierFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    shippingAddress: {
      fullName: {
        type: String,
        required: true,
      },

      phone: {
        type: String,
        required: true,
      },

      province: {
        type: String,
        required: true,
      },

      ward: {
        type: String,
        required: true,
      },

      detail: {
        type: String,
        required: true,
      },
    },

    status: {
      type: String,
      enum: SHIPPING_STATUSES,
      required: true,
      default: "READY",
    },

    deliveryAttempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },

    failureReason: {
      type: String,
      maxlength: 500,
    },

    pickedUpAt: Date,
    deliveredAt: Date,
    returnedAt: Date,

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    events: {
      type: [shippingEventSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: "__v",
  },
);

shipmentSchema.index({ orderId: 1 }, { unique: true });

shipmentSchema.index({ trackingCode: 1 }, { unique: true });

shipmentSchema.index({
  userId: 1,
  createdAt: -1,
});

shipmentSchema.index({
  status: 1,
  createdAt: -1,
});

shipmentSchema.index({
  carrier: 1,
  createdAt: -1,
});

export const Shipment = model<ShipmentDocument>("Shipment", shipmentSchema);
