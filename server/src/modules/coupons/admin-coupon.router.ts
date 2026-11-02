import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";
import { Coupon } from "./coupon.model";
import { CouponError, normalizeCouponCode } from "./coupon.service";
const router = Router();
router.use(authenticate, authorize("ADMIN", "STAFF"));
router.get("/", async (_req, res) => { res.json({ success: true, data: await Coupon.find().sort({ createdAt: -1 }) }); });
router.post("/", async (req, res) => {
  const b = req.body ?? {};
  const code = normalizeCouponCode(b.code);
  const startsAt = new Date(b.startsAt), expiresAt = new Date(b.expiresAt);
  if (!code || !["FIXED", "PERCENT"].includes(b.type) || !Number.isSafeInteger(b.value) || b.value < 1 ||
    (b.type === "PERCENT" && b.value > 100) || !Number.isSafeInteger(b.maxUses) || b.maxUses < 1 ||
    !Number.isSafeInteger(b.minSubtotal ?? 0) || (b.minSubtotal ?? 0) < 0 ||
    !Number.isFinite(startsAt.getTime()) || !Number.isFinite(expiresAt.getTime()) || startsAt >= expiresAt ||
    (b.isActive !== undefined && typeof b.isActive !== "boolean")) throw new CouponError(400, "Invalid coupon data");
  try {
    const data = await Coupon.create({ code, type: b.type, value: b.value, maxUses: b.maxUses,
      minSubtotal: b.minSubtotal ?? 0, startsAt, expiresAt, isActive: b.isActive ?? true });
    res.status(201).json({ success: true, data });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new CouponError(409, "Coupon code already exists");
    throw error;
  }
});
router.patch("/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id) || typeof req.body?.isActive !== "boolean") throw new CouponError(400, "Invalid coupon update");
  const data = await Coupon.findByIdAndUpdate(req.params.id, { $set: { isActive: req.body.isActive } }, { returnDocument: "after" });
  if (!data) throw new CouponError(404, "Coupon not found");
  res.json({ success: true, data });
});
export default router;
