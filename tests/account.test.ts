import { test } from "node:test";
import assert from "node:assert/strict";
import { localDatabase } from "../scripts/d1-local.mjs";
import { handleRequest } from "../worker/handler.mjs";
const password = "test-only-sans-password";
const env = (extra = {}) => ({ DB: localDatabase(), SANS_PASSWORD: password, ...extra });
const call = (e: object, path: string, init: RequestInit = {}) =>
  handleRequest(
    new Request(`https://sansdoku.test${path}`, {
      headers: { Origin: "https://sansdoku.test", "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.9", ...(init.headers as object) },
      ...init,
    }),
    e,
    {},
  );
const login = (e: object, body: object = { username: "Sans", password }) =>
  call(e, "/api/login", { method: "POST", body: JSON.stringify(body) });
const cookieOf = (r: Response) => r.headers.get("Set-Cookie")!.split(";")[0];

test("signing in as sans sets a private session and /api/session recognises it", async () => {
  const e = env();
  const r = await login(e);
  assert.equal(r.status, 200);
  const set = r.headers.get("Set-Cookie")!;
  assert.match(set, /HttpOnly/);
  assert.match(set, /Secure/);
  assert.match(set, /SameSite=Strict/);
  const body = await r.json();
  assert.equal(body.username, "sans");
  assert.match(body.playerId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const session = await call(e, "/api/session", { headers: { Cookie: cookieOf(r) } });
  assert.deepEqual(await session.json(), { username: "sans", playerId: body.playerId });
  const anon = await call(e, "/api/session");
  assert.deepEqual(await anon.json(), { username: null });
});

test("wrong credentials, forged cookies, and a changed password are rejected", async () => {
  const e = env();
  assert.equal((await login(e, { username: "sans", password: "nope-nope" })).status, 401);
  assert.equal((await login(e, { username: "someone", password })).status, 401);
  const ok = await login(e);
  const forged = await call(e, "/api/session", { headers: { Cookie: "__Host-sansdoku-session=abc.def" } });
  assert.deepEqual(await forged.json(), { username: null });
  const rotated = await call({ ...e, SANS_PASSWORD: "a-brand-new-password" }, "/api/session", { headers: { Cookie: cookieOf(ok) } });
  assert.deepEqual(await rotated.json(), { username: null });
});

test("logout clears the cookie; cross-origin and unconfigured requests fail", async () => {
  const e = env();
  const out = await call(e, "/api/logout", { method: "POST" });
  assert.match(out.headers.get("Set-Cookie")!, /Max-Age=0/);
  const cross = await call(e, "/api/login", { method: "POST", headers: { Origin: "https://evil.test" }, body: JSON.stringify({ username: "sans", password }) });
  assert.equal(cross.status, 403);
  assert.equal((await login({ DB: localDatabase() })).status, 503);
  assert.deepEqual(await (await call({ DB: localDatabase() }, "/api/session")).json(), { username: null });
});

test("repeated wrong guesses are rate limited", async () => {
  const e = env();
  let status = 0;
  for (let i = 0; i < 12; i++) status = (await login(e, { username: "sans", password: "wrong-wrong" })).status;
  assert.equal(status, 429);
});
