// Deploy built sites to Cloudflare Pages, one Pages project per domain.
//
//   node scripts/deploy.mjs --site ledger.example [--branch main] [--dry-run]
//
// Needs CLOUDFLARE_API_TOKEN (Account > Cloudflare Pages > Edit) and CLOUDFLARE_ACCOUNT_ID.
// Creates the Pages project the first time, uploads dist/<domain>/, and on the production
// branch makes sure the domain is attached to the project as a custom domain.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { pagesProject, validProject } from "../lib/cloudflare.mjs";
import { loadConfig, seoSite } from "../lib/site.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const WRANGLER = path.join(ROOT, "node_modules", ".bin", "wrangler");
const API = "https://api.cloudflare.com/client/v4";

const { values } = parseArgs({
  options: {
    site: { type: "string", multiple: true },
    branch: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});
const dryRun = values["dry-run"];
if (!values.site?.length) {
  console.error("usage: node scripts/deploy.mjs --site <domain> [--site <domain>...] [--branch <name>] [--dry-run]");
  process.exit(1);
}

const git = (...args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" }).stdout?.trim() || undefined;
const branch = values.branch ?? process.env.GITHUB_HEAD_REF ?? process.env.GITHUB_REF_NAME ?? git("rev-parse", "--abbrev-ref", "HEAD");
const commit = [process.env.GITHUB_SHA, git("rev-parse", "HEAD")].find((c) => /^[0-9a-f]{40}$/.test(c ?? ""));
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
if (!dryRun && (!token || !account)) {
  console.error("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (GitHub repo secrets in CI).");
  process.exit(1);
}

async function api(method, route, body) {
  const res = await fetch(`${API}/accounts/${account}${route}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

function wrangler(args) {
  console.log(`  $ wrangler ${args.join(" ")}`);
  if (dryRun) return;
  const run = spawnSync(WRANGLER, args, { cwd: ROOT, stdio: "inherit", env: process.env });
  if (run.status !== 0) throw new Error(`wrangler ${args[0]} ${args[1]} failed`);
}

async function deploy(domain) {
  const site = seoSite(loadConfig(path.join(ROOT, "sites", domain)));
  if (site.cloudflare.deploy === false) {
    console.log(`${domain}: not deployed (cloudflare.deploy is false in _config.yml)`);
    return;
  }
  const project = pagesProject(site);
  if (!validProject(project)) throw new Error(`Pages project name "${project}" must be 2-58 lowercase letters, digits or hyphens`);
  const production = site.cloudflare?.productionBranch ?? "main";
  const domains = site.cloudflare?.domains ?? [site.domain];
  const out = path.join(ROOT, "dist", domain);
  for (const file of ["index.html", "404.html", "_headers", "sitemap.xml", "robots.txt"]) {
    if (!fs.existsSync(path.join(out, file))) throw new Error(`dist/${domain}/${file} is missing; run npm run build first`);
  }

  const isProduction = branch === production;
  console.log(`${domain} -> Pages project "${project}" (${isProduction ? "production" : `preview of ${branch}`})`);

  if (!dryRun) {
    const found = await api("GET", `/pages/projects/${project}`);
    if (found.status === 404) wrangler(["pages", "project", "create", project, `--production-branch=${production}`]);
    else if (!found.success) throw new Error(`Cloudflare API: ${JSON.stringify(found.errors)}`);
  }

  wrangler(["pages", "deploy", path.relative(ROOT, out), `--project-name=${project}`, `--branch=${branch}`,
    ...(commit ? [`--commit-hash=${commit}`] : [])]);

  // Custom domains: attaching one also creates the DNS record when the zone is on Cloudflare.
  if (!isProduction) return;
  for (const name of domains) {
    if (dryRun) {
      console.log(`  would attach custom domain ${name}`);
      continue;
    }
    const existing = await api("GET", `/pages/projects/${project}/domains/${name}`);
    if (existing.success) {
      console.log(`  custom domain ${name}: ${existing.result?.status ?? "attached"}`);
      continue;
    }
    const added = await api("POST", `/pages/projects/${project}/domains`, { name });
    if (!added.success) throw new Error(`could not attach ${name}: ${JSON.stringify(added.errors)}`);
    console.log(`  attached custom domain ${name} (${added.result?.status}); DNS may take a few minutes`);
  }
}

const failed = [];
for (const domain of values.site) {
  try {
    await deploy(domain);
  } catch (e) {
    console.error(`✗ ${domain}: ${e.message}`);
    failed.push(domain);
  }
}
if (failed.length) process.exit(1);
