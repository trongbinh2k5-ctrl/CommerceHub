import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import app from "../src/app";
import { User } from "../src/modules/auth/user.model";
import { Address } from "../src/modules/addresses/address.model";
import { Product } from "../src/modules/products/product.model";
import { Order, OrderStatus } from "../src/modules/orders/order.model";
import { Payment, PaymentStatus } from "../src/modules/payments/payment.model";

test("Module 17: Admin Dashboard - Comprehensive Verification", { timeout: 300000 }, async (t) => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongo.getUri("module17_dashboard_test");
  process.env.JWT_ACCESS_SECRET = "module17-dashboard-test-secret";

  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;

  // Users: 0: Customer, 1: Staff, 2: Admin
  const users = await User.create([
    { fullName: "Customer User", email: "cust@dash.local", passwordHash: "unused", role: "CUSTOMER" },
    { fullName: "Staff User", email: "staff@dash.local", passwordHash: "unused", role: "STAFF" },
    { fullName: "Admin User", email: "admin@dash.local", passwordHash: "unused", role: "ADMIN" },
  ]);

  const tokens = {
    customer: jwt.sign({ role: "CUSTOMER" }, process.env.JWT_ACCESS_SECRET!, { subject: users[0].id }),
    staff: jwt.sign({ role: "STAFF" }, process.env.JWT_ACCESS_SECRET!, { subject: users[1].id }),
    admin: jwt.sign({ role: "ADMIN" }, process.env.JWT_ACCESS_SECRET!, { subject: users[2].id }),
  };

  const address = await Address.create({
    userId: users[0]._id,
    fullName: "Customer",
    phone: "0901234567",
    province: "Ha Noi",
    ward: "Thach That",
    detail: "So 10 Pho Dashboard",
  });

  const api = async (path: string, token?: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`http://127.0.0.1:${port}/api/admin/dashboard${path}`, {
      method: "GET",
      headers,
    });

    let body: any = null;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    return { status: res.status, body };
  };

  try {
    // ==========================================
    // 1. Kiểm tra khi chưa có dữ liệu (Empty DB)
    // ==========================================
    await t.test("01. Không có dữ liệu thống kê: 200 — Không lỗi server", async () => {
      const res = await api("/overview", tokens.admin);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.totalOrders, 0);
      assert.equal(res.body.data.totalCustomers, 1);
      assert.equal(res.body.data.totalProducts, 0);
      assert.equal(res.body.data.totalRevenue, 0);

      const resOrders = await api("/orders", tokens.admin);
      assert.equal(resOrders.status, 200);
      assert.equal(resOrders.body.data.totalOrders, 0);
      assert.equal(Object.keys(resOrders.body.data.byStatus).length, 6);

      const resTop = await api("/top-products", tokens.admin);
      assert.equal(resTop.status, 200);
      assert.deepEqual(resTop.body.data, []);

      const resLow = await api("/low-stock", tokens.admin);
      assert.equal(resLow.status, 200);
      assert.equal(resLow.body.data.count, 0);
    });

    // ==========================================
    // 2. Kiểm thử bảo mật (Security)
    // ==========================================
    await t.test("02. Không gửi token: 401 — Unauthorized", async () => {
      const res = await api("/overview");
      assert.equal(res.status, 401);
    });

    await t.test("03. Token CUSTOMER: 403 — Forbidden", async () => {
      const res = await api("/overview", tokens.customer);
      assert.equal(res.status, 403);
    });

    await t.test("04. Token STAFF: 403 — Forbidden", async () => {
      const res = await api("/overview", tokens.staff);
      assert.equal(res.status, 403);
    });

    await t.test("05. Token ADMIN: 200 — Thành công", async () => {
      const res = await api("/overview", tokens.admin);
      assert.equal(res.status, 200);
    });

    // ==========================================
    // 3. Chuẩn bị dữ liệu kiểm thử
    // ==========================================
    // Product 1: Stock 3 (low stock)
    const productLow = await Product.create({
      name: "Mouse Low Stock",
      sku: "SKU-LOW-1",
      price: 200000,
      stock: 3,
      isActive: true,
    });

    // Product 2: Stock 2 nhưng inactive (soft-deleted) -> không được tính trong low-stock
    const productInactive = await Product.create({
      name: "Keyboard Inactive",
      sku: "SKU-INACT-2",
      price: 500000,
      stock: 2,
      isActive: false,
    });

    // Product 3: Stock 50 (normal stock)
    const productHigh = await Product.create({
      name: "Laptop High Stock",
      sku: "SKU-HIGH-3",
      price: 20000000,
      stock: 50,
      isActive: true,
    });

    // Tạo đơn 1: DELIVERED, Payment PAID (Ngày: 2026-11-05, Số tiền: 400.000đ = 2 Mouse)
    const order1 = await Order.create({
      userId: users[0]._id,
      items: [
        {
          productId: productLow._id,
          name: productLow.name,
          sku: productLow.sku,
          price: productLow.price,
          quantity: 2,
          subtotal: 400000,
        },
      ],
      totalQuantity: 2,
      totalAmount: 400000,
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        province: address.province,
        ward: address.ward,
        detail: address.detail,
      },
      status: OrderStatus.DELIVERED,
      paymentMethod: "COD",
    });

    const paymentPaid1 = await Payment.create({
      orderId: order1._id,
      userId: users[0]._id,
      method: "COD",
      amount: 400000,
      status: PaymentStatus.PAID,
      paidAt: new Date("2026-11-05T10:00:00.000Z"),
      confirmedBy: users[1]._id,
    });

    // Tạo đơn 2: DELIVERED, Payment PAID (Ngày: 2026-11-10, Số tiền: 20.000.000đ = 1 Laptop)
    const order2 = await Order.create({
      userId: users[0]._id,
      items: [
        {
          productId: productHigh._id,
          name: productHigh.name,
          sku: productHigh.sku,
          price: productHigh.price,
          quantity: 1,
          subtotal: 20000000,
        },
      ],
      totalQuantity: 1,
      totalAmount: 20000000,
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        province: address.province,
        ward: address.ward,
        detail: address.detail,
      },
      status: OrderStatus.DELIVERED,
      paymentMethod: "COD",
    });

    const paymentPaid2 = await Payment.create({
      orderId: order2._id,
      userId: users[0]._id,
      method: "COD",
      amount: 20000000,
      status: PaymentStatus.PAID,
      paidAt: new Date("2026-11-10T15:30:00.000Z"),
      confirmedBy: users[1]._id,
    });

    // Tạo đơn 3: PENDING, Payment PENDING (Số tiền: 50.000.000đ) -> KHÔNG ĐƯỢC TÍNH VÀO DOANH THU
    const order3 = await Order.create({
      userId: users[0]._id,
      items: [
        {
          productId: productHigh._id,
          name: productHigh.name,
          sku: productHigh.sku,
          price: productHigh.price,
          quantity: 2,
          subtotal: 40000000,
        },
      ],
      totalQuantity: 2,
      totalAmount: 40000000,
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        province: address.province,
        ward: address.ward,
        detail: address.detail,
      },
      status: OrderStatus.PENDING,
      paymentMethod: "COD",
    });

    const paymentPending = await Payment.create({
      orderId: order3._id,
      userId: users[0]._id,
      method: "COD",
      amount: 40000000,
      status: PaymentStatus.PENDING,
      paidAt: null,
    });

    // Tạo các đơn khác cho đủ các trạng thái
    await Order.create({
      userId: users[0]._id,
      items: [{ productId: productHigh._id, name: productHigh.name, sku: productHigh.sku, price: 100, quantity: 1, subtotal: 100 }],
      totalQuantity: 1,
      totalAmount: 100,
      shippingAddress: { fullName: "A", phone: "1", province: "A", ward: "A", detail: "A" },
      status: OrderStatus.CONFIRMED,
      paymentMethod: "COD",
    });

    await Order.create({
      userId: users[0]._id,
      items: [{ productId: productHigh._id, name: productHigh.name, sku: productHigh.sku, price: 100, quantity: 1, subtotal: 100 }],
      totalQuantity: 1,
      totalAmount: 100,
      shippingAddress: { fullName: "A", phone: "1", province: "A", ward: "A", detail: "A" },
      status: OrderStatus.SHIPPING,
      paymentMethod: "COD",
    });

    await Order.create({
      userId: users[0]._id,
      items: [{ productId: productHigh._id, name: productHigh.name, sku: productHigh.sku, price: 100, quantity: 1, subtotal: 100 }],
      totalQuantity: 1,
      totalAmount: 100,
      shippingAddress: { fullName: "A", phone: "1", province: "A", ward: "A", detail: "A" },
      status: OrderStatus.CANCELLED,
      paymentMethod: "COD",
    });

    await Order.create({
      userId: users[0]._id,
      items: [{ productId: productHigh._id, name: productHigh.name, sku: productHigh.sku, price: 100, quantity: 1, subtotal: 100 }],
      totalQuantity: 1,
      totalAmount: 100,
      shippingAddress: { fullName: "A", phone: "1", province: "A", ward: "A", detail: "A" },
      status: OrderStatus.RETURNED,
      paymentMethod: "COD",
    });

    // ==========================================
    // 4. Kiểm thử các chức năng chính (APIs)
    // ==========================================
    await t.test("06. GET /api/admin/dashboard/overview: 200 — Có tổng đơn, khách hàng, sản phẩm, doanh thu", async () => {
      const res = await api("/overview", tokens.admin);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.totalOrders, 7); // order1, order2, order3 + 4 đơn trạng thái khác
      assert.equal(res.body.data.totalCustomers, 1);
      assert.equal(res.body.data.totalProducts, 3);
      assert.equal(res.body.data.paidPayments, 2);
      // Doanh thu chỉ tính PAID: 400.000 + 20.000.000 = 20.400.000
      assert.equal(res.body.data.totalRevenue, 20400000);
      assert.equal(res.body.data.currency, "VND");
    });

    await t.test("07. GET /api/admin/dashboard/revenue?from=2026-11-01&to=2026-11-30&period=day: 200 — Doanh thu theo ngày", async () => {
      const res = await api("/revenue?from=2026-11-01&to=2026-11-30&period=day", tokens.admin);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.period, "day");
      assert.equal(res.body.data.data.length, 2);
      assert.deepEqual(res.body.data.data, [
        { period: "2026-11-05", revenue: 400000, paymentCount: 1 },
        { period: "2026-11-10", revenue: 20000000, paymentCount: 1 },
      ]);
    });

    await t.test("08. GET /api/admin/dashboard/orders: 200 — Đủ 6 trạng thái đơn hàng", async () => {
      const res = await api("/orders", tokens.admin);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.totalOrders, 7);
      const byStatus = res.body.data.byStatus;
      assert.equal(typeof byStatus.PENDING, "number");
      assert.equal(typeof byStatus.CONFIRMED, "number");
      assert.equal(typeof byStatus.SHIPPING, "number");
      assert.equal(typeof byStatus.DELIVERED, "number");
      assert.equal(typeof byStatus.CANCELLED, "number");
      assert.equal(typeof byStatus.RETURNED, "number");
      assert.equal(byStatus.DELIVERED, 2);
      assert.equal(byStatus.PENDING, 1);
      assert.equal(byStatus.CONFIRMED, 1);
      assert.equal(byStatus.SHIPPING, 1);
      assert.equal(byStatus.CANCELLED, 1);
      assert.equal(byStatus.RETURNED, 1);
    });

    await t.test("09. GET /api/admin/dashboard/top-products?limit=10: 200 — Tối đa 10 sản phẩm bán chạy", async () => {
      const res = await api("/top-products?limit=10", tokens.admin);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.length <= 10);
      // Top 1 by quantity: productLow (quantity: 2)
      assert.equal(res.body.data[0].productId, productLow.id);
      assert.equal(res.body.data[0].totalQuantity, 2);
      assert.equal(res.body.data[0].grossSales, 400000);
      // Top 2: productHigh (quantity: 1)
      assert.equal(res.body.data[1].productId, productHigh.id);
      assert.equal(res.body.data[1].totalQuantity, 1);
      assert.equal(res.body.data[1].grossSales, 20000000);
    });

    await t.test("10. GET /api/admin/dashboard/low-stock?threshold=5&limit=20: 200 — Sản phẩm có stock ≤ 5", async () => {
      const res = await api("/low-stock?threshold=5&limit=20", tokens.admin);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      // Only productLow has stock <= 5 AND isActive == true
      assert.equal(res.body.data.count, 1);
      assert.equal(res.body.data.products[0].sku, "SKU-LOW-1");
    });

    // ==========================================
    // 5. Kiểm thử dữ liệu sai (Validation)
    // ==========================================
    await t.test("11. top-products?limit=abc: 400 — Tham số không hợp lệ", async () => {
      const res = await api("/top-products?limit=abc", tokens.admin);
      assert.equal(res.status, 400);
    });

    await t.test("12. top-products?limit=101: 400 — Vượt giới hạn", async () => {
      const res = await api("/top-products?limit=101", tokens.admin);
      assert.equal(res.status, 400);
    });

    await t.test("13. revenue?from=2026-02-30: 400 — Ngày không hợp lệ", async () => {
      const res = await api("/revenue?from=2026-02-30", tokens.admin);
      assert.equal(res.status, 400);
    });

    await t.test("14. revenue?period=year: 400 — Chu kỳ không hợp lệ", async () => {
      const res = await api("/revenue?period=year", tokens.admin);
      assert.equal(res.status, 400);
    });

    await t.test("15. low-stock?threshold=-1: 400 — Ngưỡng không hợp lệ", async () => {
      const res = await api("/low-stock?threshold=-1", tokens.admin);
      assert.equal(res.status, 400);
    });

    // ==========================================
    // 6. Kiểm tra tính chính xác (Accuracy)
    // ==========================================
    await t.test("16. Payment PENDING không tính doanh thu: Không cộng tiền chưa thanh toán", async () => {
      const res = await api("/overview", tokens.admin);
      // Total amount of order3 is 40.000.000 but payment is PENDING, so it must NOT be included
      assert.equal(res.body.data.totalRevenue, 20400000);
      assert.notEqual(res.body.data.totalRevenue, 60400000);
    });

    await t.test("17. Payment PAID được tính doanh thu: Số tiền khớp dữ liệu MongoDB", async () => {
      const payments = await Payment.find({ status: PaymentStatus.PAID });
      const sum = payments.reduce((acc, p) => acc + p.amount, 0);
      const res = await api("/overview", tokens.admin);
      assert.equal(res.body.data.totalRevenue, sum);
    });

    await t.test("18. Sản phẩm ngừng hoạt động: Không xuất hiện trong low-stock", async () => {
      const res = await api("/low-stock?threshold=5", tokens.admin);
      const skus = res.body.data.products.map((p: any) => p.sku);
      assert.ok(skus.includes("SKU-LOW-1"));
      assert.ok(!skus.includes("SKU-INACT-2")); // productInactive has stock 2 but isActive is false
    });
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});

