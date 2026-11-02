import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app';
import { User } from '../src/modules/auth/user.model';
import { Address } from '../src/modules/addresses/address.model';
import { Product } from '../src/modules/products/product.model';
import { Cart } from '../src/modules/cart/cart.model';
import { Order } from '../src/modules/orders/order.model';
import { Payment } from '../src/modules/payments/payment.model';

test('Module 13: HTTP API, real replica-set transactions and migration', { timeout: 300000 }, async t => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongo.getUri('module13_test');
  process.env.JWT_ACCESS_SECRET = 'module13-isolated-test-secret';
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const users = await User.create(['CUSTOMER', 'CUSTOMER', 'STAFF', 'ADMIN'].map((role, i) => ({ fullName: role, email: `m13-${i}@test.local`, passwordHash: 'unused', role })));
  const tokens = users.map(u => jwt.sign({ role: u.role }, process.env.JWT_ACCESS_SECRET!, { subject: u.id }));
  const addresses = await Address.create(users.slice(0, 2).map(u => ({ userId: u._id, fullName: 'Test', phone: '0901234567', province: 'HCM', ward: 'Test', detail: 'Test address' })));
  const api = async (path: string, user = 0, method = 'GET', body?: unknown, key?: string) => {
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, headers: { Authorization: `Bearer ${tokens[user]}`, 'Content-Type': 'application/json', ...(key === undefined ? {} : { 'Idempotency-Key': key }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() as any };
  };
  let sequence = 0;
  const fixture = async (stock = 10, quantity = 2, user = 0) => {
    const product = await Product.create({ name: 'Test', sku: `M13-${++sequence}`, price: 10000, stock });
    await Cart.findOneAndUpdate({ userId: users[user]._id }, { $set: { items: [{ productId: product._id, quantity }] }, $inc: { __v: 1 } }, { upsert: true });
    return product;
  };
  const checkout = (key: string, user = 0, addressId = addresses[user].id) => api('/orders', user, 'POST', { addressId }, key);
  const stockOf = async (id: unknown) => (await Product.findById(id))!.stock;
  let orderId: string;
  let product: any;
  try {
    await t.test('01 create exactly one Order and Payment', async () => {
      product = await fixture();
      const res = await checkout('module13-original-key');
      assert.equal(res.status, 201); orderId = res.body.data._id;
      assert.equal(await Order.countDocuments(), 1); assert.equal(await Payment.countDocuments({ orderId }), 1);
      assert.equal(await stockOf(product._id), 8);
    });
    await t.test('02 same key and payload replay', async () => {
      const res = await checkout('module13-original-key');
      assert.equal(res.status, 200); assert.equal(res.body.data._id, orderId); assert.equal(await stockOf(product._id), 8);
    });
    await t.test('03 same key different address rejected', async () => {
      assert.equal((await checkout('module13-original-key', 0, addresses[1].id)).status, 409);
      assert.equal(await Order.countDocuments(), 1);
    });
    await t.test('04 missing and invalid key rejected without writes', async () => {
      const before = [await Order.countDocuments(), await Payment.countDocuments()];
      for (const key of [undefined, 'short', 'invalid key with spaces', 'x'.repeat(129)]) assert.equal((await api('/orders', 0, 'POST', { addressId: addresses[0].id }, key)).status, 400);
      assert.deepEqual([await Order.countDocuments(), await Payment.countDocuments()], before);
    });
    await t.test('05 concurrent same key commits once', async () => {
      const p = await fixture();
      const results = await Promise.all([checkout('module13-concurrent-same'), checkout('module13-concurrent-same')]);
      assert.ok(results.every(r => [200, 201, 409].includes(r.status)));
      assert.equal(await Order.countDocuments({ checkoutKey: 'module13-concurrent-same' }), 1);
      assert.equal(await stockOf(p._id), 8);
      assert.equal((await checkout('module13-concurrent-same')).status, 200);
    });
    await t.test('06 different keys cannot checkout same cart; limited stock cannot oversell', async () => {
      const p = await fixture(); const before = await Order.countDocuments();
      const results = await Promise.all([checkout('module13-different-a'), checkout('module13-different-b')]);
      assert.equal(results.filter(r => r.status === 201).length, 1); assert.equal(await Order.countDocuments(), before + 1); assert.equal(await stockOf(p._id), 8);
      const limited = await fixture(2);
      await Cart.findOneAndUpdate({ userId: users[1]._id }, { $set: { items: [{ productId: limited._id, quantity: 2 }] } }, { upsert: true });
      const race = await Promise.all([checkout('module13-limited-a'), checkout('module13-limited-b', 1)]);
      assert.equal(race.filter(r => r.status === 201).length, 1); assert.equal(await stockOf(limited._id), 0);
    });
    await t.test('07 insufficient stock rolls back earlier decrements and creates nothing', async () => {
      const good = await fixture(); const bad = await Product.create({ name: 'No stock', sku: 'M13-empty', price: 1, stock: 0 });
      await Cart.updateOne({ userId: users[0]._id }, { $push: { items: { productId: bad._id, quantity: 1 } } });
      const before = [await Order.countDocuments(), await Payment.countDocuments()];
      assert.equal((await checkout('module13-insufficient')).status, 409);
      assert.deepEqual([await Order.countDocuments(), await Payment.countDocuments()], before); assert.equal(await stockOf(good._id), 10);
    });
    await t.test('08 customer reads own payment', async () => {
      const res = await api(`/payments/orders/${orderId}`); assert.equal(res.status, 200); assert.equal(res.body.data.orderId, orderId); assert.equal(res.body.data.amount, 20000);
    });
    await t.test('09 other customer gets 404 without payment data', async () => {
      const res = await api(`/payments/orders/${orderId}`, 1); assert.equal(res.status, 404); assert.equal(res.body.data, undefined);
    });
    await t.test('10 customer blocked from admin routes', async () => {
      for (const path of ['/admin/orders', '/admin/payments', `/admin/payments/orders/${orderId}`]) assert.equal((await api(path)).status, 403);
      assert.equal((await api(`/admin/payments/orders/${orderId}/confirm`, 0, 'PATCH')).status, 403);
    });
    const confirm = (id: string, user = 2) => api(`/admin/payments/orders/${id}/confirm`, user, 'PATCH');
    await t.test('11 COD before delivered rejected', async () => {
      assert.equal((await confirm(orderId)).status, 409); assert.equal((await Payment.findOne({ orderId }))!.status, 'PENDING');
    });
    await t.test('12 delivered COD records paidAt and confirmedBy', async () => {
      assert.equal((await api(`/admin/orders/${orderId}/status`, 2, 'PATCH', { status: 'CONFIRMED' })).status, 200);
      await Order.updateOne({ _id: orderId }, { $set: { status: 'DELIVERED' } });
      const res = await confirm(orderId); assert.equal(res.status, 200); assert.equal(res.body.data.status, 'PAID'); assert.ok(res.body.data.paidAt); assert.equal(res.body.data.confirmedBy, users[2].id);
    });
    await t.test('13 second confirmation preserves first audit', async () => {
      const before = await Payment.findOne({ orderId }).lean(); assert.equal((await confirm(orderId, 3)).status, 409);
      assert.deepEqual(await Payment.findOne({ orderId }).lean(), before);
    });
    await t.test('14 concurrent staff confirmation commits once', async () => {
      await fixture(); const id = (await checkout('module13-confirm-race')).body.data._id;
      await Order.updateOne({ _id: id }, { $set: { status: 'DELIVERED' } });
      const res = await Promise.all([confirm(id, 2), confirm(id, 3)]);
      assert.deepEqual(res.map(r => r.status).sort(), [200, 409]);
      const winner = res.find(r => r.status === 200)!;
      assert.equal(String((await Payment.findOne({ orderId: id }))!.confirmedBy), winner.body.data.confirmedBy);
    });
    await t.test('15 concurrent cancellation restores stock exactly once', async () => {
      const p = await fixture(); const id = (await checkout('module13-cancel-key')).body.data._id;
      const res = await Promise.all([api(`/orders/${id}/cancel`, 0, 'PATCH'), api(`/orders/${id}/cancel`, 0, 'PATCH')]);
      assert.deepEqual(res.map(r => r.status).sort(), [200, 409]); assert.equal(await stockOf(p._id), 10);
      assert.equal((await Order.findById(id))!.status, 'CANCELLED'); assert.equal((await Payment.findOne({ orderId: id }))!.status, 'CANCELLED');
    });
    await t.test('16 paid cancellation rejected without restoring stock or changing payment', async () => {
      const before = await Payment.findOne({ orderId }).lean(); const stock = await stockOf(product._id);
      assert.equal((await api(`/admin/orders/${orderId}/status`, 2, 'PATCH', { status: 'CANCELLED' })).status, 409);
      assert.equal(await stockOf(product._id), stock); assert.deepEqual(await Payment.findOne({ orderId }).lean(), before);
    });
    await t.test('17 mismatched amount and owner rejected', async () => {
      await fixture(); const id = (await checkout('module13-mismatch')).body.data._id;
      await Order.updateOne({ _id: id }, { $set: { status: 'DELIVERED' } });
      const payment = (await Payment.findOne({ orderId: id }))!;
      await Payment.collection.updateOne({ _id: payment._id }, { $set: { amount: 1 } }); assert.equal((await confirm(id)).status, 409);
      await Payment.collection.updateOne({ _id: payment._id }, { $set: { amount: payment.amount, userId: users[1]._id } }); assert.equal((await confirm(id)).status, 409);
      await Payment.collection.updateOne({ _id: payment._id }, { $set: { userId: users[0]._id } });
      assert.equal((await Payment.findById(payment._id))!.status, 'PENDING');
    });
    let legacyId: mongoose.Types.ObjectId;
    const migrate = async (apply: boolean) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'src/scripts/migrate-payments.ts', ...(apply ? ['--apply'] : [])], { env: { ...process.env, MONGODB_URI: uri }, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
      const [code] = await once(child, 'exit'); assert.equal(code, 0, output); return output;
    };
    await t.test('18 migration dry run writes nothing; apply and rerun do not duplicate', async () => {
      const original = (await Order.findById(orderId).lean())!;
      const { _id, checkoutKey, checkoutRequestHash, ...data } = original;
      const legacy = await Order.create({ ...data, status: 'DELIVERED' }); legacyId = legacy._id;
      const before = await Payment.countDocuments(); await migrate(false); assert.equal(await Payment.countDocuments(), before);
      await migrate(true); assert.equal(await Payment.countDocuments(), before + 1);
      const first = await Payment.findOne({ orderId: legacyId }).lean(); await migrate(true);
      assert.equal(await Payment.countDocuments(), before + 1); assert.deepEqual(await Payment.findOne({ orderId: legacyId }).lean(), first);
    });
    await t.test('19 legacy delivered order stays pending and requires reconciliation', async () => {
      const p = (await Payment.findOne({ orderId: legacyId }))!; assert.equal(p.status, 'PENDING'); assert.equal(p.paidAt, null); assert.equal(p.confirmedBy, null);
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    await mongoose.disconnect(); await mongo.stop();
  }
});
