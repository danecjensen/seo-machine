// Reads a site's Jekyll-style _config.yml and checks it belongs in its folder.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

export const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function loadConfig(siteDir) {
  const file = path.join(siteDir, "_config.yml");
  const folder = path.basename(siteDir);
  if (!fs.existsSync(file)) throw new Error(`${folder}: no _config.yml`);
  const config = YAML.parse(fs.readFileSync(file, "utf8")) ?? {};
  for (const key of ["title", "description", "url"]) {
    if (!config[key]) throw new Error(`${folder}: _config.yml needs "${key}"`);
  }
  const host = new URL(config.url).hostname;
  if (host !== folder) throw new Error(`${folder}: _config.yml url is ${config.url}; the folder name must match its domain`);
  if (!DOMAIN_RE.test(folder)) throw new Error(`${folder}: folder name must be a bare lowercase domain like example.com`);
  return config;
}

/** The shape the SEO helpers use, built from Jekyll-style keys (jekyll-seo-tag names where they exist). */
export function seoSite(config) {
  const image = typeof config.image === "object" ? config.image : { path: config.image };
  const twitter = typeof config.twitter === "object" ? config.twitter.username : config.twitter;
  return {
    domain: new URL(config.url).hostname,
    name: config.title,
    description: config.description,
    baseUrl: (process.env.SEO_BASE_URL ?? config.url).replace(/\/$/, ""),
    language: config.lang ?? "en",
    locale: config.locale ?? "en_US",
    titleTemplate: config.title_format ?? "{title} | {site}",
    defaultImage: image.path,
    defaultImageAlt: image.alt,
    twitter: twitter && (twitter.startsWith("@") ? twitter : `@${twitter}`),
    author: typeof config.author === "object" ? config.author.name : config.author,
    organization: { ...(config.logo && { logo: config.logo }), ...config.organization },
    goals: config.goals ?? {},
    lint: config.lint ?? {},
    robots: config.robots ?? {},
    cloudflare: config.cloudflare ?? {},
  };
}

/** Sites may not pull files from each other: no symlinks that lead out of the site folder. */
export function assertSelfContained(siteDir) {
  const root = fs.realpathSync(siteDir);
  for (const f of fs.readdirSync(siteDir, { recursive: true })) {
    const real = fs.realpathSync(path.join(siteDir, f));
    if (real !== root && !real.startsWith(root + path.sep)) {
      throw new Error(`${path.basename(siteDir)}: ${f} points outside the site folder`);
    }
  }
}
