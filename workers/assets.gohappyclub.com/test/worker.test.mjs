// Runs the Worker against an in-memory stand-in for the R2 bucket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { cleanName } from '../src/worker.mjs';

function fakeBucket() {
  const store = new Map();
  const meta = (key, o) => ({
    key,
    size: o.data.length,
    uploaded: o.uploaded,
    httpEtag: `"${key}"`,
    httpMetadata: o.httpMetadata,
    writeHttpMetadata(h) { if (o.httpMetadata?.contentType) h.set('Content-Type', o.httpMetadata.contentType); },
  });
  return {
    store,
    async head(key) { return store.has(key) ? meta(key, store.get(key)) : null; },
    async get(key) {
      if (!store.has(key)) return null;
      const o = store.get(key);
      return { ...meta(key, o), body: new Blob([o.data]).stream() };
    },
    async put(key, body, opts) {
      const data = new Uint8Array(await new Response(body).arrayBuffer());
      store.set(key, { data, httpMetadata: opts.httpMetadata, uploaded: new Date() });
      return meta(key, store.get(key));
    },
    async list() { return { objects: [...store.keys()].map((k) => meta(k, store.get(k))), truncated: false }; },
  };
}

const env = () => ({ BUCKET: fakeBucket(), UPLOAD_PASSWORD: 'hunter2' });
const auth = (pw = 'hunter2') => ({ Authorization: 'Basic ' + btoa('dane:' + pw) });
const call = (env, path, init = {}) => worker.fetch(new Request('https://assets.gohappyclub.com' + path, init), env);
const put = (env, name, text, headers = auth()) =>
  call(env, '/api/files/' + encodeURIComponent(name), {
    method: 'PUT',
    body: text,
    headers: { ...headers, 'Content-Type': 'image/png', 'Content-Length': String(new TextEncoder().encode(text).length) },
  });

test('cleanName makes short, URL-safe names', () => {
  assert.equal(cleanName('Summer Hat (Final).JPG'), 'summer-hat-final.jpg');
  assert.equal(cleanName('../../etc/passwd'), 'passwd');
  assert.equal(cleanName('Café logo.svg'), 'cafe-logo.svg');
  assert.equal(cleanName('.png'), 'png');
  assert.equal(cleanName('???'), 'file');
});

test('the page and API need the password', async () => {
  const e = env();
  assert.equal((await call(e, '/')).status, 401);
  assert.equal((await call(e, '/', { headers: auth('wrong') })).status, 401);
  assert.equal((await put(e, 'a.png', 'x', auth('wrong'))).status, 401);
  assert.equal(e.BUCKET.store.size, 0);
  const page = await call(e, '/', { headers: auth() });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Drop files to upload/);
  assert.equal(page.headers.get('X-Robots-Tag'), 'noindex');
});

test('uploads are refused when no password is set', async () => {
  const e = { BUCKET: fakeBucket() };
  assert.equal((await call(e, '/')).status, 503);
  assert.equal((await put(e, 'a.png', 'x', {})).status, 503);
});

test('an upload is public at its link, and a taken name gets a number', async () => {
  const e = env();
  const first = await put(e, 'Hat Photo.PNG', 'one');
  assert.equal(first.status, 201);
  const body = await first.json();
  assert.equal(body.key, 'hat-photo.png');
  assert.equal(body.url, 'https://assets.gohappyclub.com/hat-photo.png');

  const second = await (await put(e, 'hat photo.png', 'two')).json();
  assert.equal(second.key, 'hat-photo-2.png');

  const file = await call(e, '/hat-photo.png');
  assert.equal(file.status, 200);
  assert.equal(await file.text(), 'one');
  assert.equal(file.headers.get('Content-Type'), 'image/png');
  assert.match(file.headers.get('Cache-Control'), /immutable/);
  assert.match(file.headers.get('Content-Security-Policy'), /sandbox/);

  const list = await (await call(e, '/api/files', { headers: auth() })).json();
  assert.deepEqual(list.files.map((f) => f.key).sort(), ['hat-photo-2.png', 'hat-photo.png']);
});

test('missing files are 404 and files cannot be changed without the API', async () => {
  const e = env();
  assert.equal((await call(e, '/nope.png')).status, 404);
  assert.equal((await call(e, '/%E0%A4%A')).status, 400);
  assert.equal((await call(e, '/nope.png', { method: 'PUT', body: 'x' })).status, 405);
  assert.equal((await call(e, '/nope.png', { method: 'DELETE' })).status, 405);
});

test('empty and oversized uploads are rejected', async () => {
  const e = env();
  assert.equal((await put(e, 'empty.png', '')).status, 400);
  const big = await call(e, '/api/files/big.mov', {
    method: 'PUT',
    body: 'x',
    headers: { ...auth(), 'Content-Length': String(101 * 1024 * 1024) },
  });
  assert.equal(big.status, 413);
});
