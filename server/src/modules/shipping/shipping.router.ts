import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";

import { authorize } from "../../middlewares/authorize.middleware";

import { listMyShipments, detailMyShipment } from "./shipping.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("CUSTOMER"));

router.get("/me", listMyShipments);

router.get("/me/orders/:orderId", detailMyShipment);

export default router;
