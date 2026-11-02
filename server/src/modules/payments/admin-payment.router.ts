import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";

import { authorize } from "../../middlewares/authorize.middleware";

import {
  getAdminPayments,
  getAdminPaymentDetail,
  confirmAdminCodPayment,
} from "./payment.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("STAFF", "ADMIN"));

router.get("/", getAdminPayments);

router.get("/orders/:orderId", getAdminPaymentDetail);

router.patch("/orders/:orderId/confirm", confirmAdminCodPayment);

export default router;
