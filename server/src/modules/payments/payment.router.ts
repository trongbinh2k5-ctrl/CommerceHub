import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";

import { authorize } from "../../middlewares/authorize.middleware";

import { getMyPayment } from "./payment.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("CUSTOMER"));

router.get("/orders/:orderId", getMyPayment);

export default router;
