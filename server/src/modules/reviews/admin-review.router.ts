import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";

import {
  getAllReviewsController,
  moderateReviewController,
} from "./review.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("STAFF", "ADMIN"));

router.get("/", getAllReviewsController);

router.patch("/:reviewId/moderation", moderateReviewController);

export default router;
