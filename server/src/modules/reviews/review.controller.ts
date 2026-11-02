import { NextFunction, Request, RequestHandler, Response } from "express";

import {
  createReview,
  deleteMyReview,
  getAllReviews,
  getMyReviews,
  getProductReviews,
  getProductReviewSummary,
  moderateReview,
  updateMyReview,
} from "./review.service";

import {
  parseModerationStatus,
  parseReviewPagination,
  ReviewError,
  validateReviewInput,
} from "./review.rules";

import { ReviewStatus } from "./review.types";

type AsyncController = (req: Request, res: Response) => Promise<void>;

// Handle known review errors locally.
// Forward unexpected errors to the application's error handler.
const handle = (controller: AsyncController): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(controller(req, res)).catch((error: unknown) => {
      if (error instanceof ReviewError) {
        res.status(error.statusCode).json({
          message: error.message,
        });
        return;
      }

      next(error);
    });
  };
};

export const createReviewController = handle(async (req, res) => {
  const userId = req.user!.userId;

  const productId = req.body?.productId;

  const input = validateReviewInput(req.body);

  const review = await createReview(userId, productId, input);

  res.status(201).json({
    message: "Review created successfully",
    data: review,
  });
});

export const getProductReviewsController = handle(async (req, res) => {
  const pagination = parseReviewPagination(req.query.page, req.query.limit);

  const result = await getProductReviews(
    req.params.productId as string,
    pagination,
  );

  res.status(200).json({
    message: "Product reviews retrieved successfully",
    data: result,
  });
});

export const getProductReviewSummaryController = handle(async (req, res) => {
  const result = await getProductReviewSummary(req.params.productId as string);

  res.status(200).json({
    message: "Review summary retrieved successfully",
    data: result,
  });
});

export const getMyReviewsController = handle(async (req, res) => {
  const pagination = parseReviewPagination(req.query.page, req.query.limit);

  const result = await getMyReviews(req.user!.userId, pagination);

  res.status(200).json({
    message: "My reviews retrieved successfully",
    data: result,
  });
});

export const updateMyReviewController = handle(async (req, res) => {
  const input = validateReviewInput(req.body);

  const review = await updateMyReview(
    req.user!.userId,
    req.params.reviewId as string,
    input,
  );

  res.status(200).json({
    message: "Review updated successfully",
    data: review,
  });
});

export const deleteMyReviewController = handle(async (req, res) => {
  const result = await deleteMyReview(
    req.user!.userId,
    req.params.reviewId as string,
  );

  res.status(200).json({
    message: result.alreadyDeleted
      ? "Review was already deleted"
      : "Review deleted successfully",
    data: result,
  });
});

export const getAllReviewsController = handle(async (req, res) => {
  const pagination = parseReviewPagination(req.query.page, req.query.limit);

  const statusValue = req.query.status;

  let status: ReviewStatus | undefined;

  if (statusValue !== undefined) {
    if (
      typeof statusValue !== "string" ||
      !Object.values(ReviewStatus).includes(statusValue as ReviewStatus)
    ) {
      throw new ReviewError(400, "Invalid review status");
    }

    status = statusValue as ReviewStatus;
  }

  const result = await getAllReviews(pagination, status);

  res.status(200).json({
    message: "All reviews retrieved successfully",
    data: result,
  });
});

export const moderateReviewController = handle(async (req, res) => {
  const nextStatus = parseModerationStatus(req.body?.status);

  const review = await moderateReview(
    req.params.reviewId as string,
    nextStatus,
  );

  res.status(200).json({
    message: "Review moderation updated successfully",
    data: review,
  });
});
