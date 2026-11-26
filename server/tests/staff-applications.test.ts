import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import app from '../src/app';
import { User } from '../src/modules/auth/user.model';
import { StaffApplication } from '../src/modules/auth/staff-application.model';
import { LoginSession, AccountChallenge } from '../src/modules/auth/account.models';
import { AuditEvent } from '../src/modules/operations/audit.service';
import { Notification } from '../src/modules/operations/operations.models';

test('Customer staff applications require admin review and preserve account security', { timeout: 120000 }, async t => {
  process.env.NODE_ENV = 'test'; process.env.EMAIL_VERIFICATION_REQUIRED = 'false';
  process.env.JWT_ACCESS_SECRET = 'isolated-staff-application-test-secret';
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  let server: ReturnType<typeof app.listen> | undefined;
  try {
    await mongoose.connect(mongo.getUri('staff_applications'));
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    const password = 'OriginalAccount!2026', passwordHash = await bcrypt.hash(password, 4);
    const users = await User.create(['ADMIN', 'STAFF', 'CUSTOMER', 'CUSTOMER', 'CUSTOMER'].map((role, i) => ({ fullName: 'Applicant ' + i, email: `applicant-${i}@test.local`, role, passwordHash })));
    const [admin, staff, customer, other, rollbackUser] = users;
    const bearer = (user: any) => jwt.sign({ role: user.role }, process.env.JWT_ACCESS_SECRET!, { subject: user.id });
    const at = bearer(admin), st = bearer(staff), ct = bearer(customer), ot = bearer(other);
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    const api = async (path: string, method = 'GET', body?: unknown, token?: string) => {
      const r = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, body: await r.json() as any };
    };
    const input = { phone: '0901234567', position: 'Tư vấn bán hàng', message: 'Tôi có kinh nghiệm tư vấn thiết bị và có thể làm việc cuối tuần.' };
    let firstId = '', approvedId = '', access = '';

    await t.test('only customers submit and only admins list or review applications', async () => {
      for (const token of [undefined, st, at]) assert.equal((await api('/staff-applications', 'POST', input, token)).status, token ? 403 : 401);
      for (const token of [undefined, st, ct]) {
        assert.equal((await api('/admin/staff-applications', 'GET', undefined, token)).status, token ? 403 : 401);
        assert.equal((await api('/admin/staff-applications/' + customer.id, 'PATCH', { status: 'APPROVED' }, token)).status, token ? 403 : 401);
      }
      assert.equal((await api('/staff-applications', 'POST', { ...input, role: 'ADMIN', userId: other.id }, ct)).status, 400);
      assert.equal((await api('/staff-applications', 'POST', { ...input, phone: 'wrong', message: 'short' }, ct)).status, 400);
      assert.equal(await StaffApplication.countDocuments(), 0);
    });
    await t.test('concurrent duplicate submissions create one pending application without elevating the customer', async () => {
      const results = await Promise.all([api('/staff-applications', 'POST', input, ct), api('/staff-applications', 'POST', input, ct)]);
      assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
      const item = results.find(r => r.status === 201)!.body.data;
      firstId = item._id; assert.equal(item.userId, customer.id); assert.equal(item.fullName, customer.fullName); assert.equal(item.status, 'PENDING');
      assert.equal((await User.findById(customer.id))!.role, 'CUSTOMER');
      assert.equal((await api('/auth/me', 'GET', undefined, ct)).status, 200);
      assert.equal((await api('/staff-applications', 'GET', undefined, ot)).body.data.length, 0);
      assert.equal((await api('/admin/staff-applications?status=PENDING', 'GET', undefined, at)).body.data.length, 1);
      assert.equal(await AuditEvent.countDocuments({ action: 'STAFF_APPLICATION_SUBMITTED' }), 1);
    });
    await t.test('admin rejection needs a reason and is visible only to the applicant', async () => {
      assert.equal((await api('/admin/staff-applications/' + firstId, 'PATCH', { status: 'REJECTED' }, at)).status, 400);
      assert.equal((await api('/admin/staff-applications/' + firstId, 'PATCH', { status: 'ADMIN' }, at)).status, 400);
      const response = 'Hiện tại cửa hàng chưa có vị trí phù hợp.';
      assert.equal((await api('/admin/staff-applications/' + firstId, 'PATCH', { status: 'REJECTED', response }, at)).status, 200);
      const own = await api('/staff-applications', 'GET', undefined, ct);
      assert.equal(own.body.data[0].response, response); assert.equal(own.body.data[0].status, 'REJECTED');
      assert.equal((await User.findById(customer.id))!.role, 'CUSTOMER');
      assert.equal(await Notification.countDocuments({ userId: customer.id }), 1);
      assert.equal((await api('/admin/staff-applications/' + firstId, 'PATCH', { status: 'APPROVED' }, at)).status, 409);
      assert.equal((await api('/staff-applications?page=0', 'GET', undefined, ct)).status, 400);
      assert.equal((await api('/admin/staff-applications?status=INVALID', 'GET', undefined, at)).status, 400);
    });
    await t.test('a rejected customer may reapply and approval revokes sessions and challenges exactly once', async () => {
      const submitted = await api('/staff-applications', 'POST', input, ct); assert.equal(submitted.status, 201); approvedId = submitted.body.data._id;
      const login = await api('/auth/login', 'POST', { email: customer.email, password }); access = login.body.data.accessToken;
      await AccountChallenge.create({ userId: customer._id, purpose: 'RESET_PASSWORD', tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60000) });
      const results = await Promise.all([api('/admin/staff-applications/' + approvedId, 'PATCH', { status: 'APPROVED', response: 'Chào mừng bạn tham gia đội ngũ.' }, at), api('/admin/staff-applications/' + approvedId, 'PATCH', { status: 'APPROVED' }, at)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      const user = await User.findById(customer.id); assert.equal(user!.role, 'STAFF'); assert.equal(user!.mustChangePassword, true); assert.equal(user!.authVersion, 1);
      assert.equal(await LoginSession.countDocuments({ userId: customer.id }), 0); assert.equal(await AccountChallenge.countDocuments({ userId: customer.id }), 0);
      assert.equal((await api('/auth/me', 'GET', undefined, access)).status, 401); assert.equal((await api('/auth/me', 'GET', undefined, ct)).status, 401);
      assert.equal(await Notification.countDocuments({ dedupeKey: `staff-application:${approvedId}:reviewed` }), 1);
      assert.equal(await AuditEvent.countDocuments({ action: 'ACCOUNT_UPDATED', targetId: customer.id }), 1);
    });
    await t.test('approved users keep their credentials but must set a ten-character password before working', async () => {
      const login = await api('/auth/login', 'POST', { email: customer.email, password }); assert.equal(login.status, 200);
      assert.equal(login.body.data.user.id, customer.id); assert.equal(login.body.data.user.mustChangePassword, true);
      const token = login.body.data.accessToken;
      assert.equal((await api('/admin/orders', 'GET', undefined, token)).body.code, 'PASSWORD_CHANGE_REQUIRED');
      assert.equal((await api('/auth/change-password', 'POST', { currentPassword: password, password: 'NewPass123' }, token)).status, 200);
      const active = await api('/auth/login', 'POST', { email: customer.email, password: 'NewPass123' });
      assert.equal((await api('/admin/orders', 'GET', undefined, active.body.data.accessToken)).status, 200);
      assert.equal((await api('/admin/staff-applications', 'GET', undefined, active.body.data.accessToken)).status, 403);
    });
    await t.test('locked or already-promoted applicants cannot be approved', async () => {
      const item = await StaffApplication.create({ ...input, userId: other._id, fullName: other.fullName, email: other.email });
      await User.updateOne({ _id: other._id }, { $set: { isActive: false } });
      assert.equal((await api('/admin/staff-applications/' + item.id, 'PATCH', { status: 'APPROVED' }, at)).status, 409);
      assert.equal((await StaffApplication.findById(item.id))!.status, 'PENDING');
      await User.updateOne({ _id: other._id }, { $set: { isActive: true, role: 'STAFF' } });
      assert.equal((await api('/admin/staff-applications/' + item.id, 'PATCH', { status: 'APPROVED' }, at)).status, 409);
      assert.equal((await StaffApplication.findById(item.id))!.status, 'PENDING');
    });
    await t.test('audit failure rolls back approval, permission changes and notifications', async () => {
      const item = await StaffApplication.create({ ...input, userId: rollbackUser._id, fullName: rollbackUser.fullName, email: rollbackUser.email });
      const create = AuditEvent.create;
      try {
        (AuditEvent as any).create = async () => { throw new Error('Simulated audit failure'); };
        assert.equal((await api('/admin/staff-applications/' + item.id, 'PATCH', { status: 'APPROVED' }, at)).status, 500);
      } finally { AuditEvent.create = create; }
      assert.equal((await User.findById(rollbackUser.id))!.role, 'CUSTOMER');
      assert.equal((await StaffApplication.findById(item.id))!.status, 'PENDING');
      assert.equal(await Notification.countDocuments({ userId: rollbackUser.id }), 0);
      assert.equal((await api('/admin/staff-applications/' + item.id, 'PATCH', { status: 'APPROVED' }, at)).status, 200);
    });
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(e => e ? reject(e) : resolve()));
    await mongoose.disconnect(); await mongo.stop();
  }
});
