// gohappyclub.com Product Image Studio worker (sites/gohappyclub.com/_worker.js), with QuiverAI faked.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "../sites/gohappyclub.com/_worker.js";

const ORIGIN = "https://gohappyclub.com";
const env = (extra = {}) => ({
  QUIVERAI_API_KEY: "sk_test_123",
  ASSETS: { fetch: async (req) => new Response(`asset ${new URL(req.url).pathname}`, { headers: { "Content-Type": "text/html" } }) },
  ...extra,
});
const post = (route, body, headers = {}) =>
  new Request(`${ORIGIN}/api/studio/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });

const realFetch = globalThis.fetch;
let calls;
function fakeQuiver(status = 200, body = { id: "r", created: 1, data: [{ id: "a", mime_type: "image/svg+xml", svg: "<svg/>" }], credits: 1 }) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
}
afterEach(() => (globalThis.fetch = realFetch));

test("pages outside the studio are served as plain files", async () => {
  const res = await worker.fetch(new Request(`${ORIGIN}/products/custom-hats/`), env());
  assert.equal(await res.text(), "asset /products/custom-hats/");
});

test("anyone can open the studio page, which stays out of search", async () => {
  const res = await worker.fetch(new Request(`${ORIGIN}/studio/`), env());
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "asset /studio/");
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow");
});

test("a new image goes to QuiverAI text-to-SVG with the key kept server-side", async () => {
  fakeQuiver();
  const res = await worker.fetch(post("generate", { prompt: " red cap ", instructions: "flat", n: 9, model: "nope", reference: "data:image/png;base64,iVBORw0KGgo=" }), env());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { svgs: ["<svg/>"], credits: 1 });
  assert.equal(calls[0].url, "https://api.quiver.ai/v1/svgs/generations");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test_123");
  assert.deepEqual(calls[0].body, { model: "arrow-2", prompt: "red cap", n: 4, instructions: "flat", references: [{ base64: "iVBORw0KGgo=" }] });
});

test("a follow-up message edits the chosen SVG", async () => {
  fakeQuiver();
  const res = await worker.fetch(post("edit", { prompt: "make it blue", svg: "<svg><rect/></svg>", model: "arrow-2-telos" }), env());
  assert.equal(res.status, 200);
  assert.equal(calls[0].url, "https://api.quiver.ai/v1/svgs/edits");
  assert.deepEqual(calls[0].body, { model: "arrow-2-telos", prompt: "make it blue", svg: "<svg><rect/></svg>" });
});

test("bad requests never reach QuiverAI", async () => {
  fakeQuiver();
  assert.equal((await worker.fetch(post("generate", { prompt: "  " }), env())).status, 400);
  assert.equal((await worker.fetch(post("edit", { prompt: "x" }), env())).status, 400);
  assert.equal((await worker.fetch(post("generate", { prompt: "x" }, { Origin: "https://evil.example" }), env())).status, 403);
  const noOrigin = post("generate", { prompt: "x" });
  noOrigin.headers.delete("Origin");
  assert.equal((await worker.fetch(noOrigin, env())).status, 403);
  assert.equal((await worker.fetch(post("generate", { prompt: "x" }, { "Content-Type": "text/plain" }), env())).status, 415);
  assert.equal((await worker.fetch(post("generate", { prompt: "x" }), env({ QUIVERAI_API_KEY: "" }))).status, 503);
  assert.equal((await worker.fetch(post("other", { prompt: "x" }), env())).status, 404);
  assert.equal(calls.length, 0);
});

test("QuiverAI errors come back as plain sentences", async () => {
  fakeQuiver(402, { code: "insufficient_credits", message: "no credits", status: 402, request_id: "q" });
  const res = await worker.fetch(post("generate", { prompt: "cap" }), env());
  assert.equal(res.status, 402);
  assert.match((await res.json()).error, /out of credits/);
});
