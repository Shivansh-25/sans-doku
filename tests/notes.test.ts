import { test } from "node:test";
import assert from "node:assert/strict";
import { localDatabase } from "../scripts/d1-local.mjs";
import { handleRequest } from "../worker/handler.mjs";
import { BUILTIN_KEYS } from "../src/milestones";
const adminPassword = "test-only-admin-password";
const sansPassword = "test-only-sans-password";
const env = () => ({ DB: localDatabase(), ADMIN_EMAIL: "admin@example.test", ADMIN_PASSWORD: adminPassword, SANS_PASSWORD: sansPassword });
const origin = "https://sansdoku.test";
const call = (e: object, path: string, init: RequestInit = {}) =>
  handleRequest(new Request(origin + path, { ...init, headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.7", ...(init.headers as object) } }), e, {});
async function sansCookie(e: object) {
  const r = await call(e, "/api/login", { method: "POST", body: JSON.stringify({ username: "sans", password: sansPassword }) });
  return r.headers.get("Set-Cookie")!.split(";")[0];
}
async function adminCookie(e: object) {
  const r = await handleRequest(
    new Request(origin + "/admin/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded", "CF-Connecting-IP": "192.0.2.8" }, body: new URLSearchParams({ email: "admin@example.test", password: adminPassword }) }),
    e,
    {},
  );
  return r.headers.get("Set-Cookie")!.split(";")[0];
}
const send = (e: object, cookie: string, body: object) =>
  call(e, "/admin/api/notes", { method: "POST", headers: { Cookie: cookie }, body: JSON.stringify(body) });

test("only the owner can write notes and only sans can read them", async () => {
  const e = env();
  const admin = await adminCookie(e);
  const sans = await sansCookie(e);
  assert.equal((await call(e, "/api/notes")).status, 401);
  assert.equal((await call(e, "/admin/api/notes")).status, 401);
  assert.equal((await send(e, sans, { action: "send", text: "hi" })).status, 401);
  const sent = await send(e, admin, { action: "send", text: "  Good morning ♡  " });
  assert.equal(sent.status, 200);
  const mine = await (await call(e, "/api/notes", { headers: { Cookie: sans } })).json();
  assert.equal(mine.messages.length, 1);
  assert.equal(mine.messages[0].text, "Good morning ♡");
  assert.equal((await send(e, admin, { action: "send", text: "   " })).status, 400);
  assert.equal((await send(e, admin, { action: "send", text: "x".repeat(601) })).status, 400);
  const gone = await (await send(e, admin, { action: "delete", id: mine.messages[0].id })).json();
  assert.equal(gone.messages.length, 0);
  const cross = await call(e, "/admin/api/notes", { method: "POST", headers: { Cookie: admin, Origin: "https://evil.test" }, body: JSON.stringify({ action: "send", text: "x" }) });
  assert.equal(cross.status, 403);
});

test("milestone texts can be set, replaced and cleared back to the default", async () => {
  const e = env();
  const admin = await adminCookie(e);
  const sans = await sansCookie(e);
  const set = await (await send(e, admin, { action: "milestone", key: "ten", text: "Ten! ♡" })).json();
  assert.deepEqual(set.milestones, { ten: "Ten! ♡" });
  await send(e, admin, { action: "milestone", key: "ten", text: "Ten, my love ♡" });
  const read = await (await call(e, "/api/notes", { headers: { Cookie: sans } })).json();
  assert.equal(read.milestones.ten, "Ten, my love ♡");
  assert.equal((await send(e, admin, { action: "milestone", key: "bogus", text: "x" })).status, 400);
  const cleared = await (await send(e, admin, { action: "milestone", key: "ten", text: "" })).json();
  assert.deepEqual(cleared.milestones, {});
});

test("worker and app agree on the milestone keys", async () => {
  const e = env();
  const admin = await adminCookie(e);
  for (const key of BUILTIN_KEYS) assert.equal((await send(e, admin, { action: "milestone", key, text: "ok" })).status, 200);
});

test("custom milestones: owner can add, edit, disable and delete; she only sees active ones", async () => {
  const e = env();
  const admin = await adminCookie(e);
  const sans = await sansCookie(e);
  const base = { action: "custom_save", title: "Twenty-five", kind: "total", value: 25, text: "Twenty-five puzzles ♡" };
  const added = await (await send(e, admin, base)).json();
  assert.equal(added.custom.length, 1);
  assert.deepEqual({ ...added.custom[0], id: 0 }, { id: 0, title: "Twenty-five", kind: "total", difficulty: null, value: 25, on_date: null, text: "Twenty-five puzzles ♡", enabled: 1 });
  const id = added.custom[0].id;
  await send(e, admin, { action: "custom_save", id, title: "Five hard", kind: "difficulty", difficulty: "hard", value: 5, text: "Five hard ones!" });
  await send(e, admin, { ...base, title: "Her birthday", kind: "date", on_date: "2026-12-25", value: 0, text: "Happy birthday ♡" });
  await send(e, admin, { ...base, title: "Hidden", enabled: false });
  const owner = await (await call(e, "/admin/api/notes", { headers: { Cookie: admin } })).json();
  assert.equal(owner.custom.length, 3);
  assert.equal(owner.custom.find((c: { id: number }) => c.id === id).difficulty, "hard");
  const hers = await (await call(e, "/api/notes", { headers: { Cookie: sans } })).json();
  assert.deepEqual(hers.custom.map((c: { title: string }) => c.title), ["Five hard", "Her birthday"]);
  const gone = await (await send(e, admin, { action: "custom_delete", id })).json();
  assert.equal(gone.custom.length, 2);
});

test("custom milestone rules are validated", async () => {
  const e = env();
  const admin = await adminCookie(e);
  const sans = await sansCookie(e);
  const good = { action: "custom_save", title: "Ok", kind: "streak", value: 14, text: "Two weeks ♡" };
  assert.equal((await send(e, sans, good)).status, 401);
  assert.equal((await send(e, admin, good)).status, 200);
  for (const bad of [
    { ...good, title: "" },
    { ...good, title: "x".repeat(61) },
    { ...good, text: "" },
    { ...good, text: "x".repeat(601) },
    { ...good, kind: "bogus" },
    { ...good, kind: "__proto__" },
    { ...good, value: 0 },
    { ...good, value: 400 },
    { ...good, value: 2.5 },
    { ...good, kind: "difficulty", value: 3 },
    { ...good, kind: "difficulty", value: 3, difficulty: "insane" },
    { ...good, kind: "date", on_date: "not-a-date" },
    { ...good, kind: "date", on_date: "1999-01-01" },
    { ...good, id: "7" },
  ])
    assert.equal((await send(e, admin, bad)).status, 400, JSON.stringify(bad));
  assert.equal((await send(e, admin, { ...good, kind: "fast", value: 20 })).status, 200);
});
