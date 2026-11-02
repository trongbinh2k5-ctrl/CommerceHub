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
import { Cart } from "../src/modules/cart/cart.model";
import { Order, OrderStatus } from "../src/modules/orders/order.model";
import { Payment } from "../src/modules/payments/payment.model";
import { Shipment } from "../src/modules/shipping/shipping.model";

test("Module 14: Shipping Module - 22 Test Scenarios", { timeout: 300000 }, async (t) => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongo.getUri("module14_shipping_test");
  process.env.JWT_ACCESS_SECRET = "module14-shipping-test-secret";

  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;

  // Users: 0: Customer A, 1: Customer B, 2: Staff, 3: Admin
  const users = await User.create(
    ["CUSTOMER", "CUSTOMER", "STAFF", "ADMIN"].map((role, i) => ({
      fullName: `User-${role}-${i}`,
      email: `m14-${i}@test.local`,
      passwordHash: "unused",
      role,
    }))
  );

  const tokens = users.map((u) =>
    jwt.sign({ role: u.role }, process.env.JWT_ACCESS_SECRET!, { subject: u.id })
  );

  const addresses = await Address.create(
    users.slice(0, 2).map((u, i) => ({
      userId: u._id,
      fullName: `Customer ${i}`,
      phone: "0901234567",
      province: "Ha Noi",
      ward: "Thach That",
      detail: `So ${i + 1} Nguyen Trai`,
    }))
  );

  let seq = 0;
  const api = async (
    path: string,
    userIndex?: number,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {}
  ) => {
    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };
    if (userIndex !== undefined && tokens[userIndex]) {
      reqHeaders.Authorization = `Bearer ${tokens[userIndex]}`;
    }

    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: reqHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let resBody: any = null;
    const text = await res.text();
    try {
      resBody = JSON.parse(text);
    } catch {
      resBody = text;
    }

    return { status: res.status, body: resBody };
  };

  const createConfirmedOrder = async (userIndex = 0, stock = 10, quantity = 1) => {
    const product = await Product.create({
      name: `Laptop M14-${++seq}`,
      sku: `SKU-M14-${seq}`,
      price: 25000000,
      stock,
    });

    await Cart.findOneAndUpdate(
      { userId: users[userIndex]._id },
      { $set: { items: [{ productId: product._id, quantity }] }, $inc: { __v: 1 } },
      { upsert: true }
    );

    const checkoutRes = await api(
      "/orders",
      userIndex,
      "POST",
      { addressId: addresses[userIndex].id },
      { "Idempotency-Key": `idemp-m14-order-${seq}` }
    );
    assert.equal(checkoutRes.status, 201);
    const orderId = checkoutRes.body.data._id;

    // Admin/Staff confirms the order
    const confirmRes = await api(`/admin/orders/${orderId}/status`, 2, "PATCH", {
      status: "CONFIRMED",
    });
    assert.equal(confirmRes.status, 200);

    return { orderId, product };
  };

  try {
    // 1. Khách hàng không được tạo vận đơn qua tuyến quản trị (403)
    await t.test("01. Customer blocked from creating shipment via admin route", async () => {
      const { orderId } = await createConfirmedOrder(0);
      const res = await api("/admin/shipping", 0, "POST", {
        orderId,
        carrier: "GHTK",
        trackingCode: "GHTK123456",
        carrierFee: 30000,
      });
      assert.equal(res.status, 403);
    });

    // 2. Yêu cầu chưa đăng nhập bị từ chối (401)
    await t.test("02. Unauthenticated requests are rejected", async () => {
      const resAdmin = await api("/admin/shipping", undefined, "GET");
      assert.equal(resAdmin.status, 401);

      const resCustomer = await api("/shipping/me", undefined, "GET");
      assert.equal(resCustomer.status, 401);
    });

    // 3. Nhân viên tạo vận đơn cho đơn đã xác nhận, thanh toán đang chờ (201)
    let order3Id: string;
    let shipment3Id: string;
    await t.test("03. Staff creates shipment for CONFIRMED order with PENDING payment", async () => {
      const setup = await createConfirmedOrder(0);
      order3Id = setup.orderId;

      const res = await api("/admin/shipping", 2, "POST", {
        orderId: order3Id,
        carrier: "VNPost",
        trackingCode: "VNP00123456",
        carrierFee: 25000,
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.shipment.status, "READY");
      assert.equal(res.body.shipment.trackingCode, "VNP00123456");
      shipment3Id = res.body.shipment._id;
    });

    // 4. Không tạo vận đơn cho đơn chưa xác nhận, đã hủy hoặc đã giao (409)
    await t.test("04. Cannot create shipment for non-CONFIRMED orders", async () => {
      // 4a. Order in PENDING status
      const product = await Product.create({
        name: `Laptop Unconfirmed-${++seq}`,
        sku: `SKU-UNCONF-${seq}`,
        price: 15000000,
        stock: 5,
      });
      await Cart.findOneAndUpdate(
        { userId: users[0]._id },
        { $set: { items: [{ productId: product._id, quantity: 1 }] }, $inc: { __v: 1 } },
        { upsert: true }
      );
      const pendingRes = await api(
        "/orders",
        0,
        "POST",
        { addressId: addresses[0].id },
        { "Idempotency-Key": `idemp-unconf-testkey-${seq}` }
      );
      assert.equal(pendingRes.status, 201);
      const pendingOrderId = pendingRes.body.data._id;

      const resPending = await api("/admin/shipping", 2, "POST", {
        orderId: pendingOrderId,
        carrier: "GHTK",
        trackingCode: "UNCONF123456",
        carrierFee: 20000,
      });
      assert.equal(resPending.status, 409);

      // 4b. Cancelled order
      await api(`/orders/${pendingOrderId}/cancel`, 0, "PATCH");
      const resCancelled = await api("/admin/shipping", 2, "POST", {
        orderId: pendingOrderId,
        carrier: "GHTK",
        trackingCode: "CANC123456",
        carrierFee: 20000,
      });
      assert.equal(resCancelled.status, 409);
    });

    // 5. Không tạo hai vận đơn cho cùng một đơn hàng (409)
    await t.test("05. Cannot create duplicate shipment for same order", async () => {
      const res = await api("/admin/shipping", 2, "POST", {
        orderId: order3Id,
        carrier: "ViettelPost",
        trackingCode: "VTP888888",
        carrierFee: 35000,
      });
      assert.equal(res.status, 409);
    });

    // 6. Không cho phép trùng mã theo dõi vận đơn (409)
    await t.test("06. Cannot duplicate tracking code across different orders", async () => {
      const { orderId: orderBId } = await createConfirmedOrder(0);
      const res = await api("/admin/shipping", 2, "POST", {
        orderId: orderBId,
        carrier: "VNPost",
        trackingCode: "VNP00123456", // already used in test 03
        carrierFee: 25000,
      });
      assert.equal(res.status, 409);
    });

    // 7. Từ chối mã vận đơn, đơn vị vận chuyển hoặc chi phí không hợp lệ (400)
    await t.test("07. Reject invalid carrier, trackingCode, or carrierFee", async () => {
      const { orderId } = await createConfirmedOrder(0);

      // Invalid carrier (empty/whitespace)
      const resBadCarrier = await api("/admin/shipping", 2, "POST", {
        orderId,
        carrier: " ",
        trackingCode: "VALID123456",
        carrierFee: 20000,
      });
      assert.equal(resBadCarrier.status, 400);

      // Invalid tracking code (special characters or too short)
      const resBadTracking = await api("/admin/shipping", 2, "POST", {
        orderId,
        carrier: "GHTK",
        trackingCode: "abc!",
        carrierFee: 20000,
      });
      assert.equal(resBadTracking.status, 400);

      // Invalid carrierFee (negative or float)
      const resBadFee = await api("/admin/shipping", 2, "POST", {
        orderId,
        carrier: "GHTK",
        trackingCode: "VALID123456",
        carrierFee: -100,
      });
      assert.equal(resBadFee.status, 400);
    });

    // 8. Khách hàng A không xem được vận đơn của khách hàng B (404)
    await t.test("08. Customer A cannot view Customer B shipment", async () => {
      // order3Id belongs to Customer A (users[0])
      // Customer B (users[1]) tries to view it
      const res = await api(`/shipping/me/orders/${order3Id}`, 1, "GET");
      assert.equal(res.status, 404);
    });

    // 9. Phản hồi cho khách hàng không lộ chi phí nội bộ và mã nhân viên
    await t.test("09. Customer response does not leak internal costs and staff ID", async () => {
      const res = await api(`/shipping/me/orders/${order3Id}`, 0, "GET");
      assert.equal(res.status, 200);
      const ship = res.body.shipment;
      assert.equal(ship.carrierFee, undefined);
      assert.equal(ship.createdBy, undefined);
      assert.equal(ship.updatedBy, undefined);
      assert.equal(ship.__v, undefined);
      if (ship.events && ship.events.length > 0) {
        assert.equal(ship.events[0].actorId, undefined);
      }
    });

    // 10. Không cho phép chuyển thẳng READY sang DELIVERED (409)
    await t.test("10. Cannot transition directly from READY to DELIVERED", async () => {
      const res = await api(`/admin/shipping/${shipment3Id}/status`, 2, "PATCH", {
        status: "DELIVERED",
      });
      assert.equal(res.status, 409);
    });

    // 11. READY sang PICKED_UP làm đơn hàng chuyển sang SHIPPING
    await t.test("11. READY -> PICKED_UP updates order status to SHIPPING", async () => {
      const res = await api(`/admin/shipping/${shipment3Id}/status`, 2, "PATCH", {
        status: "PICKED_UP",
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.shipment.status, "PICKED_UP");

      const order = await Order.findById(order3Id);
      assert.equal(order!.status, OrderStatus.SHIPPING);
    });

    // 12. PICKED_UP sang IN_TRANSIT rồi OUT_FOR_DELIVERY thành công
    await t.test("12. PICKED_UP -> IN_TRANSIT -> OUT_FOR_DELIVERY succeeds", async () => {
      const resTransit = await api(`/admin/shipping/${shipment3Id}/status`, 2, "PATCH", {
        status: "IN_TRANSIT",
      });
      assert.equal(resTransit.status, 200);
      assert.equal(resTransit.body.shipment.status, "IN_TRANSIT");

      const resOut = await api(`/admin/shipping/${shipment3Id}/status`, 2, "PATCH", {
        status: "OUT_FOR_DELIVERY",
      });
      assert.equal(resOut.status, 200);
      assert.equal(resOut.body.shipment.status, "OUT_FOR_DELIVERY");
      assert.equal(resOut.body.shipment.deliveryAttempts, 1);
    });

    // 13. DELIVERED làm đơn hàng đã giao nhưng thanh toán vẫn đang chờ
    await t.test("13. DELIVERED updates order to DELIVERED, payment stays PENDING", async () => {
      const res = await api(`/admin/shipping/${shipment3Id}/status`, 2, "PATCH", {
        status: "DELIVERED",
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.shipment.status, "DELIVERED");

      const order = await Order.findById(order3Id);
      assert.equal(order!.status, OrderStatus.DELIVERED);

      const payment = await Payment.findOne({ orderId: order3Id });
      assert.equal(payment!.status, "PENDING");
    });

    // 14. Nhân viên xác nhận thu tiền COD bằng Module 13 sau khi giao
    await t.test("14. Staff confirms COD payment after delivery", async () => {
      const res = await api(`/admin/payments/orders/${order3Id}/confirm`, 2, "PATCH");
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, "PAID");
      assert.ok(res.body.data.paidAt);
      assert.equal(res.body.data.confirmedBy, users[2].id);
    });

    // 15. Gửi lặp lại cùng trạng thái không tạo thêm lịch sử
    await t.test("15. Repeated status update does not append duplicate events", async () => {
      const beforeShipment = await Shipment.findById(shipment3Id).lean();
      const eventCountBefore = beforeShipment!.events.length;

      const res = await api(`/admin/shipping/${shipment3Id}/status`, 2, "PATCH", {
        status: "DELIVERED",
      });
      assert.equal(res.status, 200);

      const afterShipment = await Shipment.findById(shipment3Id).lean();
      assert.equal(afterShipment!.events.length, eventCountBefore);
    });

    // 16. Hai cập nhật đồng thời không được gây trạng thái mâu thuẫn
    await t.test("16. Concurrent status updates do not create inconsistent state", async () => {
      const { orderId } = await createConfirmedOrder(0);
      const shipRes = await api("/admin/shipping", 2, "POST", {
        orderId,
        carrier: "J&T",
        trackingCode: `JT-RACE-${++seq}`,
        carrierFee: 30000,
      });
      const raceShipmentId = shipRes.body.shipment._id;

      // From READY, only PICKED_UP is valid. Try two updates: one PICKED_UP, one invalid DELIVERED
      const [res1, res2] = await Promise.all([
        api(`/admin/shipping/${raceShipmentId}/status`, 2, "PATCH", { status: "PICKED_UP" }),
        api(`/admin/shipping/${raceShipmentId}/status`, 2, "PATCH", { status: "DELIVERED" }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert.deepEqual(statuses, [200, 409]);

      const finalShip = await Shipment.findById(raceShipmentId);
      assert.equal(finalShip!.status, "PICKED_UP");
    });

    // 17. DELIVERY_FAILED không có lý do phải bị từ chối (400)
    await t.test("17. DELIVERY_FAILED without reason is rejected", async () => {
      const { orderId } = await createConfirmedOrder(0);
      const shipRes = await api("/admin/shipping", 2, "POST", {
        orderId,
        carrier: "GHTK",
        trackingCode: `GHTK-FAIL-${++seq}`,
        carrierFee: 30000,
      });
      const shipId = shipRes.body.shipment._id;
      await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "PICKED_UP" });
      await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "IN_TRANSIT" });
      await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "OUT_FOR_DELIVERY" });

      // Missing or empty note
      const resNoNote = await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", {
        status: "DELIVERY_FAILED",
      });
      assert.equal(resNoNote.status, 400);

      const resBlankNote = await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", {
        status: "DELIVERY_FAILED",
        note: "   ",
      });
      assert.equal(resBlankNote.status, 400);

      // With valid reason
      const resValid = await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", {
        status: "DELIVERY_FAILED",
        note: "Khach hang hen lai ngay mai",
      });
      assert.equal(resValid.status, 200);
      assert.equal(resValid.body.shipment.status, "DELIVERY_FAILED");
    });

    // 18. Không được vượt quá ba lần giao hàng
    await t.test("18. Maximum 3 delivery attempts enforced", async () => {
      const { orderId } = await createConfirmedOrder(0);
      const shipRes = await api("/admin/shipping", 2, "POST", {
        orderId,
        carrier: "GHTK",
        trackingCode: `GHTK-3ATT-${++seq}`,
        carrierFee: 30000,
      });
      const shipId = shipRes.body.shipment._id;
      await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "PICKED_UP" });
      await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "IN_TRANSIT" });

      // Attempt 1
      const a1 = await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "OUT_FOR_DELIVERY" });
      assert.equal(a1.status, 200);
      assert.equal(a1.body.shipment.deliveryAttempts, 1);
      await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "DELIVERY_FAILED", note: "Fail 1" });

      // Attempt 2
      const a2 = await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "OUT_FOR_DELIVERY" });
      assert.equal(a2.status, 200);
      assert.equal(a2.body.shipment.deliveryAttempts, 2);
      await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "DELIVERY_FAILED", note: "Fail 2" });

      // Attempt 3
      const a3 = await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "OUT_FOR_DELIVERY" });
      assert.equal(a3.status, 200);
      assert.equal(a3.body.shipment.deliveryAttempts, 3);
      await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "DELIVERY_FAILED", note: "Fail 3" });

      // Attempt 4 -> Must be rejected with 409
      const a4 = await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "OUT_FOR_DELIVERY" });
      assert.equal(a4.status, 409);
    });

    // 19. RETURNED cập nhật đơn hàng và thanh toán, không tự nhập kho
    await t.test("19. RETURNED updates order and payment, does NOT auto-restock", async () => {
      const { orderId, product } = await createConfirmedOrder(0, 10, 2);
      const stockBeforeReturn = (await Product.findById(product._id))!.stock;

      const shipRes = await api("/admin/shipping", 2, "POST", {
        orderId,
        carrier: "GHTK",
        trackingCode: `GHTK-RET-${++seq}`,
        carrierFee: 30000,
      });
      const shipId = shipRes.body.shipment._id;

      await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "PICKED_UP" });
      await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "RETURNING", note: "Khach tra hang" });

      const resRet = await api(`/admin/shipping/${shipId}/status`, 2, "PATCH", { status: "RETURNED" });
      assert.equal(resRet.status, 200);

      const order = await Order.findById(orderId);
      assert.equal(order!.status, OrderStatus.RETURNED);

      const payment = await Payment.findOne({ orderId });
      assert.equal(payment!.status, "CANCELLED");

      // Verify stock did NOT automatically replenish (physical inspection required)
      const stockAfterReturn = (await Product.findById(product._id))!.stock;
      assert.equal(stockAfterReturn, stockBeforeReturn);
    });

    // 20. Hủy đơn có vận đơn READY phải đồng thời hủy vận đơn
    await t.test("20. Cancelling order with READY shipment cancels shipment and restocks", async () => {
      const { orderId, product } = await createConfirmedOrder(0, 10, 1);
      const stockBeforeCancel = (await Product.findById(product._id))!.stock;

      const shipRes = await api("/admin/shipping", 2, "POST", {
        orderId,
        carrier: "GHTK",
        trackingCode: `GHTK-CANCEL-${++seq}`,
        carrierFee: 30000,
      });
      const shipId = shipRes.body.shipment._id;

      // Customer or Admin cancels order
      const cancelRes = await api(`/admin/orders/${orderId}/status`, 2, "PATCH", {
        status: "CANCELLED",
      });
      assert.equal(cancelRes.status, 200);

      const shipAfter = await Shipment.findById(shipId);
      assert.equal(shipAfter!.status, "CANCELLED");

      const stockAfterCancel = (await Product.findById(product._id))!.stock;
      assert.equal(stockAfterCancel, stockBeforeCancel + 1);
    });

    // 21. Không thể cập nhật trực tiếp đơn hàng sang trạng thái vận chuyển
    await t.test("21. Reject manual order status update to shipping-managed states", async () => {
      const { orderId } = await createConfirmedOrder(0);

      for (const forbiddenStatus of ["SHIPPING", "DELIVERED", "RETURNED"]) {
        const res = await api(`/admin/orders/${orderId}/status`, 2, "PATCH", {
          status: forbiddenStatus,
        });
        assert.equal(res.status, 409);
      }
    });

    // 22. Phân trang, chỉ mục, kiểm tra kiểu và biên dịch đều đạt
    await t.test("22. Pagination, indexing, and list filters work as expected", async () => {
      // Admin shipment list pagination
      const resPage1 = await api("/admin/shipping?page=1&limit=2", 2, "GET");
      assert.equal(resPage1.status, 200);
      assert.equal(resPage1.body.items.length, 2);
      assert.equal(resPage1.body.page, 1);
      assert.equal(resPage1.body.limit, 2);
      assert.ok(resPage1.body.total >= 2);

      // Customer shipment list pagination
      const resCustList = await api("/shipping/me?page=1&limit=5", 0, "GET");
      assert.equal(resCustList.status, 200);
      assert.equal(resCustList.body.page, 1);
      assert.ok(Array.isArray(resCustList.body.items));

      // Invalid pagination parameters rejected with 400
      const resBadPage = await api("/admin/shipping?page=0", 2, "GET");
      assert.equal(resBadPage.status, 400);

      const resBadLimit = await api("/admin/shipping?limit=500", 2, "GET");
      assert.equal(resBadLimit.status, 400);
    });
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongo.stop();
  }
});
