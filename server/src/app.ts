import express from "express";
import { installSecurity } from "./middlewares/security.middleware";

import authRouter from "./modules/auth/auth.router";

import cartRouter from "./modules/cart/cart.router";

import addressRouter from "./modules/addresses/address.router";

import orderRouter from "./modules/orders/order.router";
import adminOrderRouter from "./modules/orders/admin-order.router";

import paymentRouter from "./modules/payments/payment.router";
import adminPaymentRouter from "./modules/payments/admin-payment.router";

import categoryRouter from "./modules/categories/category.router";
import adminCategoryRouter from "./modules/categories/admin-category.router";

import productRouter from "./modules/products/product.router";
import adminProductRouter from "./modules/products/admin-product.router";

import shippingRouter from "./modules/shipping/shipping.router";
import adminShippingRouter from "./modules/shipping/admin-shipping.router";

import reviewRouter from "./modules/reviews/review.router";
import adminReviewRouter from "./modules/reviews/admin-review.router";

import adminCouponRouter from "./modules/coupons/admin-coupon.router";

// MODULE 17: Admin Dashboard.
import adminDashboardRouter from "./modules/dashboard/admin-dashboard.router";

import { errorHandler } from "./middlewares/error.middleware";

const app = express();

// Global middlewares.
installSecurity(app);
app.use(express.json({ limit: "32kb", strict: true }));

// Authentication.
app.use("/api/auth", authRouter);

// Addresses.
app.use("/api/addresses", addressRouter);

// Orders.
app.use("/api/orders", orderRouter);
app.use("/api/admin/orders", adminOrderRouter);

// Payments.
app.use("/api/payments", paymentRouter);
app.use("/api/admin/payments", adminPaymentRouter);

// Categories.
app.use("/api/categories", categoryRouter);
app.use("/api/admin/categories", adminCategoryRouter);

// Products.
app.use("/api/products", productRouter);
app.use("/api/admin/products", adminProductRouter);

// Cart.
app.use("/api/cart", cartRouter);

// Shipping.
app.use("/api/shipping", shippingRouter);
app.use("/api/admin/shipping", adminShippingRouter);

// Reviews.
app.use("/api/reviews", reviewRouter);
app.use("/api/admin/reviews", adminReviewRouter);

// Coupons.
app.use("/api/admin/coupons", adminCouponRouter);

// MODULE 17: Dashboard.
app.use("/api/admin/dashboard", adminDashboardRouter);

// Health check.
app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "CommerceHub API is running",
  });
});

// Global error handler.
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});
app.use(errorHandler);

export default app;
