import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";

import { getAdminProductList, changeProductStock } from "./product.controller";

const router = Router();

router.use(authenticate);
router.use(authorize("STAFF", "ADMIN"));

router.get("/", getAdminProductList);

router.patch("/:id/stock", changeProductStock);

export default router;
