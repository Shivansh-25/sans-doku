import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../worker/handler.mjs";
const request = (difficulty: string) =>
  new Request(`https://sansdoku.test/api/puzzle?difficulty=${difficulty}`);
test("API rejects invalid difficulty and missing credentials", async () => {
  assert.equal((await handleRequest(request("expert"), {}, {})).status, 400);
  assert.equal((await handleRequest(request("easy"), {}, {})).status, 503);
});
test("API authenticates upstream, returns puzzle only, and does not cache it", async () => {
  const previous = globalThis.fetch;
  let passedKey = "";
  globalThis.fetch = async (_url, options) => {
    passedKey = new Headers(options?.headers).get("x-api-key") || "";
    assert.equal(JSON.parse(options?.body as string).difficulty, "medium");
    return Response.json({
      puzzle: ".".repeat(81),
      solution: "never-expose-solution",
    });
  };
  try {
    const result = await handleRequest(
      request("medium"),
      { YOUDOSUDOKU_API_KEY: "test-secret" },
      {},
    );
    assert.equal(passedKey, "test-secret");
    assert.equal(result.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await result.json(), {
      difficulty: "medium",
      puzzle: "0".repeat(81),
    });
  } finally {
    globalThis.fetch = previous;
  }
});
test("API handles upstream errors without exposing provider data or key", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ error: "provider details test-secret" }, { status: 401 });
  try {
    const result = await handleRequest(
      request("hard"),
      { YOUDOSUDOKU_API_KEY: "test-secret" },
      {},
    );
    assert.equal(result.status, 502);
    assert.ok(!(await result.text()).includes("test-secret"));
  } finally {
    globalThis.fetch = previous;
  }
});
