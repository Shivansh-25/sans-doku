const accessKeyCache = new Map();
function decodeAccessPart(part) {
  return Uint8Array.from(
    atob(part.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
export async function isAdmin(request, env) {
  // Only the local preview injects this flag; it is never a deployed binding.
  const host = new URL(request.url).hostname;
  if (
    env.LOCAL_ADMIN === "1" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(host)
  )
    return true;
  const team = env.ACCESS_TEAM_DOMAIN;
  if (
    !team ||
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) ||
    !env.ACCESS_AUD ||
    !env.ADMIN_EMAIL
  )
    return false;
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt || jwt.length > 12000) return false;
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return false;
    const header = JSON.parse(
      new TextDecoder().decode(decodeAccessPart(parts[0])),
    );
    const claims = JSON.parse(
      new TextDecoder().decode(decodeAccessPart(parts[1])),
    );
    const now = Date.now() / 1000;
    if (
      header.alg !== "RS256" ||
      typeof header.kid !== "string" ||
      claims.iss !== `https://${team}` ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now ||
      (claims.nbf !== undefined &&
        (!Number.isFinite(claims.nbf) || claims.nbf > now)) ||
      !Number.isFinite(claims.iat) ||
      claims.iat > now + 60 ||
      !(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(
        env.ACCESS_AUD,
      ) ||
      typeof claims.email !== "string" ||
      claims.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()
    )
      return false;
    let cache = accessKeyCache.get(team);
    if (!cache || cache.until < Date.now()) {
      const response = await fetch(`https://${team}/cdn-cgi/access/certs`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return false;
      cache = {
        keys: (await response.json()).keys,
        until: Date.now() + 300000,
      };
      accessKeyCache.set(team, cache);
    }
    const jwk = cache.keys.find((k) => k.kid === header.kid && k.kty === "RSA");
    if (!jwk) {
      accessKeyCache.delete(team);
      return false;
    }
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeAccessPart(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return false;
  }
}
