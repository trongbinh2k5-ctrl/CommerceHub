import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";

import { getAdminOrderList, changeOrderStatus } from "./order.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("STAFF", "ADMIN"));

router.get("/", getAdminOrderList);
router.patch("/:id/status", changeOrderStatus);

export default router;
