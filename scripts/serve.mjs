import { createServer } from "node:http";
import { localDatabase } from "./d1-local.mjs";
import worker from "../dist/server/index.js";
const DB = localDatabase(".wrangler/local-preview/metrics.sqlite");
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 30000) {
        res.writeHead(413);
        res.end("Request too large");
        return;
      }
      chunks.push(chunk);
    }
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const response = await worker.fetch(
      new Request(url, { method: req.method, headers: req.headers, body }),
      { ...process.env, DB, LOCAL_ADMIN: "1" },
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end("Server error");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`SansDoku preview: http://127.0.0.1:${port}/`),
);
