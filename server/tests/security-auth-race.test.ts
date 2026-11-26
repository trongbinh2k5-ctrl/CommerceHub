import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { User } from '../src/modules/auth/user.model';
import { LoginSession } from '../src/modules/auth/account.models';

test('password rotation between credential validation and session creation cannot revive old credentials', { timeout: 120000 }, async t => {
  process.env.NODE_ENV = 'test'; process.env.EMAIL_VERIFICATION_REQUIRED = 'false';
  process.env.JWT_ACCESS_SECRET = 'isolated-security-race-secret-32-bytes-long';
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  try {
    await mongoose.connect(mongo.getUri('security_login_race'));
    await Promise.all(Object.values(mongoose.models).map(m => m.init()));
    const oldPassword = 'OldCredential!2026', newPassword = 'NewCredential!2026';
    const user = await User.create({ fullName: 'Race Fixture', email: 'race@test.local', passwordHash: await bcrypt.hash(oldPassword, 4) });
    const newHash = await bcrypt.hash(newPassword, 4);
    server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/auth/login`;
    const login = (password: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
    // Trigger the password-reset commit precisely after loginUser has checked the old hash,
    // before startLoginSession reads the account again. No timing-dependent sleeps.
    const original = User.findById;
    let rotated = false;
    const intercepted = t.mock.method(User, 'findById', async function (this: any, ...args: any[]) {
      if (!rotated && String(args[0]) === user.id) {
        rotated = true;
        await User.updateOne({ _id: user._id }, { $set: { passwordHash: newHash }, $inc: { authVersion: 1 } });
        await LoginSession.deleteMany({ userId: user._id });
      }
      return (original as any).apply(this, args);
    } as any);
    let response: Response;
    try { response = await login(oldPassword); } finally { intercepted.mock.restore(); }
    assert.equal(rotated, true);
    assert.equal(response.status, 401, 'an old password must not receive a fresh post-reset session');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(await LoginSession.countDocuments({ userId: user._id }), 0);
    const fresh = await login(newPassword);
    assert.equal(fresh.status, 200);
    const payload = await fresh.json() as any;
    assert.equal(payload.data.user.email, user.email);
    assert.equal(JSON.stringify(payload).includes(newHash), false);
    assert.equal((await login(oldPassword)).status, 401);
  } finally {
    t.mock.restoreAll();
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await mongoose.disconnect(); await mongo.stop();
  }
});

test('email-change password confirmation has a dedicated brute-force limit', { timeout: 120000 }, async () => {
  process.env.NODE_ENV = 'test'; process.env.EMAIL_VERIFICATION_REQUIRED = 'false';
  process.env.JWT_ACCESS_SECRET = 'isolated-email-change-rate-secret-32-bytes';
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  try {
    await mongoose.connect(mongo.getUri('security_email_rate'));
    await Promise.all(Object.values(mongoose.models).map(m => m.init()));
    const user = await User.create({ fullName: 'Rate Fixture', email: 'rate@test.local', passwordHash: await bcrypt.hash('ActualSecret!2026', 4) });
    const token = jwt.sign({ role: 'CUSTOMER', version: 0 }, process.env.JWT_ACCESS_SECRET!, { subject: user.id });
    server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/auth/email-change`;
    let response: Response | undefined;
    for (let i = 0; i < 6; i++) response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ email: 'next@test.local', password: 'incorrect' }) });
    assert.equal(response!.status, 429, 'email-change must not bypass the sensitive password confirmation budget');
    assert.ok(response!.headers.get('retry-after'));
    assert.equal((await User.findById(user._id))!.email, user.email);
  } finally {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await mongoose.disconnect(); await mongo.stop();
  }
});
