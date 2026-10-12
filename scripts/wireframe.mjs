// Page archetypes <-> grayscale wireframes, for one site's sites/<domain>/_archetypes/.
//   npm run wireframe -- --site <domain> [name ...]                 skeleton -> wireframe: write <name>.png
//   npm run wireframe -- --site <domain> --from <image.png> <name>  wireframe -> skeleton: write <name>.html
//   npm run wireframe -- --site <domain> --check                    fail if a .png doesn't read back as its skeleton
//   npm run wireframe -- --site <domain> --layout <name>            print the Eleventy layout the build makes from it
// Drawing builds the site and measures a page of each archetype in Chrome, so the wireframe has the page's real
// proportions (the page is `wireframes: { <name>: /url/ }` in _config.yml, or the first page using it).
// --plain draws from the skeleton alone, with fixed sizes and no browser.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "../lib/site.mjs";
import { carrySlots, decodePng, encodePng, readImage, readSkeleton, renderTree, sameShape, toLayout, writeSkeleton } from "../lib/wireframe.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    site: { type: "string" },
    from: { type: "string" },
    check: { type: "boolean", default: false },
    plain: { type: "boolean", default: false },
    layout: { type: "string" },
  },
});
const fail = (msg) => { console.error(msg); process.exit(1); };
if (!values.site) fail("usage: npm run wireframe -- --site <domain> [--from <image.png> <name> | --check | --layout <name> | --plain] [name ...]");
const ROOT = path.resolve(import.meta.dirname, "..");
const siteDir = path.join(ROOT, "sites", values.site);
const dir = path.join(siteDir, "_archetypes");
if (!fs.existsSync(dir)) fail(`${values.site} has no _archetypes/ folder`);
const file = (name, ext) => path.join(dir, `${name}.${ext}`);
const rel = (p) => path.relative(process.cwd(), p);
const names = positionals.length ? positionals : fs.readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5)).sort();
const skeleton = (name) => {
  if (!fs.existsSync(file(name, "html"))) fail(`no archetype ${name}: ${rel(file(name, "html"))} doesn't exist`);
  return fs.readFileSync(file(name, "html"), "utf8");
};

/** Build the site with measuring markers into a temp folder, serve it, and measure one page per archetype. */
async function measureAll(list) {
  const { measurePage, openBrowser } = await import("../lib/wireframe-measure.mjs");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "wireframe-"));
  try {
    const build = spawnSync("node", [path.join(ROOT, "scripts/build.mjs"), "--site", values.site], {
      encoding: "utf8", env: { ...process.env, SEO_DIST_DIR: out, WIREFRAME_MARKERS: "1" } });
    if (build.status !== 0) fail(`build failed:\n${build.stdout}${build.stderr}`);
    const root = path.join(out, values.site);
    const server = http.createServer((req, res) => {
      let f = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
      if (!f.startsWith(root)) return res.writeHead(403).end();
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
      if (!fs.existsSync(f)) return res.writeHead(404).end();
      res.writeHead(200, { "Content-Type": { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".css": "text/css",
        ".woff2": "font/woff2" }[path.extname(f)] ?? "application/octet-stream" });
      res.end(fs.readFileSync(f));
    });
    await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
    const browser = await openBrowser();
    try {
      const pages = fs.readdirSync(root, { recursive: true }).filter((f) => f.endsWith("index.html"))
        .map((f) => "/" + f.replace(/\\/g, "/").replace(/index\.html$/, "")).sort();
      const chosen = loadConfig(siteDir).wireframes ?? {};
      const result = new Map();
      for (const name of list) {
        const url = chosen[name] ?? pages.find((u) => fs.readFileSync(path.join(root, u, "index.html"), "utf8").includes(`class="wf wf-${name}"`));
        if (!url) { console.log(`  ${name}: no page uses it yet, so it's drawn from the skeleton alone`); continue; }
        result.set(name, { url, ...(await measurePage(browser, `http://127.0.0.1:${server.address().port}${url}`)) });
      }
      return result;
    } finally {
      await browser.close();
      server.close();
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}

if (values.layout) {
  process.stdout.write(toLayout(readSkeleton(skeleton(values.layout)), values.layout));
} else if (values.from) {
  if (names.length !== 1 || !positionals.length) fail("--from needs exactly one archetype name, e.g. --from home.png home");
  const [name] = names;
  const old = fs.existsSync(file(name, "html")) ? fs.readFileSync(file(name, "html"), "utf8") : "";
  const tree = readImage(decodePng(fs.readFileSync(values.from)));
  const unnamed = carrySlots(tree, old ? readSkeleton(old) : null);
  const comment = old.match(/^<!--\s*([\s\S]*?)\s*-->/)?.[1] ?? `${name} archetype. ${name}.png is this skeleton as a grayscale wireframe.`;
  fs.writeFileSync(file(name, "html"), writeSkeleton(tree, comment));
  console.log(`✓ ${name}: ${tree.sections.length} sections -> ${rel(file(name, "html"))}`);
  if (unnamed.length) {
    console.log(`  These blocks have no data-slot yet, so the page shows a placeholder for them:`);
    for (const u of unnamed) console.log(`    ${u}`);
  }
  console.log(`  Run npm run wireframe -- --site ${values.site} ${name} to redraw ${name}.png from the built page.`);
} else if (values.check) {
  let bad = 0;
  for (const name of names) {
    const tree = readSkeleton(skeleton(name));
    if (!fs.existsSync(file(name, "png"))) { bad++; console.error(`✗ ${name}.png is missing`); continue; }
    const back = readImage(decodePng(fs.readFileSync(file(name, "png"))));
    carrySlots(back, tree);
    if (sameShape(back, tree)) console.log(`✓ ${name}.png reads back as ${name}.html`);
    else { bad++; console.error(`✗ ${name}.png doesn't match ${name}.html; run npm run wireframe -- --site ${values.site} ${name}`); }
  }
  if (bad) process.exit(1);
} else {
  const measured = values.plain ? new Map() : await measureAll(names);
  for (const name of names) {
    const tree = readSkeleton(skeleton(name));
    const m = measured.get(name);
    const img = renderTree(tree, m ?? {});
    const back = readImage(img);
    carrySlots(back, tree);
    if (!sameShape(back, tree)) {
      const keep = path.join(os.tmpdir(), `${name}.unsaved.png`);
      fs.writeFileSync(keep, encodePng(img));
      fail(`✗ ${name}: the drawing doesn't read back as the skeleton, so it wasn't saved (a bug in lib/wireframe.mjs).\n` +
        `  Drawing: ${keep}\n  It reads back as:\n${writeSkeleton(back).replace(/^/gm, "    ")}`);
    }
    fs.writeFileSync(file(name, "png"), encodePng(img));
    console.log(`✓ ${name}: ${rel(file(name, "png"))} (${img.width}x${img.height})${m ? `, measured from ${m.url}` : ""}`);
  }
}
