import { Types } from "mongoose";

import { Order, OrderStatus } from "../orders/order.model";
import { Product } from "../products/product.model";

import { Review } from "./review.model";

import { isValidReviewId, ReviewError } from "./review.rules";

import { PaginationInput, ReviewInput, ReviewStatus } from "./review.types";

const requireObjectId = (value: unknown, fieldName: string): Types.ObjectId => {
  if (!isValidReviewId(value)) {
    throw new ReviewError(400, `Invalid ${fieldName}`);
  }

  return new Types.ObjectId(value);
};

const requireProduct = async (productId: Types.ObjectId): Promise<void> => {
  const exists = await Product.exists({
    _id: productId,
  });

  if (!exists) {
    throw new ReviewError(404, "Product not found");
  }
};

const isDuplicateKeyError = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
};

// CUSTOMER: Create a review for a delivered product.
export const createReview = async (
  userId: string,
  productId: string,
  input: ReviewInput,
) => {
  const customerObjectId = requireObjectId(userId, "user ID");

  const productObjectId = requireObjectId(productId, "product ID");

  await requireProduct(productObjectId);

  const existing = await Review.exists({
    userId: customerObjectId,
    productId: productObjectId,
  });

  if (existing) {
    throw new ReviewError(409, "You have already reviewed this product");
  }

  // A delivered order proves the customer purchased this product.
  const purchasedOrder = await Order.findOne({
    userId: customerObjectId,
    status: OrderStatus.DELIVERED,
    "items.productId": productObjectId,
  })
    .sort({ createdAt: -1 })
    .select("_id")
    .lean();

  if (!purchasedOrder) {
    throw new ReviewError(
      403,
      "Only customers with a delivered order can review this product",
    );
  }

  try {
    const review = await Review.create({
      userId: customerObjectId,
      productId: productObjectId,
      orderId: purchasedOrder._id,

      rating: input.rating,
      title: input.title,
      comment: input.comment,

      status: ReviewStatus.VISIBLE,
      verifiedPurchase: true,
    });

    return review;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ReviewError(409, "You have already reviewed this product");
    }

    throw error;
  }
};

// PUBLIC: List visible reviews of a product.
export const getProductReviews = async (
  productId: string,
  pagination: PaginationInput,
) => {
  const productObjectId = requireObjectId(productId, "product ID");

  await requireProduct(productObjectId);

  const filter = {
    productId: productObjectId,
    status: ReviewStatus.VISIBLE,
  };

  const [items, total] = await Promise.all([
    Review.find(filter)
      .select("rating title comment verifiedPurchase createdAt updatedAt")
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),

    Review.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
};

// PUBLIC: Calculate rating summary from visible reviews.
export const getProductReviewSummary = async (productId: string) => {
  const productObjectId = requireObjectId(productId, "product ID");

  await requireProduct(productObjectId);

  const grouped = await Review.aggregate<{
    _id: number;
    count: number;
  }>([
    {
      $match: {
        productId: productObjectId,
        status: ReviewStatus.VISIBLE,
      },
    },
    {
      $group: {
        _id: "$rating",
        count: { $sum: 1 },
      },
    },
  ]);

  const distribution: Record<string, number> = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
  };

  let totalReviews = 0;
  let weightedSum = 0;

  for (const group of grouped) {
    distribution[String(group._id)] = group.count;

    totalReviews += group.count;
    weightedSum += group._id * group.count;
  }

  const averageRating =
    totalReviews === 0
      ? 0
      : Math.round((weightedSum / totalReviews) * 100) / 100;

  return {
    productId,
    averageRating,
    totalReviews,
    distribution,
  };
};

// CUSTOMER: List own reviews, including hidden and deleted.
export const getMyReviews = async (
  userId: string,
  pagination: PaginationInput,
) => {
  const customerObjectId = requireObjectId(userId, "user ID");

  const filter = {
    userId: customerObjectId,
  };

  const [items, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),

    Review.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
};

// CUSTOMER: Edit own active review.
export const updateMyReview = async (
  userId: string,
  reviewId: string,
  input: ReviewInput,
) => {
  const customerObjectId = requireObjectId(userId, "user ID");

  const reviewObjectId = requireObjectId(reviewId, "review ID");

  const review = await Review.findOne({
    _id: reviewObjectId,
    userId: customerObjectId,
  });

  if (!review) {
    throw new ReviewError(404, "Review not found");
  }

  if (review.status === ReviewStatus.DELETED) {
    throw new ReviewError(409, "Deleted reviews cannot be edited");
  }

  const version = review.get("__v") as number;

  const updated = await Review.findOneAndUpdate(
    {
      _id: reviewObjectId,
      userId: customerObjectId,
      status: {
        $in: [ReviewStatus.VISIBLE, ReviewStatus.HIDDEN],
      },
      __v: version,
    },
    {
      $set: {
        rating: input.rating,
        title: input.title,
        comment: input.comment,
      },
      $inc: {
        __v: 1,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    throw new ReviewError(
      409,
      "Review changed concurrently. Please reload and retry",
    );
  }

  return updated;
};

// CUSTOMER: Soft-delete own review.
export const deleteMyReview = async (userId: string, reviewId: string) => {
  const customerObjectId = requireObjectId(userId, "user ID");

  const reviewObjectId = requireObjectId(reviewId, "review ID");

  const review = await Review.findOne({
    _id: reviewObjectId,
    userId: customerObjectId,
  });

  if (!review) {
    throw new ReviewError(404, "Review not found");
  }

  if (review.status === ReviewStatus.DELETED) {
    return {
      deleted: true,
      alreadyDeleted: true,
    };
  }

  const version = review.get("__v") as number;

  const updated = await Review.findOneAndUpdate(
    {
      _id: reviewObjectId,
      userId: customerObjectId,
      status: {
        $in: [ReviewStatus.VISIBLE, ReviewStatus.HIDDEN],
      },
      __v: version,
    },
    {
      $set: {
        status: ReviewStatus.DELETED,
        deletedAt: new Date(),
      },
      $inc: {
        __v: 1,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    throw new ReviewError(
      409,
      "Review changed concurrently. Please reload and retry",
    );
  }

  return {
    deleted: true,
    alreadyDeleted: false,
  };
};

// STAFF/ADMIN: List all reviews for moderation.
export const getAllReviews = async (
  pagination: PaginationInput,
  status?: ReviewStatus,
) => {
  const filter = status ? { status } : {};

  const [items, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean(),

    Review.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
};

// STAFF/ADMIN: Hide or restore a review.
export const moderateReview = async (
  reviewId: string,
  nextStatus: ReviewStatus.VISIBLE | ReviewStatus.HIDDEN,
) => {
  const reviewObjectId = requireObjectId(reviewId, "review ID");

  const review = await Review.findById(reviewObjectId);

  if (!review) {
    throw new ReviewError(404, "Review not found");
  }

  if (review.status === ReviewStatus.DELETED) {
    throw new ReviewError(409, "Deleted reviews cannot be restored");
  }

  if (review.status === nextStatus) {
    return review;
  }

  const version = review.get("__v") as number;

  const updated = await Review.findOneAndUpdate(
    {
      _id: reviewObjectId,
      status: review.status,
      __v: version,
    },
    {
      $set: {
        status: nextStatus,
      },
      $inc: {
        __v: 1,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) {
    throw new ReviewError(
      409,
      "Review changed concurrently. Please reload and retry",
    );
  }

  return updated;
};
