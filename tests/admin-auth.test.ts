import { test } from "node:test";
import assert from "node:assert/strict";
import { localDatabase } from "../scripts/d1-local.mjs";
import { handleRequest } from "../worker/handler.mjs";
import { isAdmin } from "../worker/access.mjs";
// Fixtures exist only in tests; production has no built-in password.
const fixturePassword = "test-only-password-123";
const createEnv = () => ({
  DB: localDatabase(),
  ADMIN_EMAIL: "admin@example.test",
  ADMIN_PASSWORD: fixturePassword,
});
const login = (env, overrides = {}, extraHeaders = {}) =>
  handleRequest(
    new Request("https://sansdoku.test/admin/login", {
      method: "POST",
      headers: {
        Origin: "https://sansdoku.test",
        "Content-Type": "application/x-www-form-urlencoded",
        "CF-Connecting-IP": "192.0.2.1",
        ...extraHeaders,
      },
      body: new URLSearchParams({
        email: "ADMIN@example.test",
        password: fixturePassword,
        ...overrides,
      }),
    }),
    env,
    {},
  );
test("password login creates a private seven-day session; wrong credentials and forged cookies fail", async () => {
  const env = createEnv();
  try {
    assert.equal(
      (await login(env, { password: "incorrect-password" })).status,
      401,
    );
    assert.equal(
      (await login(env, { email: "other@example.test" })).status,
      401,
    );
    const response = await login(env);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("Location"), "/admin");
    const cookie = response.headers.get("Set-Cookie")!;
    for (const flag of [
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Max-Age=604800",
      "Path=/",
    ])
      assert.ok(cookie.includes(flag));
    const request = new Request("https://sansdoku.test/admin/api/stats", {
      headers: { Cookie: cookie.split(";")[0] },
    });
    assert.equal(await isAdmin(request, env), true);
    assert.equal((await handleRequest(request, env, {})).status, 200);
    assert.equal(
      await isAdmin(request, {
        ...env,
        ADMIN_PASSWORD: "rotated-test-password",
      }),
      false,
    );
    assert.equal(
      await isAdmin(request, { ...env, ADMIN_EMAIL: "different@example.test" }),
      false,
    );
    assert.equal(
      await isAdmin(
        new Request("https://sansdoku.test/admin", {
          headers: { Cookie: "__Host-sansdoku-admin=forged.token" },
        }),
        env,
      ),
      false,
    );
    const token = cookie.split(";")[0].split("=")[1];
    const [payload, signature] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    claims.exp += 604800;
    assert.equal(
      await isAdmin(
        new Request("https://sansdoku.test/admin", {
          headers: {
            Cookie:
              "__Host-sansdoku-admin=" +
              Buffer.from(JSON.stringify(claims)).toString("base64url") +
              "." +
              signature,
          },
        }),
        env,
      ),
      false,
    );
    const originalNow = Date.now;
    Date.now = () => originalNow() + 604801000;
    try {
      assert.equal(await isAdmin(request, env), false);
    } finally {
      Date.now = originalNow;
    }
    const logout = await handleRequest(
      new Request("https://sansdoku.test/admin/logout", {
        method: "POST",
        headers: { Origin: "https://sansdoku.test" },
      }),
      env,
      {},
    );
    assert.equal(logout.status, 303);
    assert.match(logout.headers.get("Set-Cookie")!, /Max-Age=0/);
  } finally {
    env.DB.close();
  }
});
test("sign-in rejects cross-origin forms, fails closed without setup, and limits repeated guesses", async () => {
  const env = createEnv();
  try {
    assert.equal(
      (await login(env, {}, { Origin: "https://evil.test" })).status,
      403,
    );
    assert.equal(
      (await login({ ...env, ADMIN_PASSWORD: undefined })).status,
      503,
    );
    for (let i = 0; i < 10; i++)
      assert.equal(
        (await login(env, { password: "wrong-password" })).status,
        401,
      );
    const limited = await login(env);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Cache-Control"), "no-store");
    assert.ok(Number(limited.headers.get("Retry-After")) > 0);
    assert.equal(
      (await login(env, {}, { "CF-Connecting-IP": "192.0.2.2" })).status,
      303,
    );
    const rows = await env.DB.batch([
      env.DB.prepare("SELECT id FROM admin_login_attempts").bind(),
    ]);
    assert.ok(!JSON.stringify(rows).includes("192.0.2."));
    const page = await handleRequest(
      new Request("https://sansdoku.test/admin/login"),
      env,
      {},
    );
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.ok(!html.includes(fixturePassword));
    assert.equal(page.headers.get("Cache-Control"), "no-store");
    assert.equal(
      (
        await handleRequest(
          new Request("https://sansdoku.test/admin/logout"),
          env,
          {},
        )
      ).status,
      405,
    );
  } finally {
    env.DB.close();
  }
});
