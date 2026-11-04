import { test } from "node:test";
import assert from "node:assert/strict";
import { localDatabase } from "../scripts/d1-local.mjs";
import { handleRequest } from "../worker/handler.mjs";
const password = "test-only-sans-password";
const env = (extra = {}) => ({ DB: localDatabase(), SANS_PASSWORD: password, ...extra });
const call = (e: object, path: string, init: RequestInit = {}) =>
  handleRequest(
    new Request(`https://sansdoku.test${path}`, {
      ...init,
      headers: { Origin: "https://sansdoku.test", "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.9", ...(init.headers as object) },
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

test("finished puzzles sync only for the signed-in account and are idempotent", async () => {
  const e = env();
  const finish = { id: "game-0001-abcd", difficulty: "easy", at: Date.now() - 1000, ms: 123456, hints: 0 };
  const post = (cookie: string, body: object) =>
    call(e, "/api/stats", { method: "POST", headers: { Cookie: cookie }, body: JSON.stringify(body) });
  assert.equal((await call(e, "/api/stats")).status, 401);
  const cookie = cookieOf(await login(e));
  assert.equal((await post("", { finishes: [finish] })).status, 401);
  assert.equal((await post(cookie, { finishes: [finish, finish] })).status, 200);
  assert.equal((await post(cookie, { finishes: [{ ...finish, id: "second-game-01", difficulty: "hard", at: finish.at + 5 }] })).status, 200);
  const list = await (await call(e, "/api/stats", { headers: { Cookie: cookie } })).json();
  assert.equal(list.finishes.length, 2);
  assert.equal(list.finishes[0].difficulty, "hard");
  assert.equal(list.finishes[1].ms, 123456);
  for (const bad of [
    { ...finish, id: "x" },
    { ...finish, difficulty: "insane" },
    { ...finish, ms: -5 },
    { ...finish, at: Date.now() + 10 * 86400000 },
    { ...finish, hints: 1.5 },
  ])
    assert.equal((await post(cookie, { finishes: [bad] })).status, 400);
  const cross = await call(e, "/api/stats", { method: "POST", headers: { Cookie: cookie, Origin: "https://evil.test" }, body: JSON.stringify({ finishes: [] }) });
  assert.equal(cross.status, 403);
});

test("the admin test account is separate: own id, own stats, own password", async () => {
  const testerPassword = "test-only-tester-password";
  const e = env({ TESTER_PASSWORD: testerPassword });
  const asSans = await login(e);
  const asTester = await login(e, { username: "Admin", password: testerPassword });
  assert.equal(asTester.status, 200);
  const sansBody = await asSans.json();
  const testerBody = await asTester.json();
  assert.equal(testerBody.username, "admin");
  assert.notEqual(testerBody.playerId, sansBody.playerId);
  // Each password only opens its own account.
  assert.equal((await login(e, { username: "sans", password: testerPassword })).status, 401);
  assert.equal((await login(e, { username: "admin", password })).status, 401);
  const sansCookie = cookieOf(await login(e));
  const testerCookie = cookieOf(await login(e, { username: "admin", password: testerPassword }));
  const finish = { id: "tester-game-01", difficulty: "easy", at: Date.now() - 1000, ms: 90000, hints: 0 };
  const post = (cookie: string) => call(e, "/api/stats", { method: "POST", headers: { Cookie: cookie }, body: JSON.stringify({ finishes: [finish] }) });
  assert.equal((await post(testerCookie)).status, 200);
  const get = async (cookie: string) => (await (await call(e, "/api/stats", { headers: { Cookie: cookie } })).json()).finishes.length;
  assert.equal(await get(testerCookie), 1);
  assert.equal(await get(sansCookie), 0); // testing never touches her record
  // Rotating the tester password signs out only the tester.
  const rotated = { ...e, TESTER_PASSWORD: "another-test-password" };
  assert.deepEqual(await (await call(rotated, "/api/session", { headers: { Cookie: testerCookie } })).json(), { username: null });
  assert.equal((await (await call(rotated, "/api/session", { headers: { Cookie: sansCookie } })).json()).username, "sans");
  // Without a tester secret the account does not exist.
  assert.equal((await login(env(), { username: "admin", password: testerPassword })).status, 401);
});
