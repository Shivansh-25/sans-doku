const adminSessionSeconds = 7 * 86400;
const adminCookieName = "__Host-sansdoku-admin";
const authEncoder = new TextEncoder();
const authHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
};
const localAdmin = (request, env) =>
  env.LOCAL_ADMIN === "1" &&
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(request.url).hostname);
const adminConfigured = (env) =>
  typeof env.ADMIN_PASSWORD === "string" &&
  env.ADMIN_PASSWORD.length >= 12 &&
  typeof env.ADMIN_EMAIL === "string" &&
  Boolean(env.DB);
const authEncode = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const authDecode = (text) =>
  Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
async function adminKey(env) {
  return crypto.subtle.importKey(
    "raw",
    authEncoder.encode("sansdoku-admin-session-v1:" + env.ADMIN_PASSWORD),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function isAdmin(request, env) {
  if (localAdmin(request, env)) return true;
  if (!adminConfigured(env)) return false;
  const token = (request.headers.get("Cookie") || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(adminCookieName + "="))
    ?.slice(adminCookieName.length + 1);
  if (!token || token.length > 2048) return false;
  try {
    const [payload, signature, extra] = token.split(".");
    if (extra !== undefined || !payload || !signature) return false;
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await adminKey(env),
        authDecode(signature),
        authEncoder.encode(payload),
      ))
    )
      return false;
    const claims = JSON.parse(new TextDecoder().decode(authDecode(payload)));
    const now = Math.floor(Date.now() / 1000);
    return (
      claims.email === env.ADMIN_EMAIL.toLowerCase() &&
      Number.isSafeInteger(claims.iat) &&
      Number.isSafeInteger(claims.exp) &&
      claims.iat <= now &&
      claims.exp > now &&
      claims.exp - claims.iat === adminSessionSeconds
    );
  } catch {
    return false;
  }
}
const adminCookie = (value, age = adminSessionSeconds) =>
  `${adminCookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function authRedirect(path, cookie) {
  return new Response(null, {
    status: 303,
    headers: {
      ...authHeaders,
      Location: path,
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
}
function adminLoginPage(message = "", status = 200) {
  // Messages are fixed strings; no request data or credential is rendered here.
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SansDoku · Admin sign in</title><style>
  :root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#303b33;background:#f7f5ef;color-scheme:light}*{box-sizing:border-box}body{margin:0;padding:24px;min-height:100svh;display:grid;place-items:center}main{width:100%;max-width:390px;background:#fffef9;border:1px solid #d9ded3;border-radius:20px;padding:28px}a{color:#526c58;text-decoration:none}h1{font:30px Georgia,serif;margin:22px 0 12px}p{font-size:14px;line-height:1.6;color:#6b7465}label{display:block;font-size:14px;margin:20px 0 8px}input,button{width:100%;min-height:48px;border-radius:10px;font:inherit;padding:12px;border:1px solid #d9ded3}input{background:#fff;color:inherit}button{margin-top:24px;background:#526c58;color:white;cursor:pointer}input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid #526c58;outline-offset:3px}.error{color:#923b4f}
  </style></head><body><main><a href="/">♡ SansDoku</a><h1>Your little stats room</h1><p>Sign in with your admin email and password. Stay signed in for seven days.</p>${message ? `<p class="error" role="alert">${message}</p>` : ""}<form method="post" action="/admin/login"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required maxlength="254"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required minlength="12" maxlength="256"><button>Sign in</button></form></main></body></html>`,
    {
      status,
      headers: {
        ...authHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      },
    },
  );
}
export async function handleAdminAuth(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/admin/logout") {
    if (request.method !== "POST")
      return new Response("Method not allowed", {
        status: 405,
        headers: authHeaders,
      });
    if (request.headers.get("Origin") !== url.origin)
      return new Response("Origin not allowed", {
        status: 403,
        headers: authHeaders,
      });
    return authRedirect("/admin/login", adminCookie("", 0));
  }
  if (url.pathname !== "/admin/login") return null;
  if (request.method === "GET") {
    if (await isAdmin(request, env)) return authRedirect("/admin");
    return adminLoginPage(
      adminConfigured(env)
        ? ""
        : "Admin password setup is pending. The app owner can configure it from their terminal.",
      adminConfigured(env) ? 200 : 503,
    );
  }
  if (request.method !== "POST")
    return new Response("Method not allowed", {
      status: 405,
      headers: authHeaders,
    });
  if (request.headers.get("Origin") !== url.origin)
    return new Response("Origin not allowed", {
      status: 403,
      headers: authHeaders,
    });
  if (!adminConfigured(env))
    return adminLoginPage("Admin password setup is pending.", 503);
  if (
    !request.headers
      .get("Content-Type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    return new Response("Form required", { status: 415, headers: authHeaders });
  try {
    const body = await request.text();
    if (body.length > 4096)
      return adminLoginPage("Sign-in request is too large.", 413);
    const form = new URLSearchParams(body);
    const email = form.get("email") || "",
      password = form.get("password") || "";
    if (email.length > 254 || password.length > 256)
      return adminLoginPage("Email or password is incorrect.", 401);
    // An atomic fixed-window counter limits password guessing across Worker instances.
    // Keep only a keyed hash of the IP, never the raw address.
    const now = Date.now(),
      bucket = Math.floor(now / 900000);
    const address = request.headers.get("CF-Connecting-IP") || "local";
    const ipHash = authEncode(
      await crypto.subtle.sign(
        "HMAC",
        await adminKey(env),
        authEncoder.encode("login-rate:" + address),
      ),
    );
    const results = await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM admin_login_attempts WHERE expires_at <= ?",
      ).bind(now),
      env.DB.prepare(
        `INSERT INTO admin_login_attempts (id,attempts,expires_at) VALUES (?,1,?)
        ON CONFLICT(id) DO UPDATE SET attempts=attempts+1 RETURNING attempts`,
      ).bind(`${ipHash}:${bucket}`, (bucket + 1) * 900000),
    ]);
    if (results[1].results[0].attempts > 10) {
      const limited = adminLoginPage(
        "Too many sign-in attempts. Try again in 15 minutes.",
        429,
      );
      limited.headers.set(
        "Retry-After",
        String(Math.ceil(((bucket + 1) * 900000 - now) / 1000)),
      );
      return limited;
    }
    const supplied = new Uint8Array(
      await crypto.subtle.digest("SHA-256", authEncoder.encode(password)),
    );
    const expected = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        authEncoder.encode(env.ADMIN_PASSWORD),
      ),
    );
    let difference = 0;
    for (let i = 0; i < expected.length; i++)
      difference |= supplied[i] ^ expected[i];
    if (
      difference !== 0 ||
      email.trim().toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()
    )
      return adminLoginPage("Email or password is incorrect.", 401);
    const issued = Math.floor(now / 1000);
    const payload = authEncode(
      authEncoder.encode(
        JSON.stringify({
          email: env.ADMIN_EMAIL.toLowerCase(),
          iat: issued,
          exp: issued + adminSessionSeconds,
        }),
      ),
    );
    const signature = authEncode(
      await crypto.subtle.sign(
        "HMAC",
        await adminKey(env),
        authEncoder.encode(payload),
      ),
    );
    return authRedirect("/admin", adminCookie(`${payload}.${signature}`));
  } catch {
    return adminLoginPage(
      "Sign-in is temporarily unavailable. Please try again.",
      503,
    );
  }
}
export const adminLoginRedirect = () => authRedirect("/admin/login");
