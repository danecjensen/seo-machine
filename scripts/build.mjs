// Build every site (or --site <domain> ...) into dist/<domain>/, each on its own.
// Like a Jekyll theme gem, theme/ supplies layouts, includes and generated files;
// any file with the same path in the site folder replaces the theme's.
// A site that fails keeps its previous output and never stops the others.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";
import { assertSelfContained, loadConfig } from "../lib/site.mjs";
import { readSkeleton, toLayout } from "../lib/wireframe.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SITES = path.join(ROOT, "sites");
const DIST = process.env.SEO_DIST_DIR ?? path.join(ROOT, "dist"); // scripts/wireframe.mjs builds elsewhere
const WORK = path.join(ROOT, ".build");
const ELEVENTY = path.join(ROOT, "node_modules", ".bin", "eleventy");
const CONFIG = path.join(ROOT, "lib", "eleventy.config.mjs");

const { values } = parseArgs({
  options: {
    site: { type: "string", multiple: true },
    strict: { type: "boolean", default: false },              // fail on SEO errors
    verbose: { type: "boolean", short: "v", default: false }, // print SEO warnings too
    serve: { type: "boolean", default: false },               // preview one site, rebuilding on changes
    list: { type: "boolean", default: false },                // print the site list as JSON and exit
  },
});

const listSites = () =>
  fs.readdirSync(SITES).filter((d) => fs.existsSync(path.join(SITES, d, "_config.yml"))).sort();

if (values.list) {
  console.log(JSON.stringify(listSites()));
  process.exit(0);
}

/** theme/ + sites/<domain>/ -> .build/<domain>/ (site files win). */
function assemble(domain) {
  const siteDir = path.join(SITES, domain);
  loadConfig(siteDir);
  assertSelfContained(siteDir);
  const work = path.join(WORK, domain);
  fs.rmSync(work, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, "theme"), work, { recursive: true });
  fs.cpSync(siteDir, work, { recursive: true, filter: (src) => path.basename(src) !== "lighthouse.json" });
  buildArchetypes(work);
  return { siteDir, work };
}

/** _archetypes/<name>.html skeletons -> _layouts/<name>.html (see lib/wireframe.mjs). The folder isn't published. */
function buildArchetypes(work) {
  const dir = path.join(work, "_archetypes");
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".html"))) {
    const name = f.slice(0, -5);
    let tree;
    try {
      tree = readSkeleton(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`_archetypes/${f}: ${e.message}`);
    }
    fs.mkdirSync(path.join(work, "_layouts"), { recursive: true });
    fs.writeFileSync(path.join(work, "_layouts", f), toLayout(tree, name, { markers: process.env.WIREFRAME_MARKERS === "1" }));
  }
  fs.rmSync(dir, { recursive: true });
}

function run(domain, out) {
  const { siteDir, work } = assemble(domain);
  return spawnSync(ELEVENTY, [`--config=${CONFIG}`, "--input=.", `--output=${out}`], {
    cwd: work,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      SEO_SITE_DIR: siteDir,
      SEO_STRICT: values.strict ? "1" : "",
      SEO_VERBOSE: values.verbose ? "1" : "",
    },
  });
}

function serve() {
  const [domain] = values.site ?? [];
  if (!domain) {
    console.error("usage: npm run serve -- --site <domain>");
    process.exit(1);
  }
  // Like `jekyll serve`: build, serve dist/<domain>/ on port 4000, rebuild when files change.
  const out = path.join(DIST, domain);
  const rebuild = () => buildOne(domain) && console.log(`  serving http://localhost:4000/`);
  rebuild();
  let timer;
  const onChange = (event, file) => {
    if (file?.includes(".staging")) return;
    clearTimeout(timer);
    timer = setTimeout(rebuild, 150);
  };
  fs.watch(path.join(SITES, domain), { recursive: true }, onChange);
  fs.watch(path.join(ROOT, "theme"), { recursive: true }, onChange);

  const types = { ".html": "text/html; charset=utf-8", ".xml": "application/xml", ".txt": "text/plain", ".css": "text/css",
    ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
  http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let file = path.join(out, url);
    if (!file.startsWith(out)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!url.endsWith("/")) return res.writeHead(308, { Location: url + "/" }).end();
      file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file)) {
      res.writeHead(404, { "Content-Type": types[".html"] });
      return res.end(fs.existsSync(path.join(out, "404.html")) ? fs.readFileSync(path.join(out, "404.html")) : "Not found");
    }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" });
    res.end(fs.readFileSync(file));
  }).listen(4000);
}

/** Build one site into dist/<domain>/ via a staging folder. Returns true on success. */
function buildOne(domain) {
  const out = path.join(DIST, domain);
  const staging = `${out}.staging`;
  fs.rmSync(staging, { recursive: true, force: true });
  const started = Date.now();
  let result;
  try {
    result = run(domain, staging);
  } catch (e) {
    result = { status: 1 };
    console.error(`  ${e.message}`);
  }
  if (result.status !== 0) {
    fs.rmSync(staging, { recursive: true, force: true });
    console.error(`✗ ${domain}: build failed; dist/${domain}/ left as it was`);
    return false;
  }
  fs.rmSync(out, { recursive: true, force: true }); // swap in only a finished build
  fs.renameSync(staging, out);
  const pages = fs.readdirSync(out, { recursive: true }).filter((f) => f.endsWith(".html")).length;
  console.log(`✓ ${domain}: ${pages} pages -> dist/${domain}/ (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  return true;
}

function buildAll() {
  const failed = (values.site ?? listSites()).filter((domain) => !buildOne(domain));
  if (failed.length) {
    console.error(`\nfailed: ${failed.join(", ")}`);
    process.exit(1);
  }
}

if (values.serve) serve();
else buildAll();
