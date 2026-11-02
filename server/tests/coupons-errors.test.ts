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
import { Order } from "../src/modules/orders/order.model";
import { Payment } from "../src/modules/payments/payment.model";
import { Coupon, CouponUsage } from "../src/modules/coupons/coupon.model";

test("Test 5 - Coupon error scenarios", { timeout: 300000 }, async t => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.JWT_ACCESS_SECRET = "coupon-test-secret";
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map(m => m.init()));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const users = await User.create(["CUSTOMER", "CUSTOMER", "ADMIN"].map((role, i) => ({
    fullName: `Coupon ${i}`, email: `coupon${i}@test.local`, passwordHash: "unused", role,
  })));
  const tokens = users.map(u => jwt.sign({ role: u.role }, process.env.JWT_ACCESS_SECRET!, { subject: u.id }));
  const addresses = await Address.create(users.map(u => ({ userId: u._id, fullName: "Test", phone: "0901234567", province: "HCM", ward: "Ward", detail: "1 Street" })));
  const product = await Product.create({ name: "Coupon product", sku: "COUPON-TEST", price: 100000, stock: 100 });
  let seq = 0;
  const api = async (path: string, user = 0, method = "GET", body?: unknown, key?: string) => {
    const res = await fetch(base + path, { method, headers: {
      "Content-Type": "application/json", Authorization: `Bearer ${tokens[user]}`,
      ...(key ? { "Idempotency-Key": key } : {}),
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() as any };
  };
  const cart = async (user = 0) => Cart.findOneAndUpdate({ userId: users[user]._id },
    { $set: { items: [{ productId: product._id, quantity: 1 }] }, $inc: { __v: 1 } }, { upsert: true });
  const checkout = (code: string, user = 0, key = `coupon-checkout-${++seq}`) =>
    api("/orders", user, "POST", { addressId: addresses[user].id, couponCode: code }, key);
  const coupon = async (changes: Record<string, unknown> = {}) => {
    const code = `TEST${++seq}`;
    const res = await api("/admin/coupons", 2, "POST", { code, type: "FIXED", value: 10000,
      maxUses: 10, minSubtotal: 0, startsAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() + 3600000), ...changes });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data;
  };
  const counts = async (id: string, expected: number) => {
    assert.equal((await Coupon.findById(id))!.usedCount, expected);
    assert.equal(await CouponUsage.countDocuments({ couponId: id, active: true }), expected);
  };
  try {
    const invalidCases: [string, Record<string, unknown> | undefined][] = [
      ["01. Nonexistent code -> 409", undefined],
      ["02. Expired code -> 409", { startsAt: new Date(Date.now() - 120000), expiresAt: new Date(Date.now() - 60000) }],
      ["03. Not started -> 409", { startsAt: new Date(Date.now() + 60000) }],
      ["04. Disabled -> 409", { isActive: false }],
      ["05. Below minSubtotal -> 409", { minSubtotal: 100001 }],
      ["06. Usage exhausted -> 409", { maxUses: 1 }],
    ];
    for (const [name, changes] of invalidCases) await t.test(name, async () => {
      const c = changes ? await coupon(changes) : undefined;
      if (name.startsWith("06")) {
        await cart(1); assert.equal((await checkout(c.code, 1)).status, 201);
      }
      await cart();
      const beforeStock = (await Product.findById(product._id))!.stock;
      const beforeOrders = await Order.countDocuments();
      assert.equal((await checkout(c?.code ?? "MISSING")).status, 409);
      assert.equal((await Product.findById(product._id))!.stock, beforeStock);
      assert.equal(await Order.countDocuments(), beforeOrders);
      assert.equal((await Cart.findOne({ userId: users[0]._id }))!.items.length, 1);
      if (c) await counts(c._id, name.startsWith("06") ? 1 : 0);
    });
    await t.test("07. Same customer, two active orders -> 409", async () => {
      const c = await coupon(); await cart();
      assert.equal((await checkout(c.code)).status, 201); await cart();
      assert.equal((await checkout(c.code)).status, 409); await counts(c._id, 1);
    });
    await t.test("08. Two checkouts competing for final use", async () => {
      const c = await coupon({ maxUses: 1 }); await cart();
      // Separate products avoid serializing competitors through a shared stock update.
      const other = await Product.create({ name: "Race product", sku: "COUPON-RACE", price: 100000, stock: 10 });
      await Cart.findOneAndUpdate({ userId: users[1]._id },
        { $set: { items: [{ productId: other._id, quantity: 1 }] }, $inc: { __v: 1 } }, { upsert: true });
      const results = await Promise.all([checkout(c.code), checkout(c.code, 1)]);
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
      await counts(c._id, 1);
      assert.equal(await Order.countDocuments({ couponId: c._id }), 1);
    });
    await t.test("09. Checkout failure after reservation rolls back use", async () => {
      const c = await coupon(); await cart();
      const beforeStock = (await Product.findById(product._id))!.stock;
      const original = Payment.create;
      Payment.create = (async () => { throw Object.assign(new Error("Injected payment failure"), { statusCode: 503 }); }) as typeof Payment.create;
      try { assert.equal((await checkout(c.code)).status, 503); }
      finally { Payment.create = original; }
      await counts(c._id, 0);
      assert.equal(await Order.countDocuments({ couponId: c._id }), 0);
      assert.equal((await Product.findById(product._id))!.stock, beforeStock);
      assert.equal((await Cart.findOne({ userId: users[0]._id }))!.items.length, 1);
      assert.equal((await checkout(c.code)).status, 201);
    });
    await t.test("10. Same key and payload replays without new usage", async () => {
      const c = await coupon(); await cart(); const key = `coupon-replay-${++seq}`;
      const first = await checkout(c.code, 0, key);
      const second = await checkout(c.code.toLowerCase(), 0, key);
      assert.equal(first.status, 201); assert.equal(second.status, 200);
      assert.equal(first.body.data._id, second.body.data._id); await counts(c._id, 1);
      assert.equal(await Payment.countDocuments({ orderId: first.body.data._id }), 1);
    });
    await t.test("11. Same key with changed coupon -> 409", async () => {
      const a = await coupon(), b = await coupon(); await cart(); const key = `coupon-changed-${++seq}`;
      assert.equal((await checkout(a.code, 0, key)).status, 201);
      assert.equal((await checkout(b.code, 0, key)).status, 409);
      await counts(a._id, 1); await counts(b._id, 0);
    });
    await t.test("12. Cancellation restores usage exactly once", async () => {
      const c = await coupon({ maxUses: 1 }); await cart(); const key = `coupon-cancel-${++seq}`;
      const created = await checkout(c.code, 0, key); assert.equal(created.status, 201);
      const path = `/orders/${created.body.data._id}/cancel`;
      const results = await Promise.all([api(path, 0, "PATCH"), api(path, 0, "PATCH")]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.equal((await api(path, 0, "PATCH")).status, 409); await counts(c._id, 0);
      assert.equal((await checkout(c.code, 0, key)).status, 200); await counts(c._id, 0);
      await cart(); assert.equal((await checkout(c.code)).status, 201); await counts(c._id, 1);
    });
    await t.test("13. Customer cannot access admin coupon APIs", async () => {
      const c = await coupon();
      for (const [path, method, body] of [["/admin/coupons", "GET", undefined],
        ["/admin/coupons", "POST", {}], [`/admin/coupons/${c._id}`, "PATCH", { isActive: false }]] as const) {
        assert.equal((await api(path, 0, method, body)).status, 403);
      }
      assert.equal((await Coupon.findById(c._id))!.isActive, true);
    });
    await t.test("14. FIXED discount cannot make payable amount negative", async () => {
      const c = await coupon({ value: 999999 }); await cart(); const result = await checkout(c.code);
      assert.equal(result.status, 201); assert.equal(result.body.data.subtotal, 100000);
      assert.equal(result.body.data.discountAmount, 100000); assert.equal(result.body.data.totalAmount, 0);
      assert.equal((await Payment.findOne({ orderId: result.body.data._id }))!.amount, 0);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await mongoose.disconnect(); await mongo.stop();
  }
});
