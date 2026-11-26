import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import app from "../src/app";
import { User } from "../src/modules/auth/user.model";
import { Category } from "../src/modules/categories/category.model";
import { Product } from "../src/modules/products/product.model";

test("Catalog and cart regression scenarios", { timeout: 120000 }, async t => {
  process.env.JWT_ACCESS_SECRET = "catalog-cart-isolated-regression-secret";
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  let server: ReturnType<typeof app.listen> | undefined;
  try {
    await mongoose.connect(mongo.getUri("catalog_cart_regressions"));
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    const [customer, staff] = await User.create(["CUSTOMER", "STAFF"].map((role, index) => ({
      fullName: role, email: `catalog-${index}@test.local`, passwordHash: "unused", role,
    })));
    const token = (user: typeof customer) => jwt.sign({ role: user.role }, process.env.JWT_ACCESS_SECRET!, { subject: user.id });
    const customerToken = token(customer), staffToken = token(staff);
    const category = await Category.create({ _id: "abc123abc123abc123abc123", name: "Active", slug: "active" });
    const product = await Product.create({ _id: "abcdefabcdefabcdefabcdef", name: "Cart product", sku: "CART-REG", price: 10000, stock: 5, categoryId: category._id });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    const api = async (path: string, method = "GET", body?: unknown, accessToken?: string) => {
      const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json() as any };
    };

    await t.test("public category filters treat ObjectId casing equally", async () => {
      const response = await api(`/products?categoryId=${category.id.toUpperCase()}`);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data.map((item: any) => item._id), [product.id]);
    });
    await t.test("pagination rejects an unsafe computed offset", async () => {
      assert.equal((await api(`/products?page=${Number.MAX_SAFE_INTEGER}&limit=100`)).status, 400);
    });
    await t.test("product creation validates description and accepts initial stock", async () => {
      const input = { name: "Created", sku: "CREATE-REG", price: 1000, stock: 7 };
      for (const invalid of [{ description: {} }, { stock: -1 }, { stock: 1.5 }, { stock: "7" }]) {
        assert.equal((await api("/products", "POST", { ...input, ...invalid }, staffToken)).status, 400);
      }
      const response = await api("/products", "POST", input, staffToken);
      assert.equal(response.status, 201);
      assert.equal(response.body.data.stock, 7);
    });
    await t.test("cart adds, updates and removes uppercase IDs without duplicate lines", async () => {
      assert.equal((await api("/cart/items", "POST", { productId: product.id, quantity: 1 }, customerToken)).status, 200);
      assert.equal((await api("/cart/items", "POST", { productId: product.id.toUpperCase(), quantity: 1 }, customerToken)).status, 200);
      const cart = (await api("/cart", "GET", undefined, customerToken)).body.data;
      assert.equal(cart.items.length, 1);
      assert.equal(cart.items[0].quantity, 2);
      assert.equal(cart.totalAmount, 20000);
      assert.equal((await api(`/cart/items/${product.id.toUpperCase()}`, "PATCH", { quantity: 3 }, customerToken)).status, 200);
      assert.equal((await api(`/cart/items/${product.id.toUpperCase()}`, "DELETE", undefined, customerToken)).status, 200);
    });
    await t.test("cart rejects new or combined quantities above stock", async () => {
      assert.equal((await api("/cart/items", "POST", { productId: product.id, quantity: 6 }, customerToken)).status, 409);
      assert.equal((await api("/cart/items", "POST", { productId: product.id, quantity: 3 }, customerToken)).status, 200);
      assert.equal((await api("/cart/items", "POST", { productId: product.id, quantity: 3 }, customerToken)).status, 409);
      assert.equal((await api(`/cart/items/${product.id}`, "PATCH", { quantity: 6 }, customerToken)).status, 409);
      assert.equal((await api("/cart", "GET", undefined, customerToken)).body.data.items[0].quantity, 3);
    });
    await t.test("inventory changes make the cart unavailable until quantity is corrected", async () => {
      await Product.updateOne({ _id: product._id }, { $set: { stock: 2 } });
      const cart = (await api("/cart", "GET", undefined, customerToken)).body.data;
      assert.equal(cart.unavailableCount, 1);
      assert.equal(cart.totalAmount, 0);
      assert.equal(cart.items[0].stock, 2);
      assert.equal(cart.items[0].available, false);
      assert.equal(cart.items[0].unavailableReason, "INSUFFICIENT_STOCK");
      assert.equal((await api(`/cart/items/${product.id}`, "PATCH", { quantity: 2 }, customerToken)).status, 200);
      const corrected = (await api("/cart", "GET", undefined, customerToken)).body.data;
      assert.equal(corrected.unavailableCount, 0);
      assert.equal(corrected.totalAmount, 20000);
      await Category.updateOne({ _id: category._id }, { $set: { isActive: false } });
      assert.equal((await api("/cart", "GET", undefined, customerToken)).body.data.items[0].unavailableReason, "UNAVAILABLE");
      assert.equal((await api(`/cart/items/${product.id}`, "PATCH", { quantity: 1 }, customerToken)).status, 409);
      await Category.updateOne({ _id: category._id }, { $set: { isActive: true } });
    });
    await t.test("editing a product can clear its category", async () => {
      const response = await api(`/products/${product.id}`, "PATCH", { categoryId: null }, staffToken);
      assert.equal(response.status, 200);
      assert.equal(response.body.data.categoryId, null);
      assert.equal((await api(`/products/${product.id}`)).status, 200);
      assert.equal((await api(`/products/${product.id}`, "PATCH", { categoryId: "invalid" }, staffToken)).status, 400);
    });
    await t.test("orphaned category products are hidden consistently from detail and listing", async () => {
      const orphan = await Product.create({ name: "Orphan", sku: "ORPHAN-REG", price: 1, categoryId: new mongoose.Types.ObjectId() });
      assert.equal((await api(`/products/${orphan.id}`)).status, 404);
      assert.ok(!(await api("/products")).body.data.some((item: any) => item._id === orphan.id));
    });
    await t.test("price is the primary sort and pagination is stable for equal prices", async () => {
      await Product.create([
        { _id: "000000000000000000000001", name: "QA sort first", sku: "SORT-1", price: 300, createdAt: new Date("2026-01-01") },
        { _id: "000000000000000000000002", name: "QA sort second", sku: "SORT-2", price: 100, createdAt: new Date("2026-03-01") },
        { _id: "000000000000000000000003", name: "QA sort third", sku: "SORT-3", price: 200, createdAt: new Date("2026-02-01") },
        { _id: "000000000000000000000004", name: "QA sort fourth", sku: "SORT-4", price: 100, createdAt: new Date("2026-03-01") },
      ]);
      for (const [sort, expected] of [["price_asc", [100, 100, 200, 300]], ["price_desc", [300, 200, 100, 100]]] as const) {
        const publicResponse = await api(`/products?search=QA%20sort&sort=${sort}`);
        assert.deepEqual(publicResponse.body.data.map((item: any) => item.price), expected);
        const adminResponse = await api(`/admin/products?search=QA%20sort&sort=${sort}`, "GET", undefined, staffToken);
        assert.deepEqual(adminResponse.body.data.map((item: any) => item.price), expected);
      }
      const first = (await api("/products?search=QA%20sort&sort=price_asc&limit=2&page=1")).body.data;
      const second = (await api("/products?search=QA%20sort&sort=price_asc&limit=2&page=2")).body.data;
      assert.deepEqual([...first, ...second].map((item: any) => item.sku), ["SORT-4", "SORT-2", "SORT-3", "SORT-1"]);
    });
    await t.test("newest sorting uses creation time before the ObjectId tie-breaker", async () => {
      const response = await api("/products?search=QA%20sort");
      assert.deepEqual(response.body.data.map((item: any) => item.sku), ["SORT-4", "SORT-2", "SORT-3", "SORT-1"]);
    });
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  }
});
