// The upload page served at /. One self-contained HTML document: no build step, no libraries.
export function uploadPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="data:,">
<title>Happy Club assets</title>
<style>
  :root { --brand: #c2410c; --ink: #1c1917; --muted: #6b6560; --line: #e7e2dd; --bg: #fffaf6; --card: #fff; --ok: #15803d; --bad: #b91c1c; }
  @media (prefers-color-scheme: dark) {
    :root { --brand: #fb923c; --ink: #f5f0eb; --muted: #a8a29e; --line: #3a3532; --bg: #171412; --card: #211d1a; --ok: #4ade80; --bad: #f87171; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); }
  main { max-width: 760px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; }
  p.lead { margin: 0 0 24px; color: var(--muted); }
  #drop { display: block; border: 2px dashed var(--line); border-radius: 16px; background: var(--card); padding: 48px 16px; text-align: center; cursor: pointer; transition: border-color .15s, background .15s; }
  #drop:hover, #drop:focus-within, #drop.over { border-color: var(--brand); }
  #drop.over { background: color-mix(in srgb, var(--brand) 8%, var(--card)); }
  #drop strong { display: block; font-size: 1.125rem; }
  #drop span { color: var(--muted); }
  #drop input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  h2 { font-size: 1rem; margin: 32px 0 8px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  h2 small { font-weight: 400; color: var(--muted); }
  #filter { width: 100%; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--ink); font: inherit; margin-bottom: 8px; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: grid; grid-template-columns: 48px 1fr auto; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .thumb { width: 48px; height: 48px; border-radius: 8px; background: var(--line); object-fit: cover; display: grid; place-items: center; font-size: .7rem; font-weight: 600; color: var(--muted); text-transform: uppercase; overflow: hidden; }
  .name { min-width: 0; }
  .name a { color: var(--ink); font-weight: 600; text-decoration: none; overflow-wrap: anywhere; }
  .name a:hover { color: var(--brand); text-decoration: underline; }
  .meta { color: var(--muted); font-size: .85rem; }
  .meta.bad { color: var(--bad); }
  progress { width: 100%; height: 6px; accent-color: var(--brand); }
  button { font: inherit; font-size: .9rem; padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--ink); cursor: pointer; white-space: nowrap; }
  button:hover { border-color: var(--brand); }
  button.done { color: var(--ok); border-color: var(--ok); }
  .empty { color: var(--muted); padding: 16px 0; }
</style>
</head>
<body>
<main>
  <h1>Happy Club assets</h1>
  <p class="lead">Drop files here. Each one gets a public link on this site that you can copy.</p>

  <label id="drop">
    <input id="pick" type="file" multiple>
    <strong>Drop files to upload</strong>
    <span>or click to choose. Up to 100 MB each.</span>
  </label>

  <h2>Files <small id="count"></small></h2>
  <input id="filter" type="search" placeholder="Filter by name" aria-label="Filter files by name">
  <ul id="files"><li class="empty">Loading…</li></ul>
</main>
<script>
const list = document.getElementById('files');
const drop = document.getElementById('drop');
const pick = document.getElementById('pick');
const filter = document.getElementById('filter');
const count = document.getElementById('count');
let files = [];

const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const fmtDate = (s) => new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const ext = (k) => (k.includes('.') ? k.split('.').pop() : 'file').slice(0, 4);

function row(f) {
  const li = document.createElement('li');
  const isImg = /^image\\//.test(f.type || '');
  const thumb = document.createElement(isImg && f.url ? 'img' : 'div');
  thumb.className = 'thumb';
  if (isImg && f.url) { thumb.src = '/' + encodeURIComponent(f.key); thumb.alt = ''; thumb.loading = 'lazy'; } else thumb.textContent = ext(f.key);
  const name = document.createElement('div');
  name.className = 'name';
  const link = document.createElement(f.url ? 'a' : 'span');
  link.textContent = f.key;
  if (f.url) { link.href = f.url; link.target = '_blank'; link.rel = 'noopener'; }
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = f.uploaded ? fmtSize(f.size) + ' · ' + fmtDate(f.uploaded) : '';
  name.append(link, meta);
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy link';
  copy.hidden = !f.url;
  copy.onclick = async () => {
    await navigator.clipboard.writeText(f.url);
    copy.textContent = 'Copied'; copy.classList.add('done');
    setTimeout(() => { copy.textContent = 'Copy link'; copy.classList.remove('done'); }, 1500);
  };
  li.append(thumb, name, copy);
  return { li, thumb, link, meta, copy };
}

function render() {
  const q = filter.value.trim().toLowerCase();
  const shown = files.filter((f) => f.key.includes(q));
  list.replaceChildren(...shown.map((f) => row(f).li));
  if (!shown.length) list.innerHTML = '<li class="empty">' + (files.length ? 'No files match.' : 'No files yet.') + '</li>';
  count.textContent = files.length ? files.length + (files.length === 1 ? ' file' : ' files') : '';
}

async function load() {
  const res = await fetch('/api/files');
  if (!res.ok) { list.innerHTML = '<li class="empty">Couldn’t load the file list.</li>'; return; }
  files = (await res.json()).files;
  render();
}

function uploadOne(file) {
  const r = row({ key: file.name, size: file.size, type: file.type });
  const bar = document.createElement('progress');
  bar.max = 1; bar.value = 0;
  r.meta.replaceChildren(bar);
  if (list.querySelector('.empty')) list.replaceChildren();
  list.prepend(r.li);
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', '/api/files/' + encodeURIComponent(file.name));
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) bar.value = e.loaded / e.total; };
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status === 201) {
        const f = { ...body, uploaded: new Date().toISOString() };
        files.unshift(f);
        const fresh = row(f);
        r.li.replaceWith(fresh.li);
      } else {
        r.meta.className = 'meta bad';
        r.meta.textContent = body.error || 'Upload failed (' + xhr.status + ').';
      }
      resolve();
    };
    xhr.onerror = () => { r.meta.className = 'meta bad'; r.meta.textContent = 'Upload failed: network error.'; resolve(); };
    xhr.send(file);
  });
}

async function uploadAll(fileList) {
  const queue = [...fileList].filter((f) => f.size > 0);
  const worker = async () => { while (queue.length) await uploadOne(queue.shift()); };
  await Promise.all([worker(), worker(), worker()]);
  count.textContent = files.length + (files.length === 1 ? ' file' : ' files');
}

pick.onchange = () => { uploadAll(pick.files); pick.value = ''; };
filter.oninput = render;
['dragenter', 'dragover'].forEach((t) => window.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => window.addEventListener(t, (e) => { e.preventDefault(); if (t === 'drop' || !e.relatedTarget) drop.classList.remove('over'); }));
window.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) uploadAll(e.dataTransfer.files); });
load();
</script>
</body>
</html>`;
}
