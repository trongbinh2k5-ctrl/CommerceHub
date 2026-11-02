import { Schema, model } from "mongoose";

const addressSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    province: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    ward: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    detail: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    label: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "",
    },
    isDefault: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  { timestamps: true },
);

addressSchema.index(
  { userId: 1, isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true },
  },
);

export const Address = model("Address", addressSchema);
