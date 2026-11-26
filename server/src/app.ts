import express from "express";
import { installSecurity } from "./middlewares/security.middleware";
import {installFrontend,defaultFrontendDirectory} from './config/frontend';

import authRouter from "./modules/auth/auth.router";

import cartRouter from "./modules/cart/cart.router";

import addressRouter from "./modules/addresses/address.router";

import orderRouter from "./modules/orders/order.router";
import adminOrderRouter from "./modules/orders/admin-order.router";

import paymentRouter from "./modules/payments/payment.router";
import { vnpayRouter } from './modules/payments/vnpay.router';
import { sepayRouter } from './modules/payments/sepay.router';
import adminPaymentRouter from "./modules/payments/admin-payment.router";

import categoryRouter from "./modules/categories/category.router";
import adminCategoryRouter from "./modules/categories/admin-category.router";

import productRouter from "./modules/products/product.router";
import adminProductRouter from "./modules/products/admin-product.router";

import shippingRouter from "./modules/shipping/shipping.router";
import adminShippingRouter from "./modules/shipping/admin-shipping.router";
import { ghnRouter } from './modules/shipping/ghn.router';

import reviewRouter from "./modules/reviews/review.router";
import adminReviewRouter from "./modules/reviews/admin-review.router";

import adminCouponRouter from "./modules/coupons/admin-coupon.router";

// MODULE 17: Admin Dashboard.
import adminDashboardRouter from "./modules/dashboard/admin-dashboard.router";

import { errorHandler } from "./middlewares/error.middleware";
import { storeRouter, adminStoreRouter } from './modules/store/store.router';
import { adminUserRouter } from './modules/auth/staff-admin.router';
import { staffApplicationRouter, adminStaffApplicationRouter } from './modules/auth/staff-application.router';
import { auditRouter } from './modules/operations/audit.router';
import { supportRouter, adminSupportRouter, notificationRouter, inventoryRouter } from './modules/operations/operations.router';
import { mediaRouter, mediaFiles } from './modules/products/media.router';
import { excelRouter } from './modules/excel/excel.router';
import { chatRouter } from './modules/chat/chat.router';

export function createApp(options: { apiRateLimit?: number; loginRateLimit?: number; frontendDirectory?:string } = {}) {
const app = express();

// Global middlewares.
installSecurity(app, options.apiRateLimit, options.loginRateLimit);
app.use('/api/admin/excel', excelRouter);
app.use('/api/admin/settings', express.json({ limit: '96kb', strict: true }), adminStoreRouter);
app.use('/api/products', express.json({ limit: '96kb', strict: true }), productRouter);
app.use(express.json({ limit: "32kb", strict: true }));

// Authentication.
app.use("/api/auth", authRouter);
app.use('/api/chat', chatRouter);
app.use('/api/store', storeRouter);
app.use('/api/admin/users', adminUserRouter);
app.use('/api/staff-applications', staffApplicationRouter);
app.use('/api/admin/staff-applications', adminStaffApplicationRouter);
app.use('/api/admin/audit', auditRouter);
app.use('/api/support', supportRouter);
app.use('/api/admin/support', adminSupportRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/admin/inventory', inventoryRouter);
app.use('/api/admin/media', mediaRouter);
app.use('/api/media', mediaFiles);

// Addresses.
app.use("/api/addresses", addressRouter);

// Orders.
app.use("/api/orders", orderRouter);
app.use("/api/admin/orders", adminOrderRouter);

// Payments.
app.use('/api/payments/vnpay', vnpayRouter);
app.use('/api/payments/sepay', sepayRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/admin/payments", adminPaymentRouter);

// Categories.
app.use("/api/categories", categoryRouter);
app.use("/api/admin/categories", adminCategoryRouter);

// Products.
app.use("/api/admin/products", adminProductRouter);

// Cart.
app.use("/api/cart", cartRouter);

// Shipping.
app.use("/api/shipping", shippingRouter);
app.use('/api/admin/shipping/ghn',ghnRouter);
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
if(options.frontendDirectory||process.env.SERVE_FRONTEND==='true')installFrontend(app,options.frontendDirectory||process.env.FRONTEND_DIRECTORY||defaultFrontendDirectory);
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});
app.use(errorHandler);

return app;
}
export default createApp();
