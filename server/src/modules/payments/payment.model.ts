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
    activeVnpayRef: { type: String, default: null },
    refundStatus: {type:String,enum:['REQUESTED','PROCESSING','COMPLETED'],default:null},
    refundRequestedAt: {type:Date,default:null},
    refundProcessingAt: {type:Date,default:null},
    refundRecipientSubmittedAt: {type:Date,default:null},
    refundRecipient: {type:new Schema({bankName:{type:String,required:true,maxlength:80},accountNumber:{type:String,required:true,maxlength:30},accountHolder:{type:String,required:true,maxlength:100}},{_id:false}),select:false,default:null},
    refundedAt: {type:Date,default:null},
    refundAmount: {type:Number,min:0,default:0},
    refundReference: {type:String,maxlength:120},
    refundConfirmedBy: {type:Schema.Types.ObjectId,ref:'User',default:null},
    activeSepayRef: { type: String, default: null },
    gatewayTransactionNo: { type: String, default: null },
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
paymentSchema.index({refundReference:1},{unique:true,partialFilterExpression:{refundReference:{$type:'string'}}});

paymentSchema.index({
  userId: 1,
  createdAt: -1,
});

paymentSchema.index({
  status: 1,
  createdAt: -1,
});

export const Payment = model("Payment", paymentSchema);
