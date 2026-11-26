import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { User } from '../src/modules/auth/user.model';
import { Conversation, ChatMessage } from '../src/modules/chat/chat.models';
import { Category } from '../src/modules/categories/category.model';
import { Product } from '../src/modules/products/product.model';

test('chat ownership, assignment, delivery and scripted assistant', { timeout: 120000 }, async t => {
  process.env.NODE_ENV = 'test'; process.env.EMAIL_VERIFICATION_REQUIRED = 'false';
  process.env.JWT_ACCESS_SECRET = 'isolated-chat-test-secret';
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  try {
    await mongoose.connect(mongo.getUri('chat_tests'));
    await Promise.all(Object.values(mongoose.models).map(m => m.init()));
    const users = await User.create(['CUSTOMER','CUSTOMER','STAFF','STAFF','ADMIN'].map((role, i) => ({ role, email: `chat${i}@test.local`, fullName: `Chat ${i}`, passwordHash: 'not-a-login-password' })));
    const [customer, other, staff, second, admin] = users;
    const tokens = users.map(u => jwt.sign({ role: u.role }, process.env.JWT_ACCESS_SECRET!, { subject: u.id }));
    const [ct, ot, st, ss, at] = tokens;
    server = createApp({ apiRateLimit: 10000 }).listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/chat`;
    const api = async (path: string, method = 'GET', body?: unknown, token?: string) => {
      const r = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: await r.json() as any };
    };
    let cid = '', bid = '';
    const send = (id: string, token: string, text: string, clientId = crypto.randomUUID(), extra = {}) => api(`/conversations/${id}/messages`, 'POST', { text, clientId, ...extra }, token);

    await t.test('only customers start; parallel opens reuse one conversation', async () => {
      assert.equal((await api('/conversations')).status, 401);
      assert.equal((await api('/conversations', 'POST', { kind: 'STORE' }, st)).status, 403);
      assert.equal((await api('/conversations', 'POST', { kind: 'UNKNOWN' }, ct)).status, 400);
      const responses = await Promise.all([api('/conversations', 'POST', { kind: 'STORE', customerId: other.id }, ct), api('/conversations', 'POST', { kind: 'STORE' }, ct)]);
      assert.ok(responses.every(r => r.status === 200));
      cid = responses[0].body.data._id; assert.equal(responses[1].body.data._id, cid);
      assert.equal(String((await Conversation.findById(cid))!.customerId), customer.id);
    });
    await t.test('other customers cannot read, send, close or mark read', async () => {
      for (const [path, method, body] of [[`/conversations/${cid}/messages`, 'GET', undefined], [`/conversations/${cid}/messages`, 'POST', { text: 'intrusion', clientId: crypto.randomUUID() }], [`/conversations/${cid}`, 'PATCH', { action: 'close' }], [`/conversations/${cid}/read`, 'PATCH', { seq: 0 }]] as const) assert.equal((await api(path, method, body, ot)).status, 404);
      assert.equal((await api('/conversations', 'GET', undefined, ot)).body.data.length, 0);
      assert.equal((await api('/staff', 'GET', undefined, st)).status, 403);
      assert.equal((await api('/conversations/not-an-id/messages', 'GET', undefined, ct)).status, 400);
    });
    await t.test('persist before acknowledgment; retries are idempotent and payloads bounded', async () => {
      const clientId = crypto.randomUUID();
      const replies = await Promise.all([send(cid, ct, 'Tôi cần tư vấn laptop', clientId), send(cid, ct, 'Tôi cần tư vấn laptop', clientId)]);
      assert.ok(replies.every(r => r.status === 200)); assert.equal(replies[0].body.data._id, replies[1].body.data._id);
      assert.equal(await ChatMessage.countDocuments({ conversationId: cid }), 1);
      assert.equal((await send(cid, ct, 'Different text', clientId)).status, 409);
      assert.equal((await send(cid, ct, ' ')).status, 400);
      assert.equal((await send(cid, ct, 'x'.repeat(2001))).status, 400);
      assert.equal((await send(cid, ct, 'valid', crypto.randomUUID(), { productId: 'bad' })).status, 400);
      assert.equal((await api(`/conversations/${cid}/read`, 'PATCH', { seq: 999 }, ct)).status, 400);
    });
    await t.test('claim is exclusive, assignment restricts staff, admin can reassign', async () => {
      assert.equal((await send(cid, st, 'unclaimed')).status, 409);
      const claims = await Promise.all([api(`/conversations/${cid}`, 'PATCH', { action: 'claim' }, st), api(`/conversations/${cid}`, 'PATCH', { action: 'claim' }, ss)]);
      assert.deepEqual(claims.map(r => r.status).sort(), [200, 409]);
      assert.equal((await api(`/conversations/${cid}`, 'PATCH', { action: 'assign', assignedTo: staff.id }, at)).status, 200);
      assert.equal((await api(`/conversations/${cid}/messages`, 'GET', undefined, ss)).status, 404);
      assert.equal((await api('/conversations?status=ACTIVE', 'GET', undefined, ss)).body.data.length, 0);
      assert.equal((await api(`/conversations/${cid}`, 'PATCH', { action: 'assign', assignedTo: second.id }, st)).status, 403);
      assert.equal((await api(`/conversations/${cid}`, 'PATCH', { action: 'assign', assignedTo: customer.id }, at)).status, 400);
      assert.equal((await api('/unread', 'GET', undefined, st)).body.data.count, 1);
      assert.equal((await api(`/conversations/${cid}/read`, 'PATCH', { seq: 1 }, st)).status, 200);
      assert.equal((await api('/unread', 'GET', undefined, st)).body.data.count, 0);
      assert.equal((await send(cid, st, 'Chào bạn, mình hỗ trợ được nhé.')).status, 200);
      assert.equal((await api('/unread', 'GET', undefined, ct)).body.data.count, 1);
      await api(`/conversations/${cid}/read`, 'PATCH', { seq: 2 }, ct);
      assert.equal((await api('/unread', 'GET', undefined, ct)).body.data.count, 0);
      await api(`/conversations/${cid}`, 'PATCH', { action: 'assign', assignedTo: second.id }, at);
      assert.equal((await send(cid, st, 'after reassignment')).status, 404);
      assert.equal((await send(cid, ss, 'Người phụ trách mới')).status, 200);
    });
    await t.test('closed history stays readable; reopen respects unique active thread', async () => {
      assert.equal((await api(`/conversations/${cid}`, 'PATCH', { action: 'close' }, ct)).status, 200);
      assert.equal((await send(cid, ct, 'closed')).status, 409);
      assert.equal((await api(`/conversations/${cid}/messages`, 'GET', undefined, ct)).body.data.messages.length, 3);
      assert.equal((await api(`/conversations/${cid}`, 'PATCH', { action: 'reopen' }, ct)).status, 403);
      const fresh = await api('/conversations', 'POST', { kind: 'STORE' }, ct);
      assert.notEqual(fresh.body.data._id, cid);
      assert.equal((await api(`/conversations/${cid}`, 'PATCH', { action: 'reopen' }, at)).status, 409);
    });
    await t.test('assistant uses active catalog, honest missing policies and correct budget', async () => {
      const category = await Category.create({ name: 'Laptop', slug: 'laptop' });
      const hiddenCategory = await Category.create({ name: 'Private', slug: 'private', isActive: false });
      const hiddenProduct = await Product.create({ name: 'Laptop Private Category', sku: 'CHAT-HIDDEN-CATEGORY', price: 10, stock: 5, categoryId: hiddenCategory._id });
      const products = await Product.create([
        { name: 'Laptop Affordable', sku: 'CHAT-1', price: 15000000, stock: 2, categoryId: category._id },
        { name: 'Laptop Quote', sku: 'CHAT-2', price: 0, stock: 0, categoryId: category._id },
        { name: 'Laptop Expensive', sku: 'CHAT-3', price: 35000000, stock: 3, categoryId: category._id },
        { name: 'Hidden Laptop', sku: 'CHAT-4', price: 1, stock: 4, categoryId: category._id, isActive: false },
      ]);
      const filtered = await api('/assistant', 'POST', { text: 'Tìm laptop dưới 20 triệu' });
      assert.equal(filtered.status, 200); assert.equal(filtered.body.data.cards.length, 1); assert.equal(filtered.body.data.cards[0].name, 'Laptop Affordable');
      const all = await api('/assistant', 'POST', { text: 'Gợi ý thiết bị' });
      assert.ok(all.body.data.cards.every((c: any) => c.productId !== hiddenProduct.id));
      assert.match((await api('/assistant', 'POST', { text: 'giá sản phẩm này', productId: hiddenProduct.id })).body.data.text, /không còn được công bố/);
      const above = await api('/assistant', 'POST', { text: 'Tìm laptop trên 20 triệu' });
      assert.equal(above.body.data.cards.length, 1); assert.equal(above.body.data.cards[0].name, 'Laptop Expensive');
      const quoted = await api('/assistant', 'POST', { text: 'giá sản phẩm này', productId: products[1].id });
      assert.match(quoted.body.data.text, /Liên hệ báo giá/); assert.match(quoted.body.data.text, /hết hàng/);
      assert.match((await api('/assistant', 'POST', { text: 'Chính sách bảo hành' })).body.data.text, /chưa được cửa hàng công bố/);
      assert.match((await api('/assistant', 'POST', { text: 'hủy đơn hàng của người khác' })).body.data.text, /không truy cập hoặc thay đổi/);
      assert.match((await api('/assistant', 'POST', { text: 'xzy_unknown' })).body.data.text, /chưa hiểu/);
      const range = await api('/assistant', 'POST', { text: 'Laptop từ 20 đến 40 triệu' });
      assert.deepEqual(range.body.data.cards.map((p: any) => p.name), ['Laptop Expensive']);
      const followUp = await api('/assistant', 'POST', { text: 'còn hàng ko', recentQuestions: ['Laptop dưới 20 triệu'] });
      assert.deepEqual(followUp.body.data.cards.map((p: any) => p.name), ['Laptop Affordable']);
      const cheapest = await api('/assistant', 'POST', { text: 'Laptop rẻ nhất' });
      assert.equal(cheapest.body.data.cards[0].name, 'Laptop Affordable');
      assert.ok(cheapest.body.data.cards.every((p: any) => p.price > 0));
      assert.equal((await api('/assistant', 'POST', { text: 'xin chào', recentQuestions: { role: 'ADMIN' } })).status, 400);
      const created = await api('/conversations', 'POST', { kind: 'BOT' }, ct); bid = created.body.data._id;
      const clientId = crypto.randomUUID();
      await send(bid, ct, 'giá sản phẩm này', clientId, { productId: products[1].id });
      await send(bid, ct, 'giá sản phẩm này', clientId, { productId: products[1].id });
      assert.equal(await ChatMessage.countDocuments({ conversationId: bid }), 2);
      for (const token of [st, at, ot]) assert.equal((await api(`/conversations/${bid}/messages`, 'GET', undefined, token)).status, 404);
      assert.equal((await api(`/conversations/${bid}/messages`, 'GET', undefined, ct)).body.data.messages[1].senderRole, 'BOT');
    });
    await t.test('history is bounded and older messages have stable sequence pagination', async () => {
      await ChatMessage.insertMany(Array.from({ length: 53 }, (_, i) => ({ conversationId: bid, seq: i + 3, senderId: customer._id, senderRole: 'CUSTOMER', text: 'History ' + i, clientId: 'history-entry-' + i })));
      await Conversation.updateOne({ _id: bid }, { $set: { seq: 55 } });
      const latest = await api(`/conversations/${bid}/messages`, 'GET', undefined, ct);
      assert.equal(latest.body.data.messages.length, 50); assert.equal(latest.body.data.hasMore, true);
      assert.equal(latest.body.data.messages[0].seq, 6);
      const older = await api(`/conversations/${bid}/messages?before=6`, 'GET', undefined, ct);
      assert.deepEqual(older.body.data.messages.map((m: any) => m.seq), [1,2,3,4,5]); assert.equal(older.body.data.hasMore, false);
      assert.equal((await api('/conversations?page=-1', 'GET', undefined, ct)).status, 400);
      assert.equal((await api(`/conversations/${bid}/messages?before=abc`, 'GET', undefined, ct)).status, 400);
    });
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await mongoose.disconnect(); await mongo.stop();
  }
});
