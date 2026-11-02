import { createHash } from "node:crypto";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export const isValidIdempotencyKey = (value: unknown): value is string => {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value);
};

export const createCheckoutRequestHash = (addressId: string, couponCode?: string): string => {
  const payload = JSON.stringify({
    addressId: addressId.toLowerCase(),
    paymentMethod: "COD",
    ...(couponCode ? { couponCode } : {}),
  });

  return createHash("sha256").update(payload).digest("hex");
};
