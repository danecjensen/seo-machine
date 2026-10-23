// Cloudflare Pages "advanced mode" worker for gohappyclub.com. _routes.json sends only the
// Product Image Studio (/studio/ and /api/studio/*) here; every other page is served as a plain
// static file and never runs this code, so the public site's speed is unchanged.
//
// The studio is a small chat that turns product descriptions into SVGs with QuiverAI
// (https://docs.quiver.ai/api-reference). The API key stays here on the server.
//
// The studio is open to anyone. Secret on the Cloudflare Pages project gohappyclub-com
// (Settings > Variables and Secrets):
//   QUIVERAI_API_KEY  QuiverAI API key (sk_live_... or a free sk_test_... sandbox key).
//
// Every image the studio makes is saved in the KV namespace bound as STUDIO_IMAGES (set up by
// scripts/deploy.mjs from `cloudflare.kv` in _config.yml) and gets its own link:
//   /studio/i/<id>/     a page with the image, its prompt, a download button and "change it"
//   /studio/i/<id>.svg  the SVG file itself
// Every chat is saved there too and has its own URL, /studio/c/<id>/ (the page moves there when the
// chat's first image arrives). /studio/list/ lists every chat, newest first.

const QUIVER = "https://api.quiver.ai/v1";
const MODELS = ["arrow-2", "arrow-2-telos"];
const MAX_REFERENCE_CHARS = 8_000_000; // ~6 MB image as base64
const MAX_SVG_CHARS = 200_000; // QuiverAI's edit limit
const NO_INDEX = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };

const IMAGE_PAGE = /^\/studio\/i\/([A-Za-z0-9]{10})\/?$/;
const IMAGE_FILE = /^\/studio\/i\/([A-Za-z0-9]{10})\.svg$/;
const CHAT_PAGE = /^\/studio\/c\/([A-Za-z0-9]{10})\/?$/;
const CHAT_API = /^\/api\/studio\/chat\/([A-Za-z0-9]{10})$/;
const ID = /^[A-Za-z0-9]{10}$/;
const TEMPLATE = "/studio/image/"; // studio-image.html, filled in for each saved image
const LIST = "/studio/list/"; // studio-list.html, filled in with the saved chats
const LIST_PAGE_SIZE = 50;
// The SVGs come from QuiverAI, but never let one run scripts or load anything on this domain.
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; sandbox";

const isStudio = (path) => path === "/studio" || path.startsWith("/studio/") || path.startsWith("/api/studio/");

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!isStudio(url.pathname)) return env.ASSETS.fetch(request);

    if (url.pathname.startsWith("/api/studio/")) {
      try {
        return await api(request, env, url, ctx);
      } catch (e) {
        return json(500, { error: `Something went wrong: ${e.message}` });
      }
    }

    if (request.method === "GET" || request.method === "HEAD") {
      let m;
      if ((m = url.pathname.match(IMAGE_FILE))) return imageFile(env, m[1]);
      if ((m = url.pathname.match(IMAGE_PAGE))) {
        if (!url.pathname.endsWith("/")) return Response.redirect(`${url.origin}${url.pathname}/`, 301);
        return imagePage(request, env, url, m[1]);
      }
      if (url.pathname === TEMPLATE || url.pathname === TEMPLATE.slice(0, -1)) return notFound(request, env, url);
      if ((m = url.pathname.match(CHAT_PAGE))) {
        if (!url.pathname.endsWith("/")) return Response.redirect(`${url.origin}${url.pathname}/`, 301);
        if (!(await loadChat(env, m[1]))) return notFound(request, env, url);
        // The studio page itself; its script sees the chat id in the URL and loads the chat.
        return noIndex(await env.ASSETS.fetch(new Request(new URL("/studio/", url.origin), { headers: request.headers })));
      }
      if (url.pathname === "/studio/list") return Response.redirect(`${url.origin}${LIST}`, 301);
      if (url.pathname === LIST) return listPage(request, env, url);
    }

    return noIndex(await env.ASSETS.fetch(request));
  },
};

function noIndex(page) {
  const res = new Response(page.body, page);
  for (const [k, v] of Object.entries(NO_INDEX)) res.headers.set(k, v);
  return res;
}

async function api(request, env, url, ctx) {
  const chatRoute = url.pathname.match(CHAT_API);
  if (chatRoute && request.method === "GET") return chatJson(env, chatRoute[1]);
  if (request.method !== "POST") return json(405, { error: "Use POST." });
  // Only the studio page itself may call this (browsers always send Origin on a POST), so other
  // websites can't use it as a free QuiverAI proxy.
  if (request.headers.get("Origin") !== url.origin) return json(403, { error: "Only the studio page can use this." });
  if (!(request.headers.get("Content-Type") ?? "").includes("application/json")) {
    return json(415, { error: "Send JSON." });
  }
  if (!env.QUIVERAI_API_KEY) {
    return json(503, { error: "QUIVERAI_API_KEY isn't set on the Cloudflare Pages project yet." });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "The request body isn't valid JSON." });
  }

  const route = url.pathname.slice("/api/studio/".length);
  const built = route === "generate" ? generation(body) : route === "edit" ? edit(body) : { status: 404, error: "Unknown studio action." };
  if (built.error) return json(built.status ?? 400, { error: built.error });

  // Real drawings can take minutes, so the answer is streamed: one JSON object per line, with
  // progress (and draft previews) while QuiverAI works, then {type:"done"} or {type:"error"}.
  // Bytes keep flowing the whole time, so nothing along the way gives up on a quiet connection.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const send = (obj) => writer.write(encoder.encode(JSON.stringify(obj) + "\n")).catch(() => {});
  const job = (async () => {
    const heartbeat = setInterval(() => send({ type: "wait" }), 10_000);
    try {
      const result = await callQuiver(env, built, send);
      if (result.error) return await send({ type: "error", status: result.status, error: result.error });
      await send({ type: "done", ...(await finish(env, route, body, result)) });
    } catch (e) {
      console.error("studio:", e);
      await send({ type: "error", status: 500, error: `Something went wrong: ${e.message}` });
    } finally {
      clearInterval(heartbeat);
      await writer.close().catch(() => {});
    }
  })();
  ctx?.waitUntil?.(job);
  return new Response(readable, { headers: { ...NO_INDEX, "Content-Type": "application/x-ndjson; charset=utf-8" } });
}

/** Save the new SVGs and the chat messages; the payload of the final {type:"done"} line. */
async function finish(env, route, body, { svgs, credits, usage }) {
  const about = clean(body.title, 300) || clean(body.prompt, 300);
  const message = clean(body.message, 2000) || clean(body.prompt, 2000);
  const chat = await openChat(env, body.chat, message, body.source);
  const images = await Promise.all(svgs.map((svg) => save(env, svg, about, chat?.id)));
  // A sk_test_ key gets QuiverAI's free "SANDBOX RESULT" placeholders, not real drawings.
  const sandbox = env.QUIVERAI_API_KEY.startsWith("sk_test_");
  const note = route === "edit" ? "Here's the changed version."
    : svgs.length > 1 ? `Here are ${svgs.length} options. Pick one to keep working on it.` : "Here's your image.";
  if (chat) {
    chat.messages.push({ role: "user", text: message }, { role: "bot", images: images.map((i) => i.id), prompt: about, note, sandbox });
    await saveChat(env, chat);
  }
  return { svgs, images, chat: chat?.id ?? null, note, sandbox, credits, usage };
}

/** Call QuiverAI with streaming on. Returns { svgs, credits, usage } or { status, error }. */
async function callQuiver(env, built, send) {
  const res = await fetch(`${QUIVER}/${built.path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.QUIVERAI_API_KEY}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ ...built.payload, stream: true }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error("studio: QuiverAI", res.status, JSON.stringify(data).slice(0, 500));
    return { status: res.status, error: quiverError(res.status, data) };
  }
  if (!(res.headers.get("Content-Type") ?? "").includes("text/event-stream")) {
    const data = await res.json().catch(() => ({}));
    return result((data.data ?? []).map((d) => d.svg), data.credits, data.usage);
  }

  const outputs = new Map(); // output id or index -> SVG text
  const drafts = new Map();
  let credits, usage, failure, lastPhase, lastDraftAt = 0;
  const seen = [];
  for await (const { event, data } of sse(res.body)) {
    if (seen.length < 5) seen.push(`${event}: ${JSON.stringify(data).slice(0, 300)}`);
    const key = data.id ?? data.index ?? 0;
    const svg = findSvg(data);
    credits = data.credits ?? credits;
    usage = data.usage ?? usage;
    if (event === "error" || data.error) failure = data.error?.message ?? data.message ?? "QuiverAI reported an error.";
    if (event !== lastPhase && ["generating", "reasoning", "draft", "content"].includes(event)) {
      lastPhase = event;
      await send({ type: "progress", phase: event });
    }
    if (event === "draft" && svg) {
      drafts.set(key, joinSvg(drafts.get(key), svg));
      const whole = drafts.get(key);
      if (whole.includes("</svg>") && Date.now() - lastDraftAt > 1500) {
        lastDraftAt = Date.now();
        await send({ type: "draft", index: data.index ?? 0, svg: whole });
      }
    }
    if (event === "content" && svg) outputs.set(key, joinSvg(outputs.get(key), svg));
  }
  const svgs = [...outputs.values()];
  if (!svgs.some(complete)) svgs.push(...drafts.values()); // no final content: fall back to the drafts
  const done = result(svgs, credits, usage);
  if (done.error) {
    console.error("studio: no SVG in QuiverAI stream; first events:", seen.join(" | "));
    if (failure) done.error = failure;
  }
  return done;
}

function result(svgs, credits, usage) {
  const good = svgs.filter(complete);
  return good.length ? { svgs: good, credits, usage } : { status: 502, error: "QuiverAI didn't return an SVG. Try again." };
}

const complete = (s) => typeof s === "string" && s.includes("<svg") && (s.includes("</svg>") || /<svg[^>]*\/>\s*$/.test(s));

/** A whole SVG replaces what came before; a fragment is appended to it. */
const joinSvg = (before = "", next) => (/^\s*(<\?xml|<svg)/.test(next) ? next : before + next);

/** The first SVG markup anywhere in a stream event. */
function findSvg(value, depth = 0) {
  if (typeof value === "string") return value.includes("<") ? value : null;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const k of ["svg", "content", "delta", "text", "data", "output"]) {
    const found = k in value ? findSvg(value[k], depth + 1) : null;
    if (found && (found.includes("<svg") || k === "svg" || k === "delta")) return found;
  }
  return null;
}

/** Server-sent events from a response body: yields { event, data } with data parsed as JSON. */
async function* sse(body) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value.replace(/\r\n/g, "\n");
    let cut;
    while ((cut = buffer.indexOf("\n\n")) >= 0 || (done && buffer.trim() && (cut = buffer.length) >= 0)) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      let event = "message";
      const lines = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) lines.push(line.slice(5).replace(/^ /, ""));
      }
      const text = lines.join("\n");
      if (!text) continue;
      if (text.trim() === "[DONE]") return;
      try {
        yield { event, data: JSON.parse(text) };
      } catch {
        yield { event, data: { text } };
      }
    }
    if (done) return;
  }
}

/** Store one SVG under a new random id. Returns { id, url } (or nulls when storage isn't set up). */
async function save(env, svg, prompt, chat) {
  if (!env.STUDIO_IMAGES) return { id: null, url: null };
  const id = newId();
  await env.STUDIO_IMAGES.put(`svg:${id}`, svg, { metadata: { prompt, chat, created: new Date().toISOString() } });
  return { id, url: `/studio/i/${id}/` };
}

// Chats: chat:<id> holds the whole conversation (image ids, not the SVGs), and
// list:<newest-first key>:<id> holds a summary in its metadata so /studio/list/ needs one KV list call.

async function loadChat(env, id) {
  if (!env.STUDIO_IMAGES || !ID.test(id ?? "")) return null;
  const raw = await env.STUDIO_IMAGES.get(`chat:${id}`);
  return raw ? JSON.parse(raw) : null;
}

/** The chat a message belongs to, or a new one (optionally starting from an earlier image). */
async function openChat(env, id, firstMessage, source) {
  if (!env.STUDIO_IMAGES) return null;
  const existing = await loadChat(env, id);
  if (existing) return existing;
  const now = Date.now();
  const chat = {
    id: newId(),
    title: firstMessage.slice(0, 160) || "Product images",
    created: new Date(now).toISOString(),
    listKey: `list:${String(9_999_999_999_999 - now).padStart(13, "0")}:`,
    messages: [],
  };
  chat.listKey += chat.id;
  const from = ID.test(source ?? "") ? await load(env, source) : null;
  if (from) chat.messages.push({ role: "bot", images: [source], prompt: from.prompt || "Product image", note: "Started from an earlier image." });
  return chat;
}

async function saveChat(env, chat) {
  chat.updated = new Date().toISOString();
  const images = chat.messages.flatMap((m) => m.images ?? []).filter(Boolean);
  const summary = { id: chat.id, title: chat.title, created: chat.created, updated: chat.updated, thumb: images.at(-1) ?? null, images: images.length };
  await Promise.all([
    env.STUDIO_IMAGES.put(`chat:${chat.id}`, JSON.stringify(chat)),
    env.STUDIO_IMAGES.put(chat.listKey, "", { metadata: summary }),
  ]);
}

/** GET /api/studio/chat/<id>: the chat with each image's SVG, for the studio page to show. */
async function chatJson(env, id) {
  const chat = await loadChat(env, id);
  if (!chat) return json(404, { error: "That chat doesn't exist." });
  const messages = await Promise.all(chat.messages.map(async (m) => {
    if (m.role !== "bot") return m;
    const images = await Promise.all((m.images ?? []).map(async (imageId) => {
      const image = await load(env, imageId);
      return image && { id: imageId, url: `/studio/i/${imageId}/`, svg: image.svg };
    }));
    return { ...m, images: images.filter(Boolean) };
  }));
  return json(200, { id: chat.id, title: chat.title, created: chat.created, messages });
}

async function listPage(request, env, url) {
  const template = await env.ASSETS.fetch(new Request(new URL(LIST, url.origin), { headers: request.headers }));
  if (!template.ok) return template;
  let items = '<li class="chat-empty">No chats yet. <a href="/studio/">Start one in the studio</a>.</li>';
  let more = "";
  if (env.STUDIO_IMAGES) {
    const cursor = url.searchParams.get("cursor") || undefined;
    const page = await env.STUDIO_IMAGES.list({ prefix: "list:", limit: LIST_PAGE_SIZE, cursor });
    const rows = page.keys.map((k) => k.metadata).filter((m) => m && ID.test(m.id ?? ""));
    if (rows.length) items = rows.map(chatRow).join("");
    if (!page.list_complete && page.cursor) more = `<a href="${LIST}?cursor=${encodeURIComponent(page.cursor)}">Older chats</a>`;
  }
  const html = (await template.text()).replace("STUDIO_LIST_ITEMS", items).replace("STUDIO_LIST_MORE", more);
  return new Response(html, { headers: { ...NO_INDEX, "Content-Type": "text/html; charset=utf-8" } });
}

function chatRow(c) {
  const thumb = ID.test(c.thumb ?? "") ? `<img src="/studio/i/${c.thumb}.svg" alt="" width="72" height="72" loading="lazy">` : '<span class="chat-thumb-empty"></span>';
  const n = Number(c.images) || 0;
  return `<li><a class="chat-row" href="/studio/c/${c.id}/">${thumb}<span><strong>${escapeHtml(c.title || "Product images")}</strong>` +
    `<small>${escapeHtml(longDate(c.updated || c.created))} · ${n} image${n === 1 ? "" : "s"}</small></span></a></li>`;
}

const longDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "");

function newId() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // no look-alike characters
  return [...crypto.getRandomValues(new Uint8Array(10))].map((b) => abc[b % abc.length]).join("");
}

async function load(env, id) {
  if (!env.STUDIO_IMAGES) return null;
  const { value, metadata } = await env.STUDIO_IMAGES.getWithMetadata(`svg:${id}`);
  return value == null ? null : { svg: value, ...(metadata ?? {}) };
}

async function imageFile(env, id) {
  const image = await load(env, id);
  if (!image) return new Response("Not found.", { status: 404, headers: { ...NO_INDEX, "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(image.svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Security-Policy": SVG_CSP,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, max-age=31536000, immutable", // a saved image never changes
    },
  });
}

async function imagePage(request, env, url, id) {
  const image = await load(env, id);
  if (!image) return notFound(request, env, url);
  const template = await env.ASSETS.fetch(new Request(new URL(TEMPLATE, url.origin), { headers: request.headers }));
  if (!template.ok) return template;
  const prompt = image.prompt || "Product image";
  const date = longDate(image.created) || "an earlier day";
  const fill = {
    STUDIO_SVG_URL: `/studio/i/${id}.svg`,
    STUDIO_FILENAME: `${slug(prompt)}.svg`,
    STUDIO_PROMPT: escapeHtml(prompt),
    STUDIO_ALT: escapeHtml(`Product image: ${prompt}`),
    STUDIO_DATE: escapeHtml(date),
    STUDIO_ID: id,
    STUDIO_CHAT_URL: ID.test(image.chat ?? "") ? `/studio/c/${image.chat}/` : "/studio/",
  };
  const html = (await template.text())
    .replaceAll(TEMPLATE, `/studio/i/${id}/`)
    .replace(/STUDIO_[A-Z_]+/g, (k) => fill[k] ?? k)
    .replace(' loading="lazy"', "");
  return new Response(html, { headers: { ...NO_INDEX, "Content-Type": "text/html; charset=utf-8" } });
}

async function notFound(request, env, url) {
  // Pages answers any path it has no file for with the site's 404 page.
  const page = await env.ASSETS.fetch(new Request(new URL("/studio/i/not-found/", url.origin), { headers: request.headers }));
  return new Response(page.status === 404 || page.ok ? page.body : "Not found.", { status: 404, headers: { ...NO_INDEX, "Content-Type": "text/html; charset=utf-8" } });
}

/** Chat message -> POST /v1/svgs/generations. */
function generation(b) {
  const prompt = clean(b.prompt, 4000);
  if (!prompt) return { error: "Describe the image you want." };
  const model = MODELS.includes(b.model) ? b.model : MODELS[0];
  const n = Math.min(4, Math.max(1, Math.trunc(Number(b.n) || 1)));
  const payload = { model, prompt, n, instructions: clean(b.instructions, 2000) || undefined };
  const ref = reference(b.reference);
  if (ref.error) return ref;
  if (ref.value) payload.references = [ref.value];
  return { path: "svgs/generations", payload };
}

/** Follow-up chat message about a chosen SVG -> POST /v1/svgs/edits. */
function edit(b) {
  const prompt = clean(b.prompt, 4000);
  if (!prompt) return { error: "Say what to change." };
  if (typeof b.svg !== "string" || !b.svg.includes("<svg")) return { error: "Pick an image to change first." };
  if (b.svg.length > MAX_SVG_CHARS) return { status: 413, error: "That SVG is too large to edit (200,000 characters max)." };
  const model = MODELS.includes(b.model) ? b.model : MODELS[0];
  const payload = { model, prompt, svg: b.svg };
  const ref = reference(b.reference);
  if (ref.error) return ref;
  if (ref.value) payload.reference_images = [ref.value];
  return { path: "svgs/edits", payload };
}

/** Optional reference image, sent by the page as a data: URL or bare base64. */
function reference(value) {
  if (value == null || value === "") return {};
  if (typeof value !== "string") return { error: "The reference image must be a data URL." };
  const base64 = value.replace(/^data:image\/[\w.+-]+;base64,/, "");
  if (base64.length > MAX_REFERENCE_CHARS) return { status: 413, error: "The reference image is too large (about 6 MB max)." };
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) return { error: "The reference image isn't valid base64." };
  return { value: { base64 } };
}

function quiverError(status, data) {
  const known = {
    401: "QuiverAI rejected the API key. Check QUIVERAI_API_KEY.",
    402: "The QuiverAI account is out of credits. Add credits at quiver.ai.",
    429: `QuiverAI is rate limiting requests.${data.retry_after ? ` Try again in ${data.retry_after}s.` : " Try again shortly."}`,
  };
  return known[status] ?? data.message ?? `QuiverAI returned an error (${status}).`;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "happy-club";
const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s, max) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { ...NO_INDEX, "Content-Type": "application/json; charset=utf-8" } });
