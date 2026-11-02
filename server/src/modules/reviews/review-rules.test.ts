import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidReviewId,
  parseModerationStatus,
  parseReviewPagination,
  ReviewError,
  validateReviewInput,
} from "./review.rules";

import { ReviewStatus } from "./review.types";

test("Accept a valid review", () => {
  const result = validateReviewInput({
    rating: 5,
    title: "Very good product",
    comment: "The product works as expected.",
  });

  assert.equal(result.rating, 5);
  assert.equal(result.title, "Very good product");
});

test("Trim review title and comment", () => {
  const result = validateReviewInput({
    rating: 4,
    title: "  Good product  ",
    comment: "  The quality is quite good.  ",
  });

  assert.equal(result.title, "Good product");
  assert.equal(result.comment, "The quality is quite good.");
});

test("Reject rating below 1", () => {
  assert.throws(
    () =>
      validateReviewInput({
        rating: 0,
        title: "Good product",
        comment: "This is a test comment.",
      }),
    ReviewError,
  );
});

test("Reject rating above 5", () => {
  assert.throws(
    () =>
      validateReviewInput({
        rating: 6,
        title: "Good product",
        comment: "This is a test comment.",
      }),
    ReviewError,
  );
});

test("Reject decimal rating", () => {
  assert.throws(
    () =>
      validateReviewInput({
        rating: 4.5,
        title: "Good product",
        comment: "This is a test comment.",
      }),
    ReviewError,
  );
});

test("Reject empty comment", () => {
  assert.throws(
    () =>
      validateReviewInput({
        rating: 5,
        title: "Good product",
        comment: "",
      }),
    ReviewError,
  );
});

test("Reject invalid review ID", () => {
  assert.equal(isValidReviewId("abc"), false);

  assert.equal(isValidReviewId("507f1f77bcf86cd799439011"), true);
});

test("Use default pagination", () => {
  const result = parseReviewPagination(undefined, undefined);

  assert.deepEqual(result, {
    page: 1,
    limit: 20,
    skip: 0,
  });
});

test("Calculate pagination offset", () => {
  const result = parseReviewPagination("3", "10");

  assert.deepEqual(result, {
    page: 3,
    limit: 10,
    skip: 20,
  });
});

test("Reject pagination limit over 50", () => {
  assert.throws(() => parseReviewPagination("1", "100"), ReviewError);
});

test("Accept hidden moderation status", () => {
  assert.equal(parseModerationStatus("HIDDEN"), ReviewStatus.HIDDEN);
});

test("Reject deleted moderation status", () => {
  assert.throws(() => parseModerationStatus("DELETED"), ReviewError);
});
