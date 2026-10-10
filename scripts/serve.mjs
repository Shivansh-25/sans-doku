import { createServer } from "node:http";
import worker from "../dist/server/index.js";
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );
    const response = await worker.fetch(
      new Request(url, { method: req.method, headers: req.headers }),
      process.env,
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
