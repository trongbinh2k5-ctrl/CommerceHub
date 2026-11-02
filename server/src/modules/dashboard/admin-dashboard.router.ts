import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware";
import { authorize } from "../../middlewares/authorize.middleware";

import {
  dashboardOverviewController,
  dashboardRevenueController,
  dashboardOrdersController,
  dashboardTopProductsController,
  dashboardLowStockController,
} from "./dashboard.controller";

const router = Router();

// User must be logged in.
router.use(authenticate);

// Only ADMIN can access dashboard.
router.use(authorize("ADMIN"));

// Dashboard overview.
router.get("/overview", dashboardOverviewController);

// Revenue statistics.
router.get("/revenue", dashboardRevenueController);

// Order status statistics.
router.get("/orders", dashboardOrdersController);

// Best-selling products.
router.get("/top-products", dashboardTopProductsController);

// Low-stock products.
router.get("/low-stock", dashboardLowStockController);

export default router;
