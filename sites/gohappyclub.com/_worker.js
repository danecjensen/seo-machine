// Cloudflare Pages "advanced mode" worker for gohappyclub.com. _routes.json sends only the
// Product Image Studio (/studio/ and /api/studio/*) here; every other page is served as a plain
// static file and never runs this code, so the public site's speed is unchanged.
//
// The studio is a small chat that turns product descriptions into SVGs with QuiverAI
// (https://docs.quiver.ai/api-reference). The API key stays here on the server.
//
// Secrets on the Cloudflare Pages project gohappyclub-com (Settings > Variables and Secrets):
//   STUDIO_PASSWORD   password for the studio (any username). Unset = studio stays locked.
//   QUIVERAI_API_KEY  QuiverAI API key (sk_live_... or a free sk_test_... sandbox key).

const QUIVER = "https://api.quiver.ai/v1";
const MODELS = ["arrow-2", "arrow-2-telos"];
const MAX_REFERENCE_CHARS = 8_000_000; // ~6 MB image as base64
const MAX_SVG_CHARS = 200_000; // QuiverAI's edit limit
const PRIVATE = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "private, no-store" };

const isStudio = (path) => path === "/studio" || path.startsWith("/studio/") || path.startsWith("/api/studio/");

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!isStudio(url.pathname)) return env.ASSETS.fetch(request);

    if (!env.STUDIO_PASSWORD) {
      return text(503, "The studio is locked until STUDIO_PASSWORD is set on the Cloudflare Pages project.");
    }
    if (!(await authorized(request, env.STUDIO_PASSWORD))) {
      return new Response("Password required.", {
        status: 401,
        headers: { ...PRIVATE, "WWW-Authenticate": 'Basic realm="Happy Club studio", charset="UTF-8"' },
      });
    }

    if (url.pathname.startsWith("/api/studio/")) {
      try {
        return await api(request, env, url);
      } catch (e) {
        return json(500, { error: `Something went wrong: ${e.message}` });
      }
    }

    const page = await env.ASSETS.fetch(request);
    const res = new Response(page.body, page);
    for (const [k, v] of Object.entries(PRIVATE)) res.headers.set(k, v);
    return res;
  },
};

async function api(request, env, url) {
  if (request.method !== "POST") return json(405, { error: "Use POST." });
  // The browser sends the saved password with every request, so only accept calls made by the
  // studio page itself (same origin, JSON body) and not by forms on other sites.
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return json(403, { error: "Cross-site requests are not allowed." });
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

  const res = await fetch(`${QUIVER}/${built.path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.QUIVERAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(built.payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json(res.status, { error: quiverError(res.status, data), code: data.code });

  const svgs = (data.data ?? []).map((d) => d.svg).filter((s) => typeof s === "string" && s.includes("<svg"));
  if (!svgs.length) return json(502, { error: "QuiverAI didn't return an SVG. Try again." });
  return json(200, { svgs, credits: data.credits, usage: data.usage });
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

async function authorized(request, password) {
  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  const given = decoded.slice(decoded.indexOf(":") + 1); // any username works
  return sameSecret(given, password);
}

/** Constant-time comparison of two strings (compares their SHA-256 hashes). */
async function sameSecret(a, b) {
  const hash = async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const clean = (s, max) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { ...PRIVATE, "Content-Type": "application/json; charset=utf-8" } });
const text = (status, body) => new Response(body, { status, headers: { ...PRIVATE, "Content-Type": "text/plain; charset=utf-8" } });
