// assets.gohappyclub.com: drop files on the page at / to store them in R2; every file is then
// public at /<name>. The page and the upload API need the UPLOAD_PASSWORD secret (any user name);
// serving files needs nothing. Without the secret set, uploads are refused.
import { uploadPage } from './page.mjs';

const MAX_BYTES = 100 * 1024 * 1024; // Workers' request body limit on the Free and Pro plans

// Uploaded files never change in place (a name that's taken gets -2, -3...), so browsers and
// Cloudflare's cache may keep them for a year. The CSP stops an uploaded SVG or HTML file from
// running script on this host, where the upload page lives.
const FILE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
};

const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    if (pathname === '/' || pathname.startsWith('/api/')) {
      const denied = await checkPassword(request, env);
      if (denied) return denied;
      if (pathname === '/' && request.method === 'GET') {
        return new Response(uploadPage(), {
          headers: { ...PRIVATE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      if (pathname === '/api/files' && request.method === 'GET') return listFiles(env, url.origin);
      if (pathname.startsWith('/api/files/') && request.method === 'PUT') {
        return upload(request, env, url.origin, pathname.slice('/api/files/'.length));
      }
      return json({ error: 'Not found' }, 404);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    return serveFile(request, env, pathname.slice(1));
  },
};

async function checkPassword(request, env) {
  if (!env.UPLOAD_PASSWORD) {
    return new Response('Uploads are off until the UPLOAD_PASSWORD secret is set on this Worker.', {
      status: 503,
      headers: { ...PRIVATE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  const header = request.headers.get('Authorization') || '';
  let password = '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      password = decoded.slice(decoded.indexOf(':') + 1);
    } catch {}
  }
  if (await sameSecret(password, env.UPLOAD_PASSWORD)) return null;
  return new Response('Password required.', {
    status: 401,
    headers: {
      ...PRIVATE_HEADERS,
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="Happy Club assets", charset="UTF-8"',
    },
  });
}

// Compares SHA-256 digests byte by byte, so the time taken doesn't reveal how much matched.
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const ax = new Uint8Array(x);
  const ay = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ax.length; i++) diff |= ax[i] ^ ay[i];
  return diff === 0;
}

// "Summer Hat (Final).JPG" -> "summer-hat-final.jpg"
export function cleanName(name) {
  const base = String(name).split(/[\\/]/).pop().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot + 1) : '';
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const cleanStem = slug(stem).slice(0, 80) || 'file';
  const cleanExt = slug(ext).slice(0, 10);
  return cleanExt ? `${cleanStem}.${cleanExt}` : cleanStem;
}

async function freeName(env, name) {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; n < 1000; n++) {
    const key = n === 1 ? name : `${stem}-${n}${ext}`;
    if (!(await env.BUCKET.head(key))) return key;
  }
  return `${stem}-${crypto.randomUUID().slice(0, 8)}${ext}`;
}

async function upload(request, env, origin, rawName) {
  const size = Number(request.headers.get('Content-Length'));
  if (!request.headers.has('Content-Length') || Number.isNaN(size)) return json({ error: 'Content-Length is required.' }, 411);
  if (!request.body || size === 0) return json({ error: 'The file is empty.' }, 400);
  if (size > MAX_BYTES) return json({ error: 'Files can be up to 100 MB.' }, 413);

  const key = await freeName(env, cleanName(rawName));
  const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
  const object = await env.BUCKET.put(key, request.body, {
    httpMetadata: { contentType },
    customMetadata: { originalName: String(rawName).slice(0, 200) },
  });
  return json({ key, url: `${origin}/${encodeURIComponent(key)}`, size: object.size, type: contentType }, 201);
}

async function listFiles(env, origin) {
  const files = [];
  let cursor;
  do {
    const page = await env.BUCKET.list({ cursor, limit: 1000, include: ['httpMetadata'] });
    for (const o of page.objects) {
      files.push({
        key: o.key,
        url: `${origin}/${encodeURIComponent(o.key)}`,
        size: o.size,
        type: o.httpMetadata?.contentType || '',
        uploaded: o.uploaded.toISOString(),
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && files.length < 5000);
  files.sort((a, b) => b.uploaded.localeCompare(a.uploaded));
  return json({ files });
}

async function serveFile(request, env, key) {
  if (!key) return new Response('Not found', { status: 404 });
  const options = { onlyIf: request.headers, range: request.headers };
  const object = request.method === 'HEAD' ? await env.BUCKET.head(key) : await env.BUCKET.get(key, options);
  if (!object) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  const headers = new Headers(FILE_HEADERS);
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');

  // A get() that matched If-None-Match / If-Modified-Since returns the object without a body.
  if (request.method === 'GET' && !('body' in object)) return new Response(null, { status: 304, headers });
  if (request.method === 'HEAD') {
    headers.set('Content-Length', String(object.size));
    return new Response(null, { headers });
  }
  if (object.range && request.headers.has('Range')) {
    let { offset, length, suffix } = object.range;
    if (suffix !== undefined) [offset, length] = [object.size - suffix, suffix];
    offset ??= 0;
    length ??= object.size - offset;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
