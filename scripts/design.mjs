// Apply a Claude Design export to one site:
//   npm run design -- --site gohappyclub.com --from ~/Downloads/happy-club.zip [--source <Claude Design link>]
// --from takes a .zip export, a folder, a standalone .html page, a .css file or a design tokens .json.
// Writes sites/<domain>/_design/tokens.css (and fonts/), which every page of that site inlines after the
// shared theme. Only that site changes. sites/<domain>/_design/site.css is yours and is never touched.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { contrastIssues, mapTheme, readCss, readTokensJson, tokensCss } from "../lib/design.mjs";
import { loadConfig } from "../lib/site.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const FONT_EXT = new Set([".woff2", ".woff"]);
const GOOGLE_CSS = /^https:\/\/fonts\.googleapis\.com\/css2?\?/;
// Asking as a current browser makes Google Fonts answer with woff2 split by subset.
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const { values } = parseArgs({
  options: {
    site: { type: "string" },
    from: { type: "string" },
    source: { type: "string" },                       // the Claude Design link, recorded in tokens.css
    subsets: { type: "string", default: "latin" },    // Google Fonts subsets to keep
  },
});

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
if (!values.site || !values.from) {
  fail("usage: npm run design -- --site <domain> --from <export.zip | folder | page.html | tokens.css | tokens.json> [--source <link>]");
}

const siteDir = path.join(ROOT, "sites", values.site);
if (!fs.existsSync(siteDir)) fail(`no site at sites/${values.site}`);
loadConfig(siteDir);
const from = path.resolve(values.from.replace(/^~(?=\/)/, os.homedir()));
if (!fs.existsSync(from)) fail(`${values.from}: not found`);

const warnings = [];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "design-"));
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));

/** Every file an export contributes, unpacking a .zip first. */
function exportFiles() {
  let root = from;
  if (from.endsWith(".zip")) {
    root = path.join(tmp, "export");
    const r = spawnSync("unzip", ["-q", "-o", from, "-d", root], { encoding: "utf8" });
    if (r.status !== 0) fail(`could not unzip ${values.from}: ${r.stderr || r.error?.message}`);
  }
  if (fs.statSync(root).isFile()) return [root];
  return fs.readdirSync(root, { recursive: true })
    .map((f) => path.join(root, f))
    .filter((f) => fs.statSync(f).isFile() && !f.includes(`${path.sep}node_modules${path.sep}`) && !path.basename(f).startsWith("."));
}

const curl = (url, ...args) => {
  const r = spawnSync("curl", ["-fsSL", "--max-time", "30", ...args, url], { encoding: "utf8", maxBuffer: 1 << 24 });
  return r.status === 0 ? r.stdout : null;
};

// Styles from each file, with the folder that their url()s are relative to.
const sheets = [];
const tokenFiles = [];
const remote = new Set();
for (const file of exportFiles()) {
  const ext = path.extname(file).toLowerCase();
  const text = () => fs.readFileSync(file, "utf8");
  if (ext === ".css") sheets.push({ css: text(), dir: path.dirname(file), name: path.basename(file) });
  else if (ext === ".json") {
    let json;
    try { json = JSON.parse(text()); } catch { continue; }
    if (/token|theme|design/i.test(path.basename(file)) || text().includes('"$value"')) tokenFiles.push(json);
  } else if (ext === ".html" || ext === ".htm") {
    const html = text();
    for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) sheets.push({ css: m[1], dir: path.dirname(file), name: path.basename(file) });
    for (const m of html.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) if (GOOGLE_CSS.test(m[1].replace(/&amp;/g, "&"))) remote.add(m[1].replace(/&amp;/g, "&"));
  }
}

const vars = new Map();
for (const json of tokenFiles) for (const [k, v] of readTokensJson(json)) vars.set(k, v);

const fontsDir = path.join(siteDir, "_design", "fonts");
const fonts = new Map(); // file name -> source path or URL
const fontFaces = [];

/** Point a @font-face's src at /assets/fonts/, keeping only woff2/woff files we can ship. */
function addFontFace(decls, resolveUrl) {
  const out = [];
  let src = null;
  for (const [p, v] of decls) {
    if (p.toLowerCase() !== "src") { out.push([p, v]); continue; }
    const parts = [];
    for (const m of v.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)(\s*format\([^)]*\))?/g)) {
      const ref = resolveUrl(m[1]);
      const name = path.basename(new URL(ref, "file:///").pathname);
      if (!ref || !FONT_EXT.has(path.extname(name).toLowerCase())) continue;
      fonts.set(name, ref);
      parts.push(`url(/assets/fonts/${name})${m[2] ?? ""}`);
    }
    if (parts.length) src = parts.join(", ");
  }
  if (!src) {
    warnings.push(`dropped a @font-face for ${decls.find(([p]) => p === "font-family")?.[1] ?? "a font"}: no .woff2/.woff file in the export`);
    return;
  }
  out.push(["src", src]);
  if (!out.some(([p]) => p === "font-display")) out.push(["font-display", "swap"]); // text shows while fonts load
  fontFaces.push(out);
}

for (const sheet of sheets) {
  const found = readCss(sheet.css);
  for (const [k, v] of found.vars) vars.set(k, v);
  for (const decls of found.fontFaces) {
    addFontFace(decls, (u) => (/^https?:/.test(u) ? u : /^data:/.test(u) ? null : path.resolve(sheet.dir, u)));
  }
  for (const url of found.imports) {
    if (GOOGLE_CSS.test(url)) remote.add(url);
    else warnings.push(`${sheet.name}: ignored @import ${url} (only Google Fonts imports are brought in)`);
  }
}

// Google Fonts: download the woff2 files so the site serves them itself (no third-party request).
const subsets = new Set(values.subsets.split(",").map((s) => s.trim()));
for (const url of remote) {
  const css = curl(url, "-A", BROWSER_UA);
  if (!css) {
    warnings.push(`could not fetch ${url}; that font is left out and the theme's system font is used`);
    continue;
  }
  for (const m of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g)) {
    if (!subsets.has(m[1])) continue;
    addFontFace(readCss(`@font-face{${m[2]}}`).fontFaces[0], (u) => u);
  }
}

if (!vars.size && !fontFaces.length) fail(`${values.from}: found no design tokens (CSS custom properties on :root, or a tokens .json)`);

// Write the site's design.
fs.rmSync(fontsDir, { recursive: true, force: true });
fs.mkdirSync(path.join(siteDir, "_design"), { recursive: true });
let fontBytes = 0;
for (const [name, ref] of fonts) {
  fs.mkdirSync(fontsDir, { recursive: true });
  const dest = path.join(fontsDir, name);
  if (/^https?:/.test(ref)) {
    if (curl(ref, "-o", dest) === null) warnings.push(`could not download ${ref}`);
  } else if (fs.existsSync(ref)) fs.copyFileSync(ref, dest);
  else warnings.push(`font file ${ref} is missing from the export`);
  if (fs.existsSync(dest)) fontBytes += fs.statSync(dest).size;
}

const { vars: themed, mapped } = mapTheme(vars);
for (const k of themed.keys()) if (!vars.has(k)) warnings.push(`renamed the design's ${k.replace("ds-", "")} to ${k}: the theme uses that name for something else`);
const source = values.source ?? path.basename(from);
const css = tokensCss({ vars: themed, mapped, fontFaces, source, date: new Date().toISOString().slice(0, 10) });
fs.writeFileSync(path.join(siteDir, "_design", "tokens.css"), css);

// Report what changed and what might cost Lighthouse points.
console.log(`✓ ${values.site}: ${vars.size} design tokens, ${fontFaces.length} font faces -> sites/${values.site}/_design/`);
for (const theme of ["brand", "brand-ink", "ink", "muted", "bg", "soft", "line", "radius", "font", "font-heading"]) {
  const v = themed.has(`--${theme}`) ? "set by the design" : mapped[theme] ?? "theme default (no matching token)";
  console.log(`  --${theme.padEnd(13)} ${v}`);
}
for (const { fg, bg, ratio } of contrastIssues(themed, mapped)) {
  warnings.push(`--${fg} on --${bg} has contrast ${ratio}:1; Lighthouse accessibility wants 4.5:1`);
}
if (css.length > 12_000) warnings.push(`tokens.css is ${(css.length / 1024).toFixed(1)} KB and is inlined on every page; trim unused tokens`);
if (fonts.size > 4 || fontBytes > 200_000) {
  warnings.push(`${fonts.size} font files, ${(fontBytes / 1024).toFixed(0)} KB: more than 4 files or 200 KB can cost Lighthouse performance`);
}
for (const w of warnings) console.warn(`  ! ${w}`);
console.log(`\nPreview with: npm run serve -- --site ${values.site}`);
