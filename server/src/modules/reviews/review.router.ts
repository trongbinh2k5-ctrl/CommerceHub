import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";

import {
  createReviewController,
  deleteMyReviewController,
  getMyReviewsController,
  getProductReviewsController,
  getProductReviewSummaryController,
  updateMyReviewController,
} from "./review.controller";

const router = Router();

// PUBLIC: No login required
router.get("/products/:productId/summary", getProductReviewSummaryController);
router.get("/products/:productId", getProductReviewsController);

// CUSTOMER ONLY: Login and CUSTOMER role required
router.use(authenticate);
router.use(authorize("CUSTOMER"));

router.get("/me", getMyReviewsController);
router.post("/", createReviewController);
router.patch("/:reviewId", updateMyReviewController);
router.delete("/:reviewId", deleteMyReviewController);

export default router;
