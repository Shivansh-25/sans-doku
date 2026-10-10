import {
  readFile,
  readdir,
  mkdir,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { extname, join, relative } from "node:path";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
const assets = {};
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path);
    else {
      const content = await readFile(path);
      assets["/" + relative("dist/client", path).split("\\").join("/")] = {
        type: types[extname(path)] || "application/octet-stream",
        body: content.toString("base64"),
      };
    }
  }
}
await collect("dist/client");
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
const handler = (
  await Promise.all(
    ["access", "metrics", "handler"].map((name) =>
      readFile(`worker/${name}.mjs`, "utf8"),
    ),
  )
)
  .map((source) => source.replace(/^import .* from ['"].*\.mjs['"];?\n/gm, ""))
  .join("\n");
await writeFile(
  "dist/server/index.js",
  `${handler}\nconst assets = ${JSON.stringify(assets)};\nexport default { fetch(request, env) { return handleRequest(request, env, assets); } };\n`,
);
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
console.log(
  `Built lightweight Worker with ${Object.keys(assets).length} embedded frontend assets.`,
);
