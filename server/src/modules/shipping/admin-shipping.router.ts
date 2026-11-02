import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";

import { authorize } from "../../middlewares/authorize.middleware";

import {
  createAdminShipment,
  changeAdminShipmentStatus,
  listAdminShipments,
  detailAdminShipment,
} from "./shipping.controller";

const router = Router();

router.use(authenticate);

router.use(authorize("STAFF", "ADMIN"));

router.get("/", listAdminShipments);

router.post("/", createAdminShipment);

router.get("/:id", detailAdminShipment);

router.patch("/:id/status", changeAdminShipmentStatus);

export default router;
