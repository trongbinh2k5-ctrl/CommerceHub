import { Schema, model, Types } from "mongoose";

import { ReviewStatus } from "./review.types";

export interface ReviewFields {
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  orderId: Types.ObjectId;

  rating: number;
  title: string;
  comment: string;

  status: ReviewStatus;
  verifiedPurchase: boolean;

  deletedAt?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

const reviewSchema = new Schema<ReviewFields>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      immutable: true,
    },

    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      immutable: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: "Rating must be an integer",
      },
    },

    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },

    comment: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 2000,
    },

    status: {
      type: String,
      enum: Object.values(ReviewStatus),
      default: ReviewStatus.VISIBLE,
      required: true,
    },

    verifiedPurchase: {
      type: Boolean,
      default: true,
      required: true,
      immutable: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: "__v",
  },
);

// One review per customer per product.
// Includes hidden and soft-deleted reviews.
reviewSchema.index(
  {
    userId: 1,
    productId: 1,
  },
  {
    unique: true,
  },
);

// Public product review listing.
reviewSchema.index({
  productId: 1,
  status: 1,
  createdAt: -1,
});

// Customer review history.
reviewSchema.index({
  userId: 1,
  createdAt: -1,
});

// Admin moderation.
reviewSchema.index({
  status: 1,
  createdAt: -1,
});

export const Review = model<ReviewFields>("Review", reviewSchema);
