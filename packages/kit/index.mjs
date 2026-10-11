// defineSite(): the whole Astro config for one domain, built from its site.config.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seoCheck, formatIssues } from "./lib/lint.mjs";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const VIRTUAL = "virtual:seo-machine/site";

const HEADERS = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Cache-Control: public, max-age=0, must-revalidate

/_astro/*
  Cache-Control: public, max-age=31536000, immutable
`;

function validate(site, root) {
  const folder = path.basename(root);
  for (const key of ["domain", "name", "description"]) {
    if (!site[key]) throw new Error(`${folder}: site.config.mjs needs "${key}"`);
  }
  if (site.domain !== folder) throw new Error(`${folder}: site.config.mjs says domain "${site.domain}"; the folder name must match`);
  if (!DOMAIN_RE.test(site.domain)) throw new Error(`${folder}: folder name must be a bare lowercase domain like example.com`);
  // Sites may not pull files from each other: no symlinks out of the site folder.
  for (const sub of ["src", "public"]) {
    const dir = path.join(root, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir, { recursive: true })) {
      const real = fs.realpathSync(path.join(dir, f));
      if (!real.startsWith(root + path.sep)) throw new Error(`${folder}: ${sub}/${f} points outside the site folder`);
    }
  }
}

/** The integration: shared routes, the site config as a virtual module, and the SEO check after build. */
export function seoMachine(site, { routes = true } = {}) {
  return {
    name: "seo-machine",
    hooks: {
      "astro:config:setup": ({ injectRoute, updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [{
              name: "seo-machine-site",
              resolveId: (id) => (id === VIRTUAL ? "\0" + VIRTUAL : undefined),
              load: (id) => (id === "\0" + VIRTUAL ? `export default ${JSON.stringify(site)};` : undefined),
            }],
          },
        });
        const route = (pattern, file) => injectRoute({ pattern, entrypoint: `@seo-machine/kit/routes/${file}` });
        if (routes) {
          route("/[...slug]", "page.astro");
          route("/404", "404.astro");
        }
        route("/sitemap.xml", "sitemap.xml.mjs");
        route("/robots.txt", "robots.txt.mjs");
        route("/[feed].xml", "feed.xml.mjs");
      },
      "astro:build:done": async ({ dir }) => {
        const out = fileURLToPath(dir);
        fs.writeFileSync(path.join(out, "_headers"), HEADERS);
        const issues = seoCheck(site, out, site.root);
        const errors = issues.filter((i) => i.level === "error");
        const verbose = process.env.SEO_VERBOSE === "1";
        // console, not Astro's logger, so the report still shows under `astro build --silent`
        for (const line of formatIssues(verbose ? issues : errors)) console.log(`  ${line}`);
        console.log(`  SEO check for ${site.domain}: ${errors.length} errors, ${issues.length - errors.length} warnings`);
        if (errors.length && process.env.SEO_STRICT === "1") {
          throw new Error(`${site.domain}: ${errors.length} SEO errors (see above)`);
        }
      },
    },
  };
}

/**
 * In sites/<domain>/astro.config.mjs:
 *   export default defineSite(import.meta.url, site);
 */
export function defineSite(configUrl, site, { routes = true, astro = {} } = {}) {
  const root = path.dirname(fileURLToPath(configUrl));
  validate(site, root);
  const baseUrl = (process.env.SEO_BASE_URL ?? site.baseUrl ?? `https://${site.domain}`).replace(/\/$/, "");
  const resolved = { ...site, baseUrl, root };
  return {
    root,
    site: baseUrl,
    outDir: process.env.SEO_OUT_DIR ?? path.resolve(root, "../../dist", site.domain),
    trailingSlash: "always",
    build: { format: "directory", inlineStylesheets: "always" },
    compressHTML: true,
    devToolbar: { enabled: false },
    integrations: [seoMachine(resolved, { routes })],
    ...astro,
  };
}
