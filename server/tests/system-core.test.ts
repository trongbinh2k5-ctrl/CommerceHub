import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app';
import { User } from '../src/modules/auth/user.model';
import { Product } from '../src/modules/products/product.model';

test('System core: authentication, catalog, addresses, cart and HTTP validation', { timeout: 120000 }, async t => {
  process.env.JWT_ACCESS_SECRET = 'isolated-system-core-secret';
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  let server: ReturnType<typeof app.listen> | undefined;
  try {
    await mongoose.connect(mongo.getUri('system_core_test'));
    await Promise.all(Object.values(mongoose.models).map(m => m.init()));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const api = async (path: string, method = 'GET', body?: unknown, token?: string, raw = false) => {
      const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : raw ? String(body) : JSON.stringify(body) });
      const text = await r.text();
      let data: any; try { data = JSON.parse(text); } catch { data = text; }
      return { status: r.status, body: data };
    };
    const credentials = { fullName: 'QA Customer', email: 'core@test.local', password: 'Testing123!' };
    let token = '', otherToken = '', categoryId = '', productId = '', addressId = '';
    const staff = await User.create({ fullName: 'QA Staff', email: 'staff@core.local', passwordHash: 'unused', role: 'STAFF' });
    const staffToken = jwt.sign({ role: staff.role }, process.env.JWT_ACCESS_SECRET!, { subject: staff.id });
    await t.test('health and anonymous access restrictions', async () => {
      assert.equal((await api('/health')).status, 200);
      for (const p of ['/api/auth/me', '/api/cart', '/api/addresses', '/api/orders', '/api/admin/products', '/api/admin/categories']) assert.equal((await api(p)).status, 401, p);
    });
    await t.test('registration validates input and prevents privilege injection / duplicate emails', async () => {
      assert.equal((await api('/api/auth/register', 'POST', {})).status, 400);
      const r = await api('/api/auth/register', 'POST', { ...credentials, role: 'ADMIN' });
      assert.equal(r.status, 201); assert.equal(r.body.data.role, 'CUSTOMER'); assert.equal(r.body.data.passwordHash, undefined);
      assert.equal((await api('/api/auth/register', 'POST', credentials)).status, 409);
    });
    await t.test('login, wrong password, invalid tokens and customer authorization', async () => {
      assert.equal((await api('/api/auth/login', 'POST', { ...credentials, password: 'wrong' })).status, 401);
      const r = await api('/api/auth/login', 'POST', credentials);
      assert.equal(r.status, 200); token = r.body.data.accessToken;
      assert.equal((await api('/api/auth/me', 'GET', undefined, token)).status, 200);
      assert.equal((await api('/api/auth/me', 'GET', undefined, 'invalid')).status, 401);
      assert.equal((await api('/api/admin/categories', 'GET', undefined, token)).status, 403);
      await api('/api/auth/register', 'POST', { ...credentials, email: 'other@core.local' });
      otherToken = (await api('/api/auth/login', 'POST', { ...credentials, email: 'other@core.local' })).body.data.accessToken;
    });
    await t.test('category create, duplicate and public listing', async () => {
      const input = { name: 'QA Category', slug: 'qa-category' };
      const r = await api('/api/admin/categories', 'POST', input, staffToken);
      assert.equal(r.status, 201); categoryId = r.body.data._id;
      assert.equal((await api('/api/admin/categories', 'POST', input, staffToken)).status, 409);
      assert.equal((await api('/api/categories')).status, 200);
    });
    await t.test('product create, detail, invalid price and query validation', async () => {
      const input = { name: 'QA Product', sku: 'QA-CORE', price: 10000, categoryId };
      const r = await api('/api/products', 'POST', input, staffToken);
      assert.equal(r.status, 201); productId = r.body.data._id;
      assert.equal((await api(`/api/products/${productId}`)).status, 200);
      assert.equal((await api('/api/products', 'POST', { ...input, price: -1 }, staffToken)).status, 400);
      assert.equal((await api('/api/products?page=abc')).status, 400);
      await Product.updateOne({ _id: productId }, { $set: { stock: 10 } });
    });
    await t.test('address CRUD and cross-account isolation', async () => {
      const input = { fullName: 'QA', phone: '0901234567', province: 'HCM', ward: 'Ward', detail: 'QA address' };
      const r = await api('/api/addresses', 'POST', input, token);
      assert.equal(r.status, 201); addressId = r.body.data._id;
      assert.equal((await api(`/api/addresses/${addressId}`, 'PATCH', { detail: 'Changed' }, otherToken)).status, 404);
      assert.equal((await api(`/api/addresses/${addressId}`, 'PATCH', { detail: 'Changed' }, token)).status, 200);
      assert.equal((await api('/api/addresses', 'POST', { ...input, phone: 'bad' }, token)).status, 400);
    });
    await t.test('cart add, quantity validation, update, delete and clear', async () => {
      assert.equal((await api('/api/cart/items', 'POST', { productId, quantity: 2 }, token)).status, 200);
      assert.equal((await api('/api/cart/items', 'POST', { productId, quantity: -1 }, token)).status, 400);
      assert.equal((await api(`/api/cart/items/${productId}`, 'PATCH', { quantity: 3 }, token)).status, 200);
      assert.equal((await api('/api/cart', 'GET', undefined, token)).status, 200);
      assert.equal((await api(`/api/cart/items/${productId}`, 'DELETE', undefined, token)).status, 200);
      assert.equal((await api('/api/cart', 'DELETE', undefined, token)).status, 200);
      assert.equal((await api(`/api/addresses/${addressId}`, 'DELETE', undefined, token)).status, 200);
    });
    await t.test('malformed JSON returns client error', async () => {
      assert.equal((await api('/api/auth/login', 'POST', '{broken', undefined, true)).status, 400);
    });
    await t.test('disabled account cannot reuse access token', async () => {
      await User.updateOne({ email: credentials.email }, { $set: { isActive: false } });
      assert.equal((await api('/api/auth/me', 'GET', undefined, token)).status, 401);
    });
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(e => e ? reject(e) : resolve()));
    await mongoose.disconnect();
    await mongo.stop();
  }
});
