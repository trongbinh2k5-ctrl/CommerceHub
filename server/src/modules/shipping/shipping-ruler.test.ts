import assert from "node:assert/strict";
import test from "node:test";

import {
  SHIPPING_STATUSES,
  SHIPPING_TRANSITIONS,
  MAX_DELIVERY_ATTEMPTS,
  canTransition,
  isShippingStatus,
  isValidTrackingCode,
  isValidCarrier,
  isValidCarrierFee,
} from "./shipping.types";

test("status transitions follow the state machine", () => {
  assert.equal(canTransition("READY", "PICKED_UP"), true);

  assert.equal(canTransition("READY", "DELIVERED"), false);

  assert.equal(canTransition("OUT_FOR_DELIVERY", "DELIVERY_FAILED"), true);

  assert.equal(canTransition("DELIVERY_FAILED", "OUT_FOR_DELIVERY"), true);

  assert.equal(canTransition("DELIVERY_FAILED", "RETURNING"), true);

  assert.equal(canTransition("RETURNING", "RETURNED"), true);

  assert.equal(canTransition("RETURNED", "PICKED_UP"), false);

  assert.equal(canTransition("DELIVERED", "RETURNING"), false);
});

test("all transition targets are valid", () => {
  for (const status of SHIPPING_STATUSES) {
    for (const target of SHIPPING_TRANSITIONS[status]) {
      assert.equal(isShippingStatus(target), true);
    }
  }
});

test("unknown shipping status is rejected", () => {
  assert.equal(isShippingStatus("PAID"), false);

  assert.equal(isShippingStatus(5), false);
});

test("tracking code validation", () => {
  assert.equal(isValidTrackingCode("GHN_123456"), true);

  assert.equal(isValidTrackingCode("GHN 123456"), false);

  assert.equal(isValidTrackingCode("abc"), false);
});

test("carrier name validation", () => {
  assert.equal(isValidCarrier("GHN"), true);

  assert.equal(isValidCarrier(" "), false);
});

test("carrier fee validation", () => {
  assert.equal(isValidCarrierFee(25000), true);

  assert.equal(isValidCarrierFee(0), true);

  assert.equal(isValidCarrierFee(-1), false);

  assert.equal(isValidCarrierFee(1.5), false);

  assert.equal(isValidCarrierFee(Number.MAX_SAFE_INTEGER + 1), false);
});

test("maximum delivery attempts", () => {
  assert.equal(MAX_DELIVERY_ATTEMPTS, 3);
});
