import { PaginationInput, ReviewInput, ReviewStatus } from "./review.types";

export class ReviewError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

export const isValidReviewId = (value: unknown): value is string => {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
};

export const validateReviewInput = (value: unknown): ReviewInput => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ReviewError(400, "Review body must be an object");
  }

  const body = value as Record<string, unknown>;

  if (
    typeof body.rating !== "number" ||
    !Number.isInteger(body.rating) ||
    body.rating < 1 ||
    body.rating > 5
  ) {
    throw new ReviewError(400, "Rating must be an integer from 1 to 5");
  }

  if (typeof body.title !== "string") {
    throw new ReviewError(400, "Review title must be a string");
  }

  if (typeof body.comment !== "string") {
    throw new ReviewError(400, "Review comment must be a string");
  }

  const title = body.title.trim();
  const comment = body.comment.trim();

  if (title.length < 3 || title.length > 120) {
    throw new ReviewError(400, "Review title must contain 3 to 120 characters");
  }

  if (comment.length < 10 || comment.length > 2000) {
    throw new ReviewError(
      400,
      "Review comment must contain 10 to 2000 characters",
    );
  }

  return {
    rating: body.rating,
    title,
    comment,
  };
};

const parsePositiveInteger = (
  value: unknown,
  fallback: number,
  maximum: number,
  fieldName: string,
): number => {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new ReviewError(400, `Invalid ${fieldName}`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new ReviewError(400, `Invalid ${fieldName}`);
  }

  return parsed;
};

export const parseReviewPagination = (
  pageValue: unknown,
  limitValue: unknown,
): PaginationInput => {
  const page = parsePositiveInteger(pageValue, 1, 10000, "page");

  const limit = parsePositiveInteger(limitValue, 20, 50, "limit");

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

export const parseModerationStatus = (
  value: unknown,
): ReviewStatus.VISIBLE | ReviewStatus.HIDDEN => {
  if (value === ReviewStatus.VISIBLE || value === ReviewStatus.HIDDEN) {
    return value;
  }

  throw new ReviewError(400, "Moderation status must be VISIBLE or HIDDEN");
};
