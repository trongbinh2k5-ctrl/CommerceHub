import { Schema, model } from "mongoose";
const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, default: '', maxlength: 10 },
    emailVerifiedAt: { type: Date, default: null },
    authVersion: { type: Number, default: 0, min: 0 },
    mustChangePassword: { type: Boolean, default: false },
    temporaryPasswordExpiresAt: { type: Date, default: null },
    provisionedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["CUSTOMER", "STAFF", "ADMIN"],
      default: "CUSTOMER",
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

export const User = model("User", userSchema);
