import test from "node:test";
import assert from "node:assert/strict";

import {
  isValidIdempotencyKey,
  createCheckoutRequestHash,
} from "../src/modules/orders/checkout-idempotency";

test("accepts a valid UUID-like idempotency key", () => {
  assert.equal(
    isValidIdempotencyKey("7c9d3a10-8c44-4b66-97c1-183c1ef28e12"),
    true,
  );
});

test("rejects a short idempotency key", () => {
  assert.equal(isValidIdempotencyKey("short"), false);
});

test("rejects invalid characters", () => {
  assert.equal(isValidIdempotencyKey("invalid key with spaces"), false);
});

test("rejects non-string values", () => {
  assert.equal(isValidIdempotencyKey(undefined), false);

  assert.equal(isValidIdempotencyKey(123456789), false);
});

test("generates the same hash for the same request", () => {
  const addressId = "507f1f77bcf86cd799439011";

  assert.equal(
    createCheckoutRequestHash(addressId),
    createCheckoutRequestHash(addressId),
  );
});

test("normalizes ObjectId casing", () => {
  const upper = "507F1F77BCF86CD799439011";

  const lower = "507f1f77bcf86cd799439011";

  assert.equal(
    createCheckoutRequestHash(upper),
    createCheckoutRequestHash(lower),
  );
});

test("generates different hashes for different addresses", () => {
  const first = "507f1f77bcf86cd799439011";

  const second = "507f191e810c19729de860ea";

  assert.notEqual(
    createCheckoutRequestHash(first),
    createCheckoutRequestHash(second),
  );
});
