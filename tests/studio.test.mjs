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

/** Read the NDJSON stream a generate/edit call answers with; returns all lines and the last one. */
async function lines(res) {
  assert.equal(res.headers.get("Content-Type"), "application/x-ndjson; charset=utf-8");
  const all = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  return { all, last: all.at(-1) };
}

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
  const { last } = await lines(res);
  assert.deepEqual(last, { type: "done", svgs: ["<svg/>"], images: [{ id: null, url: null }], chat: null, note: "Here's your image.", sandbox: true, credits: 1 });
  assert.equal(calls[0].url, "https://api.quiver.ai/v1/svgs/generations");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test_123");
  assert.deepEqual(calls[0].body, { model: "arrow-2", prompt: "red cap", n: 4, instructions: "flat", references: [{ base64: "iVBORw0KGgo=" }], stream: true });
});

test("a follow-up message edits the chosen SVG", async () => {
  fakeQuiver();
  const res = await worker.fetch(post("edit", { prompt: "make it blue", svg: "<svg><rect/></svg>", model: "arrow-2-telos" }), env());
  assert.equal(res.status, 200);
  assert.equal(calls[0].url, "https://api.quiver.ai/v1/svgs/edits");
  assert.deepEqual(calls[0].body, { model: "arrow-2-telos", prompt: "make it blue", svg: "<svg><rect/></svg>", stream: true });
  assert.equal((await lines(res)).last.note, "Here's the changed version.");
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
  const { last } = await lines(res);
  assert.equal(last.type, "error");
  assert.equal(last.status, 402);
  assert.match(last.error, /out of credits/);
});

/** Fake QuiverAI answering with server-sent events. */
function fakeStream(events) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const text = events.map(([event, data]) => (event ? `event: ${event}\n` : "") + `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`).join("");
    // Split mid-event to check the parser joins chunks.
    const enc = new TextEncoder();
    const half = Math.floor(text.length / 2);
    const body = new ReadableStream({ start(c) { c.enqueue(enc.encode(text.slice(0, half))); c.enqueue(enc.encode(text.slice(half))); c.close(); } });
    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  };
}

test("a streamed drawing shows progress and drafts, then the finished SVG", async () => {
  fakeStream([
    ["generating", { id: "a", index: 0 }],
    ["reasoning", { id: "a", index: 0, text: "thinking about caps" }],
    ["draft", { id: "a", index: 0, svg: "<svg><path/></svg>" }],
    ["content", { id: "a", index: 0, svg: "<svg viewBox='0 0 1 1'>" }],
    ["content", { id: "a", index: 0, delta: "<circle/></svg>" }],
    ["", { credits: 3 }],
    ["", "[DONE]"],
  ]);
  const { all, last } = await lines(await worker.fetch(post("generate", { prompt: "cap" }), env()));
  assert.deepEqual(all.filter((l) => l.type === "progress").map((l) => l.phase), ["generating", "reasoning", "draft", "content"]);
  assert.deepEqual(all.find((l) => l.type === "draft"), { type: "draft", index: 0, svg: "<svg><path/></svg>" });
  assert.equal(last.type, "done");
  assert.deepEqual(last.svgs, ["<svg viewBox='0 0 1 1'><circle/></svg>"]);
  assert.equal(last.credits, 3);
});

test("a stream with no SVG ends with an error line, not silence", async () => {
  fakeStream([["generating", { id: "a" }], ["", "[DONE]"]]);
  const errors = console.error;
  console.error = () => {};
  try {
    const { last } = await lines(await worker.fetch(post("generate", { prompt: "cap" }), env()));
    assert.equal(last.type, "error");
    assert.match(last.error, /didn't return an SVG/);
  } finally {
    console.error = errors;
  }
});

/** In-memory stand-in for the STUDIO_IMAGES KV namespace. */
function fakeKv() {
  const store = new Map();
  return {
    store,
    put: async (key, value, { metadata } = {}) => void store.set(key, { value, metadata }),
    get: async (key) => store.get(key)?.value ?? null,
    getWithMetadata: async (key) => store.get(key) ?? { value: null, metadata: null },
    list: async ({ prefix = "", limit = 1000, cursor } = {}) => {
      const names = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const keys = names.slice(start, start + limit).map((name) => ({ name, metadata: store.get(name).metadata }));
      const done = start + limit >= names.length;
      return { keys, list_complete: done, cursor: done ? undefined : String(start + limit) };
    },
  };
}
const TEMPLATE_HTML = `<link rel="canonical" href="https://gohappyclub.com/studio/image/"><p class="prompt">STUDIO_PROMPT</p>
<img src="STUDIO_SVG_URL" alt="STUDIO_ALT" loading="lazy"><a href="STUDIO_SVG_URL" download="STUDIO_FILENAME">x</a>
<a href="/studio/?from=STUDIO_ID">change</a> on STUDIO_DATE <a href="STUDIO_CHAT_URL">chat</a>`;
const siteAssets = {
  fetch: async (req) => {
    const path = new URL(req.url).pathname;
    if (path === "/studio/image/") return new Response(TEMPLATE_HTML, { headers: { "Content-Type": "text/html" } });
    if (path === "/studio/list/") return new Response("<ol>STUDIO_LIST_ITEMS</ol><p>STUDIO_LIST_MORE</p>", { headers: { "Content-Type": "text/html" } });
    if (path === "/studio/") return new Response("studio page", { headers: { "Content-Type": "text/html" } });
    return new Response("site 404 page", { status: 404, headers: { "Content-Type": "text/html" } });
  },
};

test("every generated image is saved and gets its own page and .svg link", async () => {
  fakeQuiver(200, { id: "r", created: 1, data: [{ svg: "<svg><circle/></svg>" }, { svg: "<svg><rect/></svg>" }] });
  const kv = fakeKv();
  const e = env({ STUDIO_IMAGES: kv, ASSETS: siteAssets, QUIVERAI_API_KEY: "sk_live_1" });
  const res = await worker.fetch(post("generate", { prompt: "red cap\n\nThe product is a cap.", title: "Red cap <b>bold</b>", n: 2 }), e);
  const { images, sandbox } = (await lines(res)).last;
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

test("each chat is saved with its own URL and listed at /studio/list/", async () => {
  const kv = fakeKv();
  const e = env({ STUDIO_IMAGES: kv, ASSETS: siteAssets });
  fakeQuiver(200, { data: [{ svg: "<svg><circle/></svg>" }] });
  const first = (await lines(await worker.fetch(post("generate", { prompt: "red cap, flat", message: "red cap", title: "Red cap" }), e))).last;
  assert.match(first.chat, /^[A-Za-z0-9]{10}$/);
  const chatId = first.chat;
  assert.equal(kv.store.get(`svg:${first.images[0].id}`).metadata.chat, chatId);

  // A follow-up in the same chat adds to it instead of starting another.
  fakeQuiver(200, { data: [{ svg: "<svg><rect/></svg>" }] });
  const second = (await lines(await worker.fetch(post("edit", { prompt: "make it blue", svg: "<svg><circle/></svg>", chat: chatId }), e))).last;
  assert.equal(second.chat, chatId);

  const chat = await (await worker.fetch(new Request(`${ORIGIN}/api/studio/chat/${chatId}`), e)).json();
  assert.equal(chat.title, "red cap");
  assert.deepEqual(chat.messages.map((m) => m.role), ["user", "bot", "user", "bot"]);
  assert.equal(chat.messages[3].images[0].svg, "<svg><rect/></svg>");
  assert.equal(chat.messages[3].images[0].url, `/studio/i/${second.images[0].id}/`);

  const page = await worker.fetch(new Request(`${ORIGIN}/studio/c/${chatId}/`), e);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), "studio page");
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/studio/c/${chatId}`), e)).status, 301);
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/studio/c/AAAAAAAAAA/`), e)).status, 404);
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/api/studio/chat/AAAAAAAAAA`), e)).status, 404);

  const imageHtml = await (await worker.fetch(new Request(`${ORIGIN}/studio/i/${first.images[0].id}/`), e)).text();
  assert.ok(imageHtml.includes(`href="/studio/c/${chatId}/"`), "image page links back to its chat");

  // A second, newer chat is listed first.
  fakeQuiver(200, { data: [{ svg: "<svg/>" }] });
  await new Promise((r) => setTimeout(r, 2));
  const other = (await lines(await worker.fetch(post("generate", { prompt: "tote <bag>" }), e))).last;
  assert.notEqual(other.chat, chatId);
  const list = await worker.fetch(new Request(`${ORIGIN}/studio/list/`), e);
  assert.equal(list.status, 200);
  assert.equal(list.headers.get("X-Robots-Tag"), "noindex, nofollow");
  const html = await list.text();
  assert.ok(html.indexOf(`/studio/c/${other.chat}/`) < html.indexOf(`/studio/c/${chatId}/`), "newest first");
  assert.ok(html.includes("tote &lt;bag&gt;") && html.includes("2 images") && html.includes(`/studio/i/${second.images[0].id}.svg`));
  assert.ok(!html.includes("STUDIO_"));
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/studio/list`), e)).status, 301);
});

test("the list page says so when there are no chats yet", async () => {
  const html = await (await worker.fetch(new Request(`${ORIGIN}/studio/list/`), env({ STUDIO_IMAGES: fakeKv(), ASSETS: siteAssets }))).text();
  assert.match(html, /No chats yet/);
});

test("a chat started from a saved image begins with that image", async () => {
  const kv = fakeKv();
  const e = env({ STUDIO_IMAGES: kv, ASSETS: siteAssets });
  fakeQuiver(200, { data: [{ svg: "<svg><circle/></svg>" }] });
  const src = (await lines(await worker.fetch(post("generate", { prompt: "cap" }), e))).last.images[0].id;
  fakeQuiver(200, { data: [{ svg: "<svg><rect/></svg>" }] });
  const done = (await lines(await worker.fetch(post("edit", { prompt: "blue", svg: "<svg><circle/></svg>", source: src }), e))).last;
  const chat = await (await worker.fetch(new Request(`${ORIGIN}/api/studio/chat/${done.chat}`), e)).json();
  assert.deepEqual(chat.messages.map((m) => m.role), ["bot", "user", "bot"]);
  assert.equal(chat.messages[0].images[0].id, src);
});
