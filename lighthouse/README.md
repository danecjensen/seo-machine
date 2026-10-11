# Lighthouse checks

Runs Lighthouse CI against every built site and fails the build when a domain misses its budgets.

## Layout it expects

```
dist/<domain>/            static build output, one folder per domain
sites/<domain>/lighthouse.json   optional per-domain budget overrides
lighthouse/               this folder
```

## Which pages

The pages listed in the site's sitemap (`sitemap-index.xml` or `sitemap.xml`, following an index into
its child sitemaps), since those are exactly the indexable pages. A site without a sitemap gets every
HTML file that has no `noindex` robots meta. Either way, up to `maxUrls` pages per domain.

## Budgets

`budgets.default.json` applies to every domain (mobile emulation, median of 3 runs, up to 10 pages):

| Check | Budget |
|---|---|
| Performance | ≥ 90 |
| Accessibility | ≥ 95 |
| Best practices | ≥ 95 |
| SEO | 100 |
| LCP | ≤ 2500 ms |
| CLS | ≤ 0.1 |
| TBT | ≤ 200 ms |

Override any key for one domain, e.g. `sites/shop.example/lighthouse.json`:

```json
{ "categories": { "performance": 0.85 }, "maxUrls": 25 }
```

## Running

```
cd lighthouse && npm ci && cd ..
node lighthouse/run-lighthouse.mjs                # all domains in dist/
node lighthouse/run-lighthouse.mjs --domain a.com # one domain
```

Each domain runs in its own `lighthouse-reports/<domain>/` folder (HTML reports in `reports/`).
`lighthouse-reports/summary.md` and `summary.json` hold the per-domain score table; in GitHub
Actions the table also appears on the run's summary page. Exit code is 1 if any domain failed.

## CI

`github/lighthouse.yml` goes to `.github/workflows/lighthouse.yml`. It builds once, then runs one
job per domain, so each domain has its own check on the PR.
