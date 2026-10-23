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
  assert.deepEqual(await res.json(), { svgs: ["<svg/>"], images: [{ id: null, url: null }], sandbox: true, credits: 1 });
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

/** In-memory stand-in for the STUDIO_IMAGES KV namespace. */
function fakeKv() {
  const store = new Map();
  return {
    store,
    put: async (key, value, { metadata } = {}) => void store.set(key, { value, metadata }),
    getWithMetadata: async (key) => store.get(key) ?? { value: null, metadata: null },
  };
}
const TEMPLATE_HTML = `<link rel="canonical" href="https://gohappyclub.com/studio/image/"><p class="prompt">STUDIO_PROMPT</p>
<img src="STUDIO_SVG_URL" alt="STUDIO_ALT" loading="lazy"><a href="STUDIO_SVG_URL" download="STUDIO_FILENAME">x</a>
<a href="/studio/?from=STUDIO_ID">change</a> on STUDIO_DATE`;
const siteAssets = {
  fetch: async (req) => {
    const path = new URL(req.url).pathname;
    if (path === "/studio/image/") return new Response(TEMPLATE_HTML, { headers: { "Content-Type": "text/html" } });
    return new Response("site 404 page", { status: 404, headers: { "Content-Type": "text/html" } });
  },
};

test("every generated image is saved and gets its own page and .svg link", async () => {
  fakeQuiver(200, { id: "r", created: 1, data: [{ svg: "<svg><circle/></svg>" }, { svg: "<svg><rect/></svg>" }] });
  const kv = fakeKv();
  const e = env({ STUDIO_IMAGES: kv, ASSETS: siteAssets, QUIVERAI_API_KEY: "sk_live_1" });
  const res = await worker.fetch(post("generate", { prompt: "red cap\n\nThe product is a cap.", title: "Red cap <b>bold</b>", n: 2 }), e);
  const { images, sandbox } = await res.json();
  assert.equal(sandbox, false);
  assert.equal(images.length, 2);
  assert.notEqual(images[0].id, images[1].id);
  for (const { id, url } of images) {
    assert.match(id, /^[A-Za-z0-9]{10}$/);
    assert.equal(url, `/studio/i/${id}/`);
  }
  assert.equal(kv.store.get(`svg:${images[0].id}`).metadata.prompt, "Red cap <b>bold</b>");

  const file = await worker.fetch(new Request(`${ORIGIN}/studio/i/${images[1].id}.svg`), e);
  assert.equal(await file.text(), "<svg><rect/></svg>");
  assert.equal(file.headers.get("Content-Type"), "image/svg+xml; charset=utf-8");
  assert.match(file.headers.get("Content-Security-Policy"), /default-src 'none'.*sandbox/);

  const page = await worker.fetch(new Request(`${ORIGIN}/studio/i/${images[0].id}/`), e);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex, nofollow");
  const html = await page.text();
  assert.ok(html.includes(`href="https://gohappyclub.com/studio/i/${images[0].id}/"`), "canonical points at the image's own page");
  assert.ok(html.includes("Red cap &lt;b&gt;bold&lt;/b&gt;"), "prompt is escaped");
  assert.ok(html.includes(`src="/studio/i/${images[0].id}.svg"`));
  assert.ok(html.includes(`download="red-cap-b-bold-b.svg"`));
  assert.ok(html.includes(`/studio/?from=${images[0].id}`));
  assert.ok(!html.includes("STUDIO_") && !html.includes('loading="lazy"'));

  const bare = await worker.fetch(new Request(`${ORIGIN}/studio/i/${images[0].id}`), e);
  assert.equal(bare.status, 301);
});

test("unknown images and the bare template are not found", async () => {
  const e = env({ STUDIO_IMAGES: fakeKv(), ASSETS: siteAssets });
  const page = await worker.fetch(new Request(`${ORIGIN}/studio/i/AAAAAAAAAA/`), e);
  assert.equal(page.status, 404);
  assert.equal(await page.text(), "site 404 page");
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/studio/i/AAAAAAAAAA.svg`), e)).status, 404);
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/studio/image/`), e)).status, 404);
});
