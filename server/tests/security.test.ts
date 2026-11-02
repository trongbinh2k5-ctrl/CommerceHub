import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import jwt from "jsonwebtoken";
import { createRequestLimiter, installSecurity } from "../src/middlewares/security.middleware";

test("security protections", async t => {
  process.env.CORS_ORIGINS = "https://shop.example";
  process.env.JWT_ACCESS_SECRET = "security-test-secret-with-at-least-32-bytes";
  const { default: app } = await import("../src/app");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    await t.test("security headers and no framework disclosure", async () => {
      const r = await fetch(base + "/health");
      assert.equal(r.headers.get("x-powered-by"), null);
      assert.equal(r.headers.get("x-content-type-options"), "nosniff");
      assert.equal(r.headers.get("x-frame-options"), "SAMEORIGIN");
      assert.ok(r.headers.get("content-security-policy"));
    });
    await t.test("CORS permits configured origin and denies others", async () => {
      for (const origin of ["https://shop.example", "https://attacker.example"]) {
        const r = await fetch(base + "/api/auth/me", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "Authorization,Idempotency-Key" } });
        assert.equal(r.headers.get("access-control-allow-origin"), origin === "https://shop.example" ? origin : null);
      }
    });
    await t.test("malformed and oversized bodies produce safe errors", async () => {
      for (const [body, status] of [["{secret-invalid", 400], [JSON.stringify({ password: "x".repeat(33000) }), 413]] as const) {
        const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body });
        assert.equal(r.status, status);
        const text = await r.text();
        assert.ok(!text.includes("secret-invalid")); assert.ok(!text.includes("SyntaxError"));
        assert.equal(r.headers.get("cache-control"), "no-store");
      }
    });
    await t.test("bcrypt byte limit rejects multibyte passwords", async () => {
      const r = await fetch(base + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: "QA", email: "qa@test.local", password: "ắ".repeat(25) }) });
      assert.equal(r.status, 400);
    });
    await t.test("signed token with malformed subject is unauthorized", async () => {
      const token = jwt.sign({ sub: "invalid-id", role: "ADMIN" }, process.env.JWT_ACCESS_SECRET!);
      const r = await fetch(base + "/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(r.status, 401);
    });
    await t.test("login throttling returns 429 and Retry-After", async () => {
      let r: Response | undefined;
      for (let i = 0; i < 21; i++) r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      assert.equal(r!.status, 429); assert.ok(r!.headers.get("retry-after"));
      assert.equal((await r!.json()).success, false);
    });
    await t.test("API 404 is JSON without request reflection", async () => {
      const r = await fetch(base + "/api/unknown-sensitive-value");
      assert.equal(r.status, 404);
      assert.deepEqual(await r.json(), { success: false, message: "Route not found" });
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test("rate limit uses socket IP instead of untrusted X-Forwarded-For", async () => {
  const app = express();
  installSecurity(app);
  const limiter = createRequestLimiter(2, 60_000);
  app.get("/limited", limiter, (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/limited`;
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(base)).status, 200);
    const r = await fetch(base, { headers: { "X-Forwarded-For": "203.0.113.99" } });
    assert.equal(r.status, 429);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});
