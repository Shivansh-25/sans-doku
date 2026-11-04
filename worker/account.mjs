// Optional sign-in for the shared "sans" account and a separate "admin" test account. Guests never need this.
const accountCookieName = "__Host-sansdoku-session";
const accountSessionSeconds = 365 * 86400;
const accountEnc = new TextEncoder();
const accountHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const accountReply = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...accountHeaders, ...extra },
  });
const accountB64 = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const accountUnb64 = (text) =>
  Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
// Each account has its own secret, so a test account never touches the real one's data.
const accountPasswordFor = (env, user) => {
  const secret = user === "sans" ? env.SANS_PASSWORD : user === "admin" ? env.TESTER_PASSWORD : undefined;
  return typeof secret === "string" && secret.length >= 6 ? secret : undefined;
};
const accountNames = ["sans", "admin"];
const accountConfigured = (env) => accountNames.some((u) => accountPasswordFor(env, u));
// Changing a password signs that account out everywhere.
const accountKey = (env, user) =>
  crypto.subtle.importKey(
    "raw",
    accountEnc.encode(`sansdoku-session-v1:${user}:` + accountPasswordFor(env, user)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
// A stable, UUIDv4-shaped id so an account's stats follow it across devices.
export async function accountPlayerId(user) {
  const h = new Uint8Array(
    await crypto.subtle.digest("SHA-256", accountEnc.encode("sansdoku-account:" + user)),
  );
  const hex = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0"));
  hex[6] = "4" + hex[6][1];
  hex[8] = "89ab"[parseInt(hex[8][0], 16) % 4] + hex[8][1];
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
export async function sessionUser(request, env) {
  if (!accountConfigured(env)) return null;
  const token = (request.headers.get("Cookie") || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(accountCookieName + "="))
    ?.slice(accountCookieName.length + 1);
  if (!token || token.length > 1024) return null;
  try {
    const [payload, signature, extra] = token.split(".");
    if (extra !== undefined || !payload || !signature) return null;
    const claims = JSON.parse(new TextDecoder().decode(accountUnb64(payload)));
    if (!accountNames.includes(claims.u) || !accountPasswordFor(env, claims.u)) return null;
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await accountKey(env, claims.u),
        accountUnb64(signature),
        accountEnc.encode(payload),
      ))
    )
      return null;
    const now = Math.floor(Date.now() / 1000);
    return Number.isSafeInteger(claims.iat) &&
      Number.isSafeInteger(claims.exp) &&
      claims.iat <= now &&
      claims.exp > now
      ? claims.u
      : null;
  } catch {
    return null;
  }
}
const accountCookie = (value, age = accountSessionSeconds) =>
  `${accountCookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
export async function handleAccount(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/session") {
    if (request.method !== "GET") return accountReply({ error: "Method not allowed" }, 405);
    const user = await sessionUser(request, env);
    return accountReply(user ? { username: user, playerId: await accountPlayerId(user) } : { username: null });
  }
  if (url.pathname === "/api/stats") return handleAccountStats(request, env, url);
  if (url.pathname !== "/api/login" && url.pathname !== "/api/logout") return null;
  if (request.method !== "POST") return accountReply({ error: "Method not allowed" }, 405);
  if (request.headers.get("Origin") !== url.origin)
    return accountReply({ error: "Origin not allowed" }, 403);
  if (url.pathname === "/api/logout") return accountReply({ ok: true }, 200, { "Set-Cookie": accountCookie("", 0) });
  if (!accountConfigured(env)) return accountReply({ error: "Sign-in isn't set up yet." }, 503);
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return accountReply({ error: "JSON required" }, 415);
  try {
    const text = await request.text();
    if (text.length > 2048) return accountReply({ error: "Request too large" }, 413);
    const body = JSON.parse(text);
    const user = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
    // Reuse the admin attempts table: at most 10 tries per 15 minutes per keyed IP hash.
    if (env.DB) {
      const now = Date.now(),
        bucket = Math.floor(now / 900000);
      const ip = request.headers.get("CF-Connecting-IP") || "local";
      const ipHash = accountB64(
        await crypto.subtle.sign("HMAC", await accountKey(env, accountNames.find((u) => accountPasswordFor(env, u))), accountEnc.encode("account-rate:" + ip)),
      );
      const results = await env.DB.batch([
        env.DB.prepare("DELETE FROM admin_login_attempts WHERE expires_at <= ?").bind(now),
        env.DB.prepare(
          `INSERT INTO admin_login_attempts (id,attempts,expires_at) VALUES (?,1,?)
          ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts`,
        ).bind(`acct:${ipHash}:${bucket}`, (bucket + 1) * 900000),
      ]);
      if (results[1].results[0].attempts > 10)
        return accountReply(
          { error: "Too many tries. Please wait a few minutes." },
          429,
          { "Retry-After": String(Math.ceil(((bucket + 1) * 900000 - now) / 1000)) },
        );
    }
    const digest = async (v) =>
      new Uint8Array(await crypto.subtle.digest("SHA-256", accountEnc.encode(v)));
    const name = user.trim().toLowerCase();
    const known = accountPasswordFor(env, name);
    const supplied = await digest(password),
      expected = await digest(known ?? "not-an-account");
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= supplied[i] ^ expected[i];
    if (difference !== 0 || !known)
      return accountReply({ error: "Username or password is incorrect." }, 401);
    const iat = Math.floor(Date.now() / 1000);
    const payload = accountB64(accountEnc.encode(JSON.stringify({ u: name, iat, exp: iat + accountSessionSeconds })));
    const signature = accountB64(
      await crypto.subtle.sign("HMAC", await accountKey(env, name), accountEnc.encode(payload)),
    );
    return accountReply(
      { username: name, playerId: await accountPlayerId(name) },
      200,
      { "Set-Cookie": accountCookie(`${payload}.${signature}`) },
    );
  } catch {
    return accountReply({ error: "Sign-in is temporarily unavailable." }, 503);
  }
}

const accountDifficulties = new Set(["easy", "medium", "hard"]);
const accountFinishId = /^[A-Za-z0-9:_-]{6,64}$/;
// Her finished puzzles, so her record and growth follow her across devices.
async function handleAccountStats(request, env, url) {
  if (!env.DB) return accountReply({ error: "Stats are unavailable." }, 503);
  const user = await sessionUser(request, env);
  if (!user) return accountReply({ error: "Please sign in." }, 401);
  if (request.method === "GET") {
    const rows = await env.DB.batch([
      env.DB.prepare(
        `SELECT id, difficulty, finished_at AS at, play_ms AS ms, hints
         FROM account_finishes WHERE account = ? ORDER BY finished_at DESC LIMIT 2000`,
      ).bind(user),
    ]);
    return accountReply({ finishes: rows[0].results });
  }
  if (request.method !== "POST") return accountReply({ error: "Method not allowed" }, 405);
  if (request.headers.get("Origin") !== url.origin)
    return accountReply({ error: "Origin not allowed" }, 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return accountReply({ error: "JSON required" }, 415);
  try {
    const text = await request.text();
    if (text.length > 40000) return accountReply({ error: "Request too large" }, 413);
    const list = JSON.parse(text).finishes;
    if (!Array.isArray(list) || list.length > 100)
      return accountReply({ error: "Invalid finishes" }, 400);
    const now = Date.now();
    const valid = (f) =>
      f &&
      typeof f.id === "string" &&
      accountFinishId.test(f.id) &&
      accountDifficulties.has(f.difficulty) &&
      Number.isSafeInteger(f.at) &&
      f.at > 1577836800000 &&
      f.at < now + 86400000 &&
      Number.isSafeInteger(f.ms) &&
      f.ms >= 0 &&
      f.ms <= 86400000 &&
      Number.isSafeInteger(f.hints) &&
      f.hints >= 0 &&
      f.hints <= 999;
    if (!list.every(valid)) return accountReply({ error: "Invalid finishes" }, 400);
    if (list.length)
      await env.DB.batch(
        list.map((f) =>
          env.DB.prepare(
            `INSERT INTO account_finishes (id,account,difficulty,finished_at,play_ms,hints,created_at)
             VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,
          ).bind(f.id, user, f.difficulty, f.at, f.ms, f.hints, now),
        ),
      );
    return accountReply({ ok: true, saved: list.length });
  } catch {
    return accountReply({ error: "Stats are temporarily unavailable." }, 503);
  }
}
