import { handleMetrics } from "./metrics.mjs";
const difficulties = new Set(["easy", "medium", "hard"]);
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export async function handleRequest(request, env, assets) {
  const url = new URL(request.url);
  if (url.pathname === "/api/metrics" || url.pathname === "/admin.html" || url.pathname === "/admin" || url.pathname.startsWith("/admin/"))
    return handleMetrics(request, env, assets);
  if (url.pathname === "/api/puzzle") {
    if (request.method !== "GET")
      return json({ error: "Method not allowed" }, 405);
    const difficulty = url.searchParams.get("difficulty");
    if (!difficulties.has(difficulty))
      return json({ error: "Choose easy, medium, or hard." }, 400);
    if (!env.YOUDOSUDOKU_API_KEY)
      return json({ error: "Puzzle service is not configured." }, 503);
    try {
      const result = await fetch("https://www.youdosudoku.com/api/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.YOUDOSUDOKU_API_KEY,
        },
        body: JSON.stringify({ difficulty, solution: false, array: false }),
        signal: AbortSignal.timeout(7000),
      });
      if (!result.ok)
        return json(
          { error: "Puzzle service is temporarily unavailable." },
          502,
        );
      const data = await result.json();
      if (typeof data.puzzle !== "string" || !/^[0-9.]{81}$/.test(data.puzzle))
        return json(
          { error: "Puzzle service returned an unexpected response." },
          502,
        );
      return json({ difficulty, puzzle: data.puzzle.replaceAll(".", "0") });
    } catch {
      return json({ error: "Puzzle service is temporarily unavailable." }, 502);
    }
  }
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed", { status: 405 });
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const asset = assets[path];
  if (!asset) return new Response("Not found", { status: 404 });
  const bytes = Uint8Array.from(atob(asset.body), (c) => c.charCodeAt(0));
  return new Response(request.method === "HEAD" ? null : bytes, {
    headers: {
      "Content-Type": asset.type,
      "Cache-Control":
        path === "/sw.js" || path === "/index.html"
          ? "no-cache"
          : path.startsWith("/assets/")
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600",
      ...(path === "/sw.js" ? { "Service-Worker-Allowed": "/" } : {}),
    },
  });
}
