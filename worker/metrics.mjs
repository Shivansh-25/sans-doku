import { isAdmin } from "./access.mjs";
const metricsJson = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validPlay(p, now = Date.now()) {
  const integer = (n, min, max) =>
    Number.isSafeInteger(n) && n >= min && n <= max;
  return (
    p &&
    uuidPattern.test(p.id) &&
    uuidPattern.test(p.token) &&
    uuidPattern.test(p.playerId) &&
    typeof p.nickname === "string" &&
    p.nickname.trim().length > 0 &&
    p.nickname.length <= 24 &&
    !/[\u0000-\u001f\u007f]/.test(p.nickname) &&
    ["easy", "medium", "hard"].includes(p.difficulty) &&
    integer(p.startedAt, 1, now + 60000) &&
    integer(p.lastPlayedAt, p.startedAt, now + 60000) &&
    (p.completedAt === null ||
      integer(p.completedAt, p.startedAt, now + 60000)) &&
    integer(p.activeMs, 0, 365 * 86400000) &&
    typeof p.autoUsed === "boolean" &&
    integer(p.moves, 0, 1000000) &&
    integer(p.filled, 0, 81) &&
    integer(p.revision, 1, Number.MAX_SAFE_INTEGER) &&
    typeof p.playing === "boolean" &&
    (p.days === undefined ||
      (Array.isArray(p.days) &&
        p.days.length <= 366 &&
        new Set(p.days.map((d) => d?.day)).size === p.days.length &&
        p.days.every(
          (d) =>
            d &&
            /^\d{4}-\d{2}-\d{2}$/.test(d.day) &&
            Number.isFinite(Date.parse(d.day + "T00:00:00Z")) &&
            new Date(Date.parse(d.day + "T00:00:00Z"))
              .toISOString()
              .slice(0, 10) === d.day &&
            d.day <= new Date(now + 19800000).toISOString().slice(0, 10) &&
            integer(d.activeMs, 0, 86400000),
        ) &&
        p.days.reduce((sum, d) => sum + d.activeMs, 0) <= p.activeMs))
  );
}
async function tokenHash(token) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function handleMetrics(request, env, assets) {
  const url = new URL(request.url);
  if (url.pathname === "/api/metrics") {
    if (request.method !== "POST")
      return metricsJson({ error: "Method not allowed" }, 405);
    if (
      request.headers.get("Origin") &&
      request.headers.get("Origin") !== url.origin
    )
      return metricsJson({ error: "Origin not allowed" }, 403);
    if (!request.headers.get("Content-Type")?.startsWith("application/json"))
      return metricsJson({ error: "JSON required" }, 415);
    if (!env.DB)
      return metricsJson({ error: "Metrics are not configured" }, 503);
    try {
      const text = await request.text();
      if (text.length > 30000)
        return metricsJson({ error: "Batch too large" }, 413);
      const data = JSON.parse(text);
      const now = Date.now();
      if (
        !Array.isArray(data.plays) ||
        data.plays.length < 1 ||
        data.plays.length > 20 ||
        !data.plays.every((p) => validPlay(p, now))
      )
        return metricsJson({ error: "Invalid play summary" }, 400);
      const statements = [];
      for (const p of data.plays) {
        const hash = await tokenHash(p.token);
        statements.push(
          env.DB.prepare(
            `INSERT INTO plays
          (id,token_hash,player_id,nickname,difficulty,started_at,completed_at,active_ms,auto_used,moves,filled,revision,playing,presence_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET
            nickname=excluded.nickname,
            completed_at=COALESCE(plays.completed_at,excluded.completed_at),
            active_ms=MAX(plays.active_ms,excluded.active_ms),
            auto_used=MAX(plays.auto_used,excluded.auto_used),
            moves=MAX(plays.moves,excluded.moves), filled=excluded.filled,
            revision=excluded.revision, playing=excluded.playing,
            presence_at=excluded.presence_at, updated_at=excluded.updated_at
          WHERE plays.token_hash=excluded.token_hash AND plays.player_id=excluded.player_id AND excluded.revision>plays.revision`,
          ).bind(
            p.id,
            hash,
            p.playerId,
            p.nickname.trim(),
            p.difficulty,
            p.startedAt,
            p.completedAt,
            p.activeMs,
            Number(p.autoUsed),
            p.moves,
            p.filled,
            p.revision,
            Number(p.playing && p.completedAt === null),
            now,
            p.lastPlayedAt,
          ),
        );
        if (p.days?.length)
          statements.push(
            env.DB.prepare(
              `INSERT INTO play_days (play_id,player_id,day,active_ms)
          SELECT ?,?,json_extract(value,'$.day'),json_extract(value,'$.activeMs') FROM json_each(?)
          WHERE EXISTS(SELECT 1 FROM plays WHERE id=? AND token_hash=? AND player_id=? AND revision=?)
          ON CONFLICT(play_id,day) DO UPDATE SET active_ms=MAX(play_days.active_ms,excluded.active_ms)`,
            ).bind(
              p.id,
              p.playerId,
              JSON.stringify(p.days),
              p.id,
              hash,
              p.playerId,
              p.revision,
            ),
          );
      }
      await env.DB.batch(statements);
      return metricsJson({ ok: true });
    } catch {
      return metricsJson({ error: "Metrics temporarily unavailable" }, 503);
    }
  }
  if (!(await isAdmin(request, env)))
    return metricsJson({ error: "Admin sign-in required" }, 401);
  if (url.pathname === "/admin/api/stats") {
    if (request.method !== "GET")
      return metricsJson({ error: "Method not allowed" }, 405);
    if (!env.DB)
      return metricsJson({ error: "Metrics are not configured" }, 503);
    const days = Number(url.searchParams.get("days") || 30);
    if (![7, 30, 90, 365].includes(days))
      return metricsJson({ error: "Invalid range" }, 400);
    const now = Date.now(),
      since = now - days * 86400000;
    const player = url.searchParams.get("player");
    if (player && !uuidPattern.test(player))
      return metricsJson({ error: "Invalid player" }, 400);
    try {
      const scope = player
        ? "started_at >= ? AND player_id = ?"
        : "started_at >= ?";
      const args = player ? [since, player] : [since];
      const queries = [
        env.DB.prepare(
          `SELECT COUNT(*) AS started, COUNT(completed_at) AS completed,
          COUNT(DISTINCT player_id) AS players, COALESCE(SUM(active_ms),0) AS active_ms,
          AVG(CASE WHEN completed_at IS NOT NULL THEN active_ms END) AS average_ms,
          MIN(CASE WHEN completed_at IS NOT NULL THEN active_ms END) AS best_ms
          FROM plays WHERE ${scope}`,
        ).bind(...args),
        env.DB.prepare(
          `SELECT difficulty, COUNT(*) AS started, COUNT(completed_at) AS completed,
          AVG(CASE WHEN completed_at IS NOT NULL THEN active_ms END) AS average_ms,
          MIN(CASE WHEN completed_at IS NOT NULL THEN active_ms END) AS best_ms
          FROM plays WHERE ${scope} GROUP BY difficulty`,
        ).bind(...args),
        env.DB.prepare(
          `SELECT player_id, nickname, difficulty, active_ms, filled, presence_at
          FROM plays WHERE playing=1 AND completed_at IS NULL AND presence_at > ? ORDER BY presence_at DESC LIMIT 100`,
        ).bind(now - 90000),
        env.DB.prepare(
          `SELECT p.player_id,
          (SELECT nickname FROM plays n WHERE n.player_id=p.player_id ORDER BY updated_at DESC LIMIT 1) AS nickname,
          COUNT(*) AS started, COUNT(completed_at) AS completed, SUM(active_ms) AS active_ms,
          AVG(CASE WHEN completed_at IS NOT NULL THEN active_ms END) AS average_ms,
          MIN(CASE WHEN completed_at IS NOT NULL THEN active_ms END) AS best_ms,
          MAX(updated_at) AS last_played
          FROM plays p WHERE ${scope} GROUP BY p.player_id ORDER BY last_played DESC LIMIT 100`,
        ).bind(...args),
        env.DB.prepare(
          `SELECT id, player_id, nickname, difficulty, started_at, completed_at,
          active_ms, auto_used, moves, filled FROM plays WHERE ${scope} ORDER BY started_at DESC LIMIT 100`,
        ).bind(...args),
      ];
      const today = new Date(now + 19800000).toISOString().slice(0, 10);
      const firstDay = new Date(
        Date.parse(today + "T00:00:00Z") - (days - 1) * 86400000,
      )
        .toISOString()
        .slice(0, 10);
      queries.push(
        env.DB.prepare(
          `SELECT day,SUM(active_ms) AS activeMs FROM play_days WHERE day>=? AND day<=? ${player ? "AND player_id=?" : ""} GROUP BY day ORDER BY day`,
        ).bind(...(player ? [firstDay, today, player] : [firstDay, today])),
      );
      const results = await env.DB.batch(queries);
      return metricsJson({
        now,
        days,
        localPreview: env.LOCAL_ADMIN === "1",
        totals: results[0].results[0],
        difficulties: results[1].results,
        presence: results[2].results,
        players: results[3].results,
        recent: results[4].results,
        daily: results[5].results,
        timezone: "Asia/Kolkata",
      });
    } catch {
      return metricsJson({ error: "Stats temporarily unavailable" }, 503);
    }
  }
  if (!["/admin", "/admin/", "/admin.html"].includes(url.pathname))
    return metricsJson({ error: "Not found" }, 404);
  if (!["GET", "HEAD"].includes(request.method))
    return metricsJson({ error: "Method not allowed" }, 405);
  const asset = assets["/admin.html"];
  if (!asset) return metricsJson({ error: "Dashboard unavailable" }, 503);
  return new Response(
    request.method === "HEAD"
      ? null
      : Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0)),
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "same-origin",
      },
    },
  );
}
