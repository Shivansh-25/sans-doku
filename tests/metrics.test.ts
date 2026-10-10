import { test } from "node:test";
import assert from "node:assert/strict";
import { localDatabase } from "../scripts/d1-local.mjs";
import { handleRequest } from "../worker/handler.mjs";
import { validPlay } from "../worker/metrics.mjs";
import { PlayClock } from "../src/play-clock";
const makePlay = (overrides = {}) => ({
  id: crypto.randomUUID(),
  token: crypto.randomUUID(),
  playerId: crypto.randomUUID(),
  nickname: "Sans",
  difficulty: "easy",
  startedAt: Date.now() - 10000,
  lastPlayedAt: Date.now(),
  completedAt: null,
  activeMs: 4000,
  autoUsed: false,
  moves: 2,
  filled: 40,
  revision: 1,
  playing: true,
  ...overrides,
});
const ingest = (DB: unknown, plays: unknown[]) =>
  handleRequest(
    new Request("http://localhost/api/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plays }),
    }),
    { DB },
    {},
  );
const stats = async (DB: unknown, suffix = "") => {
  const response = await handleRequest(
    new Request(`http://localhost/admin/api/stats?days=30${suffix}`),
    { DB, LOCAL_ADMIN: "1" },
    {},
  );
  assert.equal(response.status, 200);
  return response.json();
};
test("active clock pauses hidden and idle time without losing thinking time", () => {
  const c = new PlayClock(0);
  assert.equal(c.tick(30000), 30000);
  assert.equal(c.tick(90000), 30000);
  assert.equal(c.active(90000), false);
  assert.equal(c.touch(100000), 0);
  assert.equal(c.visibility(110000, false), 10000);
  assert.equal(c.visibility(1000000, true), 0);
  assert.equal(c.tick(1005000), 5000);
});
test("metrics validate batches and reject cross-origin writes", async () => {
  const DB = localDatabase();
  try {
    assert.equal(validPlay(makePlay()), true);
    for (const override of [
      { activeMs: -1 },
      { nickname: "x".repeat(25) },
      { difficulty: "expert" },
      { filled: 82 },
      { playing: "yes" },
      { completedAt: 0 },
    ]) {
      assert.equal((await ingest(DB, [makePlay(override)])).status, 400);
    }
    assert.equal(
      (
        await ingest(
          DB,
          Array.from({ length: 21 }, () => makePlay()),
        )
      ).status,
      400,
    );
    const response = await handleRequest(
      new Request("http://localhost/api/metrics", {
        method: "POST",
        headers: {
          Origin: "https://other.test",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      { DB },
      {},
    );
    assert.equal(response.status, 403);
  } finally {
    DB.close();
  }
});
test("retries, old revisions and wrong write tokens cannot overwrite a game", async () => {
  const DB = localDatabase(),
    p = makePlay();
  try {
    assert.equal((await ingest(DB, [p, p])).status, 200);
    await ingest(DB, [
      {
        ...p,
        revision: 2,
        activeMs: 9000,
        completedAt: Date.now(),
        playing: false,
      },
    ]);
    await ingest(DB, [{ ...p, revision: 1, activeMs: 999999 }]);
    await ingest(DB, [
      { ...p, token: crypto.randomUUID(), revision: 3, activeMs: 999999 },
    ]);
    const s = await stats(DB);
    assert.equal(s.totals.started, 1);
    assert.equal(s.totals.completed, 1);
    assert.equal(s.totals.active_ms, 9000);
    assert.equal(s.presence.length, 0);
    assert.equal(s.recent.length, 1);
    assert.ok(!JSON.stringify(s).includes(p.token));
  } finally {
    DB.close();
  }
});
test("player stats separate matching nicknames and stale presence expires", async () => {
  const DB = localDatabase(),
    a = makePlay(),
    b = makePlay({ difficulty: "hard", playing: false });
  try {
    await ingest(DB, [a, b]);
    let s = await stats(DB);
    assert.equal(s.players.length, 2);
    assert.equal(s.presence.length, 1);
    s = await stats(DB, `&player=${a.playerId}`);
    assert.equal(s.totals.started, 1);
    assert.equal(s.difficulties[0].difficulty, "easy");
    await DB.batch([
      DB.prepare("UPDATE plays SET presence_at=? WHERE id=?").bind(
        Date.now() - 91000,
        a.id,
      ),
    ]);
    s = await stats(DB);
    assert.equal(s.presence.length, 0);
  } finally {
    DB.close();
  }
});
test("admin HTML and stats reject anonymous access and production local flags", async () => {
  for (const path of ["/admin", "/admin/", "/admin.html", "/admin/api/stats"]) {
    const r = await handleRequest(
      new Request(`https://sansdoku.test${path}`, {
        headers: {
          "Cf-Access-Authenticated-User-Email": "shivsrijan25@gmail.com",
        },
      }),
      { LOCAL_ADMIN: "1" },
      {},
    );
    assert.equal(r.status, 401);
    assert.equal(r.headers.get("Cache-Control"), "no-store");
  }
});

test("Access requires a valid signed token for the correct email, audience and expiry", async () => {
  const { isAdmin } = await import("../worker/access.mjs");
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = "test-key";
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [jwk] });
  const env = {
    ACCESS_TEAM_DOMAIN: "sansdoku-test.cloudflareaccess.com",
    ACCESS_AUD: "app-audience",
    ADMIN_EMAIL: "admin@example.test",
  };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const claims = {
    iss: "https://sansdoku-test.cloudflareaccess.com",
    aud: ["app-audience"],
    email: "admin@example.test",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const sign = async (overrides = {}) => {
    const body =
      encode({ alg: "RS256", kid: "test-key" }) +
      "." +
      encode({ ...claims, ...overrides });
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      pair.privateKey,
      new TextEncoder().encode(body),
    );
    return body + "." + Buffer.from(signature).toString("base64url");
  };
  const request = (token: string) =>
    new Request("https://sansdoku.test/admin", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    });
  try {
    assert.equal(await isAdmin(request(await sign()), env), true);
    for (const override of [
      { email: "other@example.test" },
      { aud: ["another-app"] },
      { exp: 1 },
      { iss: "https://evil.test" },
    ]) {
      assert.equal(await isAdmin(request(await sign(override)), env), false);
    }
    const token = await sign();
    const parts = token.split(".");
    parts[1] = encode({
      ...claims,
      email: "admin@example.test",
      exp: claims.exp + 10000,
    });
    assert.equal(await isAdmin(request(parts.join(".")), env), false);
    assert.equal(await isAdmin(request("fake-token"), env), false);
    assert.equal(await isAdmin(request(token), {}), false);
  } finally {
    globalThis.fetch = previous;
  }
});

test("offline sync keeps the original last-played time rather than upload time", async () => {
  const DB = localDatabase();
  const lastPlayedAt = Date.now() - 86400000;
  const p = makePlay({
    startedAt: lastPlayedAt - 10000,
    lastPlayedAt,
    playing: false,
  });
  try {
    await ingest(DB, [p]);
    const s = await stats(DB);
    assert.equal(s.players[0].last_played, lastPlayedAt);
  } finally {
    DB.close();
  }
});

test("daily time splits at India midnight and averages include quiet calendar periods", async () => {
  const { addDailyTime, activitySummary } = await import("../src/daily-time");
  const days: { day: string; activeMs: number }[] = [];
  addDailyTime(days, Date.UTC(2026, 9, 10, 18, 29, 50), 20000);
  assert.deepEqual(days, [
    { day: "2026-10-10", activeMs: 10000 },
    { day: "2026-10-11", activeMs: 10000 },
  ]);
  const summary = activitySummary(days, 7, Date.UTC(2026, 9, 11, 8));
  assert.equal(summary.daily.length, 7);
  assert.equal(summary.total, 20000);
  assert.equal(summary.averageWeek, 20000);
  assert.equal(summary.averageDay, 20000 / 7);
  assert.equal(summary.mostActive?.day, "2026-10-10");
  const months = activitySummary(
    [
      { day: "2026-09-30", activeMs: 60000 },
      { day: "2026-10-01", activeMs: 120000 },
    ],
    7,
    Date.UTC(2026, 9, 2),
  );
  assert.equal(months.monthly.length, 2);
  assert.equal(months.averageMonth, 90000);
});

test("daily snapshots deduplicate retries, filter players, and reject stale or unauthorized changes", async () => {
  const DB = localDatabase();
  const day = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  const p = makePlay({ days: [{ day, activeMs: 3000 }] });
  try {
    assert.equal((await ingest(DB, [p])).status, 200);
    await ingest(DB, [p]);
    let s = await stats(DB);
    assert.deepEqual(s.daily, [{ day, activeMs: 3000 }]);
    await ingest(DB, [
      { ...p, revision: 2, activeMs: 9000, days: [{ day, activeMs: 9000 }] },
    ]);
    await ingest(DB, [
      { ...p, revision: 1, activeMs: 99000, days: [{ day, activeMs: 99000 }] },
    ]);
    await ingest(DB, [
      {
        ...p,
        revision: 3,
        token: crypto.randomUUID(),
        activeMs: 99000,
        days: [{ day, activeMs: 99000 }],
      },
    ]);
    s = await stats(DB, `&player=${p.playerId}`);
    assert.equal(s.daily[0].activeMs, 9000);
    assert.equal(
      (await ingest(DB, [{ ...p, days: [{ day: "2026-02-30", activeMs: 1 }] }]))
        .status,
      400,
    );
    assert.equal(
      (await ingest(DB, [{ ...p, days: [{ day, activeMs: 90000 }] }])).status,
      400,
    );
  } finally {
    DB.close();
  }
});
