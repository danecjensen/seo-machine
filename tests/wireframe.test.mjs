// Archetype skeletons <-> grayscale wireframe images.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { findBrowser } from "../lib/wireframe-measure.mjs";
import { carrySlots, decodePng, encodePng, readImage, readSkeleton, renderTree, sameShape, toLayout, writeSkeleton } from "../lib/wireframe.mjs";

const SITES = path.resolve(import.meta.dirname, "..", "sites");
const archetypes = fs.readdirSync(SITES).flatMap((site) => {
  const dir = path.join(SITES, site, "_archetypes");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => path.join(dir, f)) : [];
});

test("every archetype survives skeleton -> image -> skeleton unchanged", () => {
  assert.ok(archetypes.length >= 3);
  for (const file of archetypes) {
    const tree = readSkeleton(fs.readFileSync(file, "utf8"));
    const back = readImage(decodePng(encodePng(renderTree(tree))));
    assert.deepEqual(carrySlots(back, tree), [], file);
    assert.equal(writeSkeleton(back), writeSkeleton(tree), file);
  }
});

test("every committed wireframe image reads back as its skeleton", () => {
  for (const file of archetypes) {
    const tree = readSkeleton(fs.readFileSync(file, "utf8"));
    const back = readImage(decodePng(fs.readFileSync(file.replace(/\.html$/, ".png"))));
    carrySlots(back, tree);
    assert.ok(sameShape(back, tree), `${file}: run npm run wireframe`);
  }
});

test("wireframes drawn from the built pages read back as their skeletons", async (t) => {
  if (!(await findBrowser())) return t.skip("no Chrome or Chromium to measure pages with");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seo-machine-wf-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.resolve(import.meta.dirname, "..");
  for (const item of ["package.json", "scripts", "sites", "lib", "theme"]) fs.cpSync(path.join(root, item), path.join(dir, item), { recursive: true });
  fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
  const run = spawnSync("node", ["scripts/wireframe.mjs", "--site", "gohappyclub.com"], { cwd: dir, encoding: "utf8" });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /home: .* measured from \/$/m);
  const home = decodePng(fs.readFileSync(path.join(dir, "sites/gohappyclub.com/_archetypes/home.png")));
  assert.notEqual(home.gray[0], 255, "the site header is drawn as a band across the top");
});

/** Half-size RGBA PNG with blended edges, like an image exported from a drawing tool. */
function roughCopy({ width, height, gray }) {
  const w = width >> 1, h = height >> 1, raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = 2 * y * width + 2 * x, v = Math.round((gray[i] + gray[i + 1] + gray[i + width] + gray[i + width + 1]) / 4);
    raw.set([v, v, v, 255], y * (w * 4 + 1) + 1 + x * 4);
  }
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, "latin1"); data.copy(b, 8);
    b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("an edited wireframe becomes a skeleton that keeps its slot names", () => {
  const html = `<section><div class="row"><div data-span="7"><h1 data-slot="heading"></h1><p data-lines="2" data-slot="lede"></p><a data-slot="actions"></a></div>
    <div data-span="5"><figure data-ratio="4:3" data-slot="hero-image"></figure></div></div></section>
    <section><h2 data-slot="products-title"></h2><div class="row">${
      `<div data-span="3" data-slot="product-card"><figure></figure><h3></h3><p data-lines="2"></p></div>`.repeat(4)}</div></section>`;
  const old = readSkeleton(html);
  // The edit: three products a row instead of four, and the hero split 6/6.
  const edited = readSkeleton(html.replace(/data-span="3"/g, 'data-span="4"').replace(/(<div data-span="4" data-slot="product-card">.*?<\/div>)\1\1\1/s, "$1$1$1")
    .replace('data-span="7"', 'data-span="6"').replace('data-span="5"', 'data-span="6"'));
  const tree = readImage(decodePng(roughCopy(renderTree(edited))));
  assert.deepEqual(carrySlots(tree, old), []);
  assert.deepEqual(tree.sections[0].groups[0].cols.map((c) => c.span), [6, 6]);
  assert.deepEqual(tree.sections[1].groups[1].cols.map((c) => [c.span, c.slot]), [[4, "product-card"], [4, "product-card"], [4, "product-card"]]);
  const layout = toLayout(tree, "home");
  assert.match(layout, /\{% include slots\/product-card\.html span=4 level=3 ratio="1x1" %\}/);
  assert.match(layout, /<div class="wf-col span-6">\n\{% include slots\/heading\.html level=1 %\}/);
});

test("a block with no slot shows a placeholder, and bad skeletons are refused", () => {
  assert.match(toLayout(readSkeleton("<section><h2></h2></section>"), "x"), /\[Placeholder: h2 block, no data-slot\]/);
  assert.throws(() => readSkeleton("<section><div>hi</div></section>"), /isn't a block/);
  assert.throws(() => readSkeleton(`<section><div class="row"><div data-span="13"></div></div></section>`), /data-span/);
});
