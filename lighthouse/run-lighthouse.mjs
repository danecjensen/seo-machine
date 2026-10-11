#!/usr/bin/env node
// Runs Lighthouse CI against every built site and fails when any domain misses its budgets.
//
//   node run-lighthouse.mjs [--dist dist] [--sites sites] [--out lighthouse-reports] [--domain example.com ...]
//
// Each subfolder of --dist is one domain's static build. Budgets come from budgets.default.json,
// merged with sites/<domain>/lighthouse.json when present. Every domain runs in its own output
// folder so results never mix. Writes summary.md and summary.json to --out, appends the summary
// to $GITHUB_STEP_SUMMARY when set, and exits 1 if any domain failed.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const lhciBin = require.resolve('@lhci/cli/src/cli.js');

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const METRICS = {
  'largest-contentful-paint': { label: 'LCP', unit: 'ms' },
  'cumulative-layout-shift': { label: 'CLS', unit: '' },
  'total-blocking-time': { label: 'TBT', unit: 'ms' },
};

function parseArgs(argv) {
  const opts = { dist: 'dist', sites: 'sites', out: 'lighthouse-reports', domains: [] };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[++i];
    if (value === undefined) throw new Error(`Missing value for --${key}`);
    if (key === 'domain') opts.domains.push(value);
    else if (key in opts) opts[key] = value;
    else throw new Error(`Unknown option --${key}`);
  }
  return opts;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function budgetsFor(domain, sitesDir) {
  const base = readJson(path.join(here, 'budgets.default.json'));
  const overrideFile = path.join(sitesDir, domain, 'lighthouse.json');
  if (!existsSync(overrideFile)) return base;
  const override = readJson(overrideFile);
  return {
    ...base,
    ...override,
    categories: { ...base.categories, ...override.categories },
    metrics: { ...base.metrics, ...override.metrics },
  };
}

// Paths of a sitemap's <loc> entries, following a sitemap index into its child sitemaps.
function sitemapPaths(siteDir, file, seen = new Set()) {
  if (seen.has(file) || !existsSync(path.join(siteDir, file))) return [];
  seen.add(file);
  const xml = readFileSync(path.join(siteDir, file), 'utf8');
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => new URL(m[1].replace(/&amp;/g, '&')).pathname);
  if (/<sitemapindex[\s>]/.test(xml)) return locs.flatMap((loc) => sitemapPaths(siteDir, loc.replace(/^\//, ''), seen));
  return locs;
}

function isNoindex(html) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].some(
    ([tag]) => /name\s*=\s*["']?(robots|googlebot)["']?/i.test(tag) && /content\s*=\s*["'][^"']*noindex/i.test(tag),
  );
}

function htmlFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(full, base);
    return entry.name.endsWith('.html') ? [path.relative(base, full)] : [];
  });
}

// Pages to audit: the sitemap when the site has one (it lists exactly the indexable pages),
// otherwise every HTML file without a noindex robots meta.
function pagesFor(siteDir, maxUrls) {
  let paths;
  let source;
  for (const file of ['sitemap-index.xml', 'sitemap.xml']) {
    paths = sitemapPaths(siteDir, file);
    if (paths.length) {
      source = file;
      break;
    }
  }
  if (!paths.length) {
    source = 'HTML files without noindex';
    paths = htmlFiles(siteDir)
      .filter((file) => !isNoindex(readFileSync(path.join(siteDir, file), 'utf8')))
      .map((file) => `/${file.split(path.sep).join('/')}`.replace(/(^|\/)index\.html$/, '$1'));
  }
  paths = [...new Set(paths)].sort((a, b) => a.length - b.length || a.localeCompare(b));
  return { source, total: paths.length, paths: paths.slice(0, maxUrls) };
}

function lhciConfig(siteDir, budgets, pages) {
  const chromeFlags = ['--headless=new'];
  if (process.getuid?.() === 0) chromeFlags.push('--no-sandbox');
  const assertions = {};
  for (const [category, min] of Object.entries(budgets.categories)) {
    assertions[`categories:${category}`] = ['error', { minScore: min, aggregationMethod: 'median-run' }];
  }
  for (const [metric, max] of Object.entries(budgets.metrics)) {
    assertions[metric] = ['error', { maxNumericValue: max, aggregationMethod: 'median-run' }];
  }
  return {
    ci: {
      collect: {
        staticDistDir: siteDir,
        url: pages.paths.map((p) => `http://localhost${p}`),
        numberOfRuns: budgets.numberOfRuns,
        settings: {
          chromeFlags: chromeFlags.join(' '),
          ...(budgets.preset === 'desktop' ? { preset: 'desktop' } : {}),
        },
      },
      assert: { assertions },
      upload: { target: 'filesystem', outputDir: './reports' },
    },
  };
}

function lhci(args, cwd) {
  const result = spawnSync(process.execPath, [lhciBin, ...args, '--config=./lighthouserc.json'], {
    cwd,
    encoding: 'utf8',
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Median of each score across runs, per URL, then the worst URL per domain.
function summarize(workDir) {
  const lhrDir = path.join(workDir, '.lighthouseci');
  const byUrl = new Map();
  for (const file of readdirSync(lhrDir).filter((f) => /^lhr-.*\.json$/.test(f))) {
    const lhr = readJson(path.join(lhrDir, file));
    const url = new URL(lhr.finalDisplayedUrl ?? lhr.finalUrl ?? lhr.requestedUrl).pathname;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(lhr);
  }
  const pages = [...byUrl].map(([url, runs]) => {
    const scores = {};
    for (const c of CATEGORIES) scores[c] = median(runs.map((r) => r.categories[c]?.score ?? 0));
    for (const m of Object.keys(METRICS)) scores[m] = median(runs.map((r) => r.audits[m]?.numericValue ?? 0));
    return { url, runs: runs.length, scores };
  });
  const worst = {};
  for (const c of CATEGORIES) worst[c] = Math.min(...pages.map((p) => p.scores[c]));
  for (const m of Object.keys(METRICS)) worst[m] = Math.max(...pages.map((p) => p.scores[m]));
  return { pages: pages.sort((a, b) => a.url.localeCompare(b.url)), worst };
}

function failedAssertions(workDir) {
  const file = path.join(workDir, '.lighthouseci', 'assertion-results.json');
  if (!existsSync(file)) return [];
  return readJson(file)
    .filter((a) => !a.passed && a.level === 'error')
    .map((a) => {
      const page = new URL(a.url).pathname;
      const name = a.auditProperty ? `${a.auditId}:${a.auditProperty}` : a.auditId;
      return `${page} ${name}: ${round(a.actual, a.auditProperty ? 2 : 0)} (budget ${a.operator} ${a.expected})`;
    });
}

function round(value, digits) {
  return Number(value.toFixed(digits));
}

function formatScore(score, min) {
  const pct = Math.round(score * 100);
  return min !== undefined && score < min ? `**${pct}** ❌` : `${pct}`;
}

function formatMetric(metric, value, max) {
  const shown = METRICS[metric].unit === 'ms' ? `${Math.round(value)} ms` : round(value, 3);
  return max !== undefined && value > max ? `**${shown}** ❌` : `${shown}`;
}

function renderMarkdown(results) {
  const header = ['Domain', 'Result', 'Perf', 'A11y', 'Best practices', 'SEO', ...Object.values(METRICS).map((m) => m.label), 'Pages'];
  const lines = ['## Lighthouse scores by domain', '', `| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.domain} | ❌ error | ${header.slice(2).map(() => '').join(' | ')} |`);
      continue;
    }
    const cells = [
      r.domain,
      r.passed ? '✅ pass' : '❌ fail',
      ...CATEGORIES.map((c) => formatScore(r.worst[c], r.budgets.categories[c])),
      ...Object.keys(METRICS).map((m) => formatMetric(m, r.worst[m], r.budgets.metrics[m])),
      r.pages.length,
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  lines.push('', 'Scores are the median of each page’s runs; each column shows the domain’s worst page.');
  for (const r of results.filter((x) => !x.passed)) {
    lines.push('', `### ${r.domain}`, '');
    if (r.error) lines.push('```', r.error.trim().slice(-2000), '```');
    for (const f of r.failures ?? []) lines.push(`- ${f}`);
  }
  return `${lines.join('\n')}\n`;
}

function runDomain(domain, opts) {
  const siteDir = path.resolve(opts.dist, domain);
  const workDir = path.resolve(opts.out, domain);
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  const budgets = budgetsFor(domain, opts.sites);
  const targets = pagesFor(siteDir, budgets.maxUrls);
  console.log(`\n▶ ${domain}: ${targets.paths.length} of ${targets.total} pages from ${targets.source}`);
  if (!targets.paths.length) return { domain, budgets, passed: false, error: `No indexable pages found in ${siteDir}` };
  writeFileSync(path.join(workDir, 'lighthouserc.json'), JSON.stringify(lhciConfig(siteDir, budgets, targets), null, 2));

  const collect = lhci(['collect'], workDir);
  if (!collect.ok) return { domain, budgets, passed: false, error: collect.output };
  const assert = lhci(['assert'], workDir);
  lhci(['upload'], workDir);
  const { pages, worst } = summarize(workDir);
  const failures = failedAssertions(workDir);
  const passed = assert.ok;
  console.log(passed ? `  ✅ ${domain} met its budgets` : `  ❌ ${domain} missed its budgets\n${failures.map((f) => `    ${f}`).join('\n')}`);
  return { domain, budgets, passed, pages, worst, failures };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!existsSync(opts.dist)) throw new Error(`No build output at ${opts.dist}`);
  const domains = opts.domains.length
    ? opts.domains
    : readdirSync(opts.dist, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  if (!domains.length) throw new Error(`No domain folders found in ${opts.dist}`);

  const results = domains.map((domain) => runDomain(domain, opts));
  mkdirSync(opts.out, { recursive: true });
  const markdown = renderMarkdown(results);
  writeFileSync(path.join(opts.out, 'summary.md'), markdown);
  writeFileSync(path.join(opts.out, 'summary.json'), JSON.stringify(results.map(({ error, ...r }) => r), null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(`\n${markdown}`);
  process.exit(results.every((r) => r.passed) ? 0 : 1);
}

main();
