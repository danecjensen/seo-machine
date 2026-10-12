// Sites build independently, and every page ships the SEO essentials.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");

// Work on a copy of the repo so tests can break sites freely.
function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seo-machine-"));
  t?.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const item of ["package.json", "scripts", "sites", "lib", "theme"]) {
    fs.cpSync(path.join(ROOT, item), path.join(dir, item), {
      recursive: true,
      filter: (src) => !src.includes(`${path.sep}node_modules`),
    });
  }
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
  return dir;
}

const build = (dir, ...args) =>
  spawnSync("node", ["scripts/build.mjs", ...args], { cwd: dir, encoding: "utf8" });
const read = (dir, file) => fs.readFileSync(path.join(dir, "dist", file), "utf8");
// A Liquid syntax error fails the build outright, as it would in Jekyll.
const breakPage = (dir) =>
  fs.writeFileSync(path.join(dir, "sites/plumbing.example/about.md"), "---\ntitle: Broken\n---\n{% if %}\n");

describe("isolation", () => {
  test("a broken site does not stop the others", (t) => {
    const dir = sandbox(t);
    breakPage(dir);
    const run = build(dir);
    assert.equal(run.status, 1);
    assert.ok(fs.existsSync(path.join(dir, "dist/ledger.example/index.html")));
    assert.ok(!fs.existsSync(path.join(dir, "dist/plumbing.example")));
  });

  test("a failed rebuild keeps the previous output", (t) => {
    const dir = sandbox(t);
    assert.equal(build(dir, "--site", "plumbing.example").status, 0);
    const before = read(dir, "plumbing.example/index.html");
    breakPage(dir);
    assert.equal(build(dir, "--site", "plumbing.example").status, 1);
    assert.equal(read(dir, "plumbing.example/index.html"), before);
    assert.ok(!fs.existsSync(path.join(dir, "dist/plumbing.example.staging")));
  });

  test("the folder name must match the configured domain", (t) => {
    const dir = sandbox(t);
    const cfg = path.join(dir, "sites/ledger.example/_config.yml");
    fs.writeFileSync(cfg, fs.readFileSync(cfg, "utf8").replace("url: https://ledger.example", "url: https://plumbing.example"));
    const run = build(dir, "--site", "ledger.example");
    assert.equal(run.status, 1);
    assert.match(run.stdout + run.stderr, /folder name must match/);
  });

  test("a site cannot link to another site's files", (t) => {
    const dir = sandbox(t);
    fs.symlinkSync(
      path.join(dir, "sites/plumbing.example/about.md"),
      path.join(dir, "sites/ledger.example/stolen.md"),
    );
    const run = build(dir, "--site", "ledger.example");
    assert.equal(run.status, 1);
    assert.match(run.stdout + run.stderr, /points outside the site folder/);
  });

  test("--strict fails a site with SEO errors", (t) => {
    const dir = sandbox(t);
    const page = path.join(dir, "sites/ledger.example/features.md");
    fs.writeFileSync(page, fs.readFileSync(page, "utf8").replace("[pricing page](/pricing/)", "[pricing page](/nope/)"));
    assert.equal(build(dir, "--site", "ledger.example").status, 0);
    const strict = build(dir, "--site", "ledger.example", "--strict");
    assert.equal(strict.status, 1);
    assert.match(strict.stdout, /broken internal link \/nope\//);
  });
});

describe("output", () => {
  let dir;
  before(() => {
    dir = sandbox();
    const run = build(dir, "--strict");
    assert.equal(run.status, 0, run.stdout + run.stderr);
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const pages = (domain) =>
    fs.readdirSync(path.join(dir, "dist", domain), { recursive: true }).filter((f) => f.endsWith(".html"));

  test("each site's files mention only its own domain", () => {
    for (const [domain, other] of [["ledger.example", "plumbing.example"], ["plumbing.example", "ledger.example"]]) {
      for (const f of fs.readdirSync(path.join(dir, "dist", domain), { recursive: true })) {
        if (/\.(html|xml|txt)$/.test(f)) assert.ok(!read(dir, `${domain}/${f}`).includes(other), `${domain}/${f}`);
      }
    }
  });

  test("every page has the SEO essentials", () => {
    for (const f of pages("plumbing.example")) {
      const html = read(dir, `plumbing.example/${f}`);
      for (const needle of ['<link rel="canonical" href="https://plumbing.example/', '<meta name="description"',
        'property="og:title"', 'application/ld+json', '<html lang="en"']) {
        assert.ok(html.includes(needle), `${f} is missing ${needle}`);
      }
      const graph = JSON.parse(html.match(/ld\+json">(.*?)<\/script>/s)[1])["@graph"];
      assert.equal(graph[0]["@type"], "Plumber");
      assert.ok(!/<script(?![^>]*ld\+json)/.test(html), `${f} ships JavaScript`);
    }
  });

  test("robots.txt, sitemap and feed", () => {
    assert.match(read(dir, "plumbing.example/robots.txt"), /Sitemap: https:\/\/plumbing\.example\/sitemap\.xml/);
    const sitemap = read(dir, "plumbing.example/sitemap.xml");
    assert.match(sitemap, /<loc>https:\/\/plumbing\.example\/services\/drain-cleaning\/<\/loc>/);
    assert.ok(!sitemap.includes("/thank-you/"), "noindex pages stay out of the sitemap");
    assert.match(read(dir, "ledger.example/feed.xml"), /<item><title>Quarterly Estimated Taxes/);
    assert.ok(!fs.existsSync(path.join(dir, "dist/plumbing.example/feed.xml")), "no posts, no feed");
    assert.match(read(dir, "ledger.example/sitemap.xml"), /blog\/quarterly-estimated-taxes\/<\/loc><lastmod>2026-10-01/);
  });
});

describe("cloudflare pages", () => {
  let dir;
  before(() => {
    dir = sandbox();
    assert.equal(build(dir).status, 0);
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("every site gets _headers that keep pages.dev out of search", () => {
    for (const domain of ["ledger.example", "plumbing.example"]) {
      const headers = read(dir, `${domain}/_headers`);
      assert.match(headers, /https:\/\/:project\.pages\.dev\/\*\n  X-Robots-Tag: noindex/);
      assert.match(headers, /X-Content-Type-Options: nosniff/);
    }
  });

  test("redirects cover both /old/ and /old", () => {
    const lines = read(dir, "plumbing.example/_redirects").trim().split("\n");
    assert.ok(lines.includes("/water-heaters/ /services/water-heater-repair/ 301"));
    assert.ok(lines.includes("/water-heaters /services/water-heater-repair/ 301"));
    assert.ok(!fs.existsSync(path.join(dir, "dist/ledger.example/_redirects")), "no redirects, no file");
  });

  test("deploy targets one Pages project per domain and skips example sites", () => {
    const run = spawnSync("node", ["scripts/deploy.mjs", "--site", "gohappyclub.com", "--site", "ledger.example",
      "--branch", "main", "--dry-run"], { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_SHA: "abc" } });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /pages deploy dist\/gohappyclub\.com --project-name=gohappyclub-com --branch=main/);
    assert.match(run.stdout, /would attach custom domain gohappyclub\.com/);
    assert.match(run.stdout, /would attach custom domain www\.gohappyclub\.com/);
    assert.match(run.stdout, /ledger\.example: not deployed/);
    assert.doesNotMatch(run.stdout, /project-name=ledger-example/);
  });
});
