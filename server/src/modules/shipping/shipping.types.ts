export const SHIPPING_STATUSES = [
  "READY",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERY_FAILED",
  "RETURNING",
  "RETURNED",
  "DELIVERED",
  "CANCELLED",
] as const;

export type ShippingStatus = (typeof SHIPPING_STATUSES)[number];

export const SHIPPING_TRANSITIONS: Record<
  ShippingStatus,
  readonly ShippingStatus[]
> = {
  READY: ["PICKED_UP"],

  PICKED_UP: ["IN_TRANSIT", "RETURNING"],

  IN_TRANSIT: ["OUT_FOR_DELIVERY", "RETURNING"],

  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED", "RETURNING"],

  DELIVERY_FAILED: ["OUT_FOR_DELIVERY", "RETURNING"],

  RETURNING: ["RETURNED"],

  RETURNED: [],
  DELIVERED: [],
  CANCELLED: [],
};

export const MAX_DELIVERY_ATTEMPTS = 3;

export const isShippingStatus = (value: unknown): value is ShippingStatus =>
  typeof value === "string" &&
  (SHIPPING_STATUSES as readonly string[]).includes(value);

export const canTransition = (
  from: ShippingStatus,
  to: ShippingStatus,
): boolean => SHIPPING_TRANSITIONS[from].includes(to);

export const isValidTrackingCode = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Z0-9][A-Z0-9_-]{5,39}$/.test(value);

export const isValidCarrier = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim().length >= 2 &&
  value.trim().length <= 80;

export const isValidCarrierFee = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
