import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";

import {
  createMyOrder,
  getMyOrderList,
  getMyOrderDetail,
  cancelMyOrderController,
} from "./order.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("CUSTOMER"));

router.post("/", createMyOrder);
router.get("/", getMyOrderList);
router.get("/:id", getMyOrderDetail);
router.patch("/:id/cancel", cancelMyOrderController);

export default router;
