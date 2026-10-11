// Build every site (or --site <domain> ...) into dist/<domain>/, each on its own.
// A site that fails keeps its previous output and never stops the others.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const ROOT = path.resolve(import.meta.dirname, "..");
const SITES = path.join(ROOT, "sites");
const DIST = path.join(ROOT, "dist");
const ASTRO = path.join(ROOT, "node_modules", ".bin", "astro");

const { values } = parseArgs({
  options: {
    site: { type: "string", multiple: true },
    strict: { type: "boolean", default: false },   // fail on SEO errors
    verbose: { type: "boolean", short: "v", default: false }, // print SEO warnings too
    list: { type: "boolean", default: false },     // print the site list as JSON and exit
  },
});

export const listSites = () =>
  fs.readdirSync(SITES).filter((d) => fs.existsSync(path.join(SITES, d, "astro.config.mjs"))).sort();

if (values.list) {
  console.log(JSON.stringify(listSites()));
  process.exit(0);
}

const domains = values.site ?? listSites();
const failed = [];
for (const domain of domains) {
  const dir = path.join(SITES, domain);
  if (!fs.existsSync(path.join(dir, "astro.config.mjs"))) {
    console.error(`✗ ${domain}: no sites/${domain}/astro.config.mjs`);
    failed.push(domain);
    continue;
  }
  const out = path.join(DIST, domain);
  const staging = `${out}.staging`;
  fs.rmSync(staging, { recursive: true, force: true });
  const started = Date.now();
  const run = spawnSync(ASTRO, ["build", "--silent"], {
    cwd: dir,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      ASTRO_TELEMETRY_DISABLED: "1",
      SEO_OUT_DIR: staging,
      SEO_STRICT: values.strict ? "1" : "",
      SEO_VERBOSE: values.verbose ? "1" : "",
    },
  });
  if (run.status !== 0) {
    fs.rmSync(staging, { recursive: true, force: true });
    console.error(`✗ ${domain}: build failed; dist/${domain}/ left as it was`);
    failed.push(domain);
    continue;
  }
  fs.rmSync(out, { recursive: true, force: true }); // swap in only a finished build
  fs.renameSync(staging, out);
  const pages = fs.readdirSync(out, { recursive: true }).filter((f) => f.endsWith(".html")).length;
  console.log(`✓ ${domain}: ${pages} pages -> dist/${domain}/ (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

if (failed.length) {
  console.error(`\nfailed: ${failed.join(", ")}`);
  process.exit(1);
}
