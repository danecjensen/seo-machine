// Eleventy, set up to feel like Jekyll: _config.yml, _layouts, _includes, _data, _posts,
// Liquid with Jekyll-style {% include file.html key=value %}, and Jekyll's common filters.
// scripts/build.mjs runs this once per site, against that site's folder plus the shared theme.
import fs from "node:fs";
import path from "node:path";
import markdownItAnchor from "markdown-it-anchor";
import YAML from "yaml";
import { headersFile, redirectLines } from "./cloudflare.mjs";
import { isoDate, longDate } from "./format.mjs";
import { headings, minifyCss, minifyHtml, polishImages } from "./html.mjs";
import { formatIssues, seoCheck } from "./lint.mjs";
import { gitDates, parentUrl } from "./pages.mjs";
import * as seo from "./seo.mjs";
import { loadConfig, seoSite } from "./site.mjs";

const MEDIA = "png,jpg,jpeg,gif,webp,avif,pdf,mp4,webm";

const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Front matter in the shape the SEO helpers expect, accepting jekyll-seo-tag's names too. */
function seoData(d) {
  const image = typeof d.image === "object" ? d.image : { path: d.image, alt: d.image_alt };
  return {
    title: d.title ?? "",
    description: d.description ?? "",
    seo_title: d.seo_title,
    heading: d.heading,
    nav_title: d.nav_title,
    image: image.path,
    image_alt: image.alt,
    noindex: d.noindex === true,
    canonical: d.canonical_url ?? d.canonical,
    faq: d.faq,
    service: d.service && { currency: "USD", ...d.service },
    author: typeof d.author === "object" ? d.author?.name : d.author,
  };
}

// "Which plan is right for you?" -> "which-plan-is-right-for-you", as kramdown does.
const kramdownId = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");

const kindOf = (d) => d.type ?? (d.page?.inputPath?.includes("/_posts/") ? "post" : "page");

export default function (eleventyConfig) {
  const input = eleventyConfig.directories.input;
  const siteDir = process.env.SEO_SITE_DIR ?? input; // the real site folder, for git dates
  const config = loadConfig(siteDir);
  const site = seoSite(config);
  const commits = gitDates(siteDir);

  eleventyConfig.setLayoutsDirectory("_layouts");
  eleventyConfig.setIncludesDirectory("_includes");
  eleventyConfig.setDataDirectory("_data");
  eleventyConfig.addDataExtension("yml,yaml", (text) => YAML.parse(text));
  eleventyConfig.addGlobalData("site", { ...config, url: site.baseUrl });
  eleventyConfig.setLiquidOptions({ dynamicPartials: false, jekyllInclude: true });
  eleventyConfig.setQuietMode(true);
  eleventyConfig.setUseGitIgnore(false); // sites build from .build/, which git ignores

  // Jekyll leaves out drafts, _config.yml and anything marked published: false.
  eleventyConfig.ignores.add("_drafts/**");
  eleventyConfig.ignores.add("README.md");
  eleventyConfig.addPreprocessor("unpublished", "*", (data) => (data.published === false ? false : undefined));

  // Jekyll's front matter `defaults:` from _config.yml, and layout "page" for any Markdown page without one.
  eleventyConfig.addPreprocessor("defaults", "md,html", (data) => {
    const rel = path.relative(input, data.page.inputPath).replace(/\\/g, "/");
    const type = rel.startsWith("_posts/") ? "posts" : "pages";
    for (const { scope = {}, values = {} } of config.defaults ?? []) {
      if (scope.type && scope.type !== type) continue;
      if (scope.path && !rel.startsWith(scope.path.replace(/^\.?\//, ""))) continue;
      for (const [k, v] of Object.entries(values)) if (data[k] === undefined) data[k] = v;
    }
    if (type === "posts") {
      // _posts/2026-09-02-my-title.md -> /blog/my-title/ (or `permalink:` in _config.yml)
      data.layout ??= "post";
      if (data.permalink === undefined) {
        const d = data.page.date;
        const pad = (n) => String(n).padStart(2, "0");
        data.permalink = (config.permalink ?? "/blog/:title/")
          .replace(":title", data.page.fileSlug)
          .replace(":year", d.getUTCFullYear())
          .replace(":month", pad(d.getUTCMonth() + 1))
          .replace(":day", pad(d.getUTCDate()));
      }
    }
    if (data.layout === undefined && rel.endsWith(".md")) data.layout = "page";
  });

  // Static files are copied as-is, like Jekyll does for anything without front matter.
  // scripts/build.mjs runs Eleventy from inside the site's build folder, so these paths are site-relative.
  eleventyConfig.addPassthroughCopy("assets/**");
  eleventyConfig.addPassthroughCopy("*.{ico,svg,png,txt,webmanifest}");
  eleventyConfig.addPassthroughCopy(`**/*.{${MEDIA}}`); // images next to the pages that use them

  // kramdown-style Markdown: heading ids and smart quotes.
  eleventyConfig.amendLibrary("md", (md) => {
    md.set({ typographer: true });
    md.use(markdownItAnchor, { tabIndex: false, slugify: kramdownId });
  });

  // Jekyll's site.posts, newest first: every file in _posts/.
  eleventyConfig.addCollection("posts", (api) =>
    api.getAll().filter((p) => p.inputPath.includes("/_posts/")).sort((a, b) => b.date - a.date));

  // What the SEO check needs to know about each page, captured once per build.
  const meta = new Map();
  const redirects = [...(config.redirects ?? [])];
  eleventyConfig.addCollection("_seo", (api) => {
    meta.clear();
    redirects.length = (config.redirects ?? []).length;
    for (const item of api.getAll()) {
      if (!item.url) continue;
      meta.set(item.url, { kind: kindOf(item.data), keyword: item.data.keyword });
      for (const from of [item.data.redirect_from ?? []].flat()) redirects.push({ from, to: item.url, status: 301 });
    }
    return [];
  });

  // Jekyll's filters, plus a few for the theme.
  eleventyConfig.addFilter("absolute_url", (url) => seo.absolute(site, url ?? "/"));
  eleventyConfig.addFilter("relative_url", (url) => url);
  eleventyConfig.addFilter("date_to_xmlschema", (d) => new Date(d).toISOString());
  eleventyConfig.addFilter("date_to_long_string", (d) => longDate(new Date(d)));
  eleventyConfig.addFilter("date_to_string", (d) =>
    new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }));
  eleventyConfig.addFilter("date_to_rfc822", (d) => new Date(d).toUTCString());
  eleventyConfig.addFilter("iso_date", (d) => isoDate(new Date(d)));
  eleventyConfig.addFilter("xml_escape", (s) => escapeHtml(s).replace(/'/g, "&apos;"));
  eleventyConfig.addFilter("jsonify", (v) => JSON.stringify(v));
  eleventyConfig.addFilter("cssmin", minifyCss);
  eleventyConfig.addFilter("css_vars", (vars) =>
    Object.entries(vars ?? {}).map(([k, v]) => `--${k.replace(/_/g, "-")}:${v};`).join(""));
  eleventyConfig.addFilter("toc", (html) => headings(String(html ?? "")));
  eleventyConfig.addFilter("children", (url, all) =>
    (all ?? []).filter((p) => p.url && p.url !== url && parentUrl(p.url) === url && !p.data.noindex)
      .sort((a, b) => b.date - a.date || a.url.localeCompare(b.url)));
  eleventyConfig.addFilter("lastmod", (item) => {
    const dates = [item.data.last_modified_at, item.inputPath.includes("/_posts/") && item.date,
      commits.get(path.join(siteDir, path.relative(input, item.inputPath)))].filter(Boolean).map((d) => new Date(d));
    return dates.length ? isoDate(new Date(Math.max(...dates))) : "";
  });
  eleventyConfig.addFilter("in_sitemap", (all) =>
    (all ?? []).filter((p) => p.url?.endsWith("/") && !p.data.noindex && p.data.sitemap !== false && !p.data.canonical_url)
      .sort((a, b) => a.url.localeCompare(b.url)));

  // {% seo %}: everything jekyll-seo-tag puts in <head>, plus richer JSON-LD.
  eleventyConfig.addShortcode("seo", function () {
    const d = this.ctx.getAll();
    const all = d.collections?.all ?? [];
    const byUrl = new Map(all.filter((p) => p.url).map((p) => [p.url, { url: p.url, data: seoData(p.data) }]));
    const kind = kindOf(d);
    const page = {
      url: this.page.url,
      kind,
      data: seoData(d),
      published: kind === "post" ? this.page.date : undefined,
      updated: kind === "post" ? new Date(d.last_modified_at ?? this.page.date) : undefined,
    };
    const h = seo.head(site, page, byUrl);
    const tag = (name, attr, value) => (value ? `<meta ${attr}="${name}" content="${escapeHtml(value)}">` : "");
    return [
      `<title>${escapeHtml(h.title)}</title>`,
      tag("description", "name", h.description),
      `<link rel="canonical" href="${escapeHtml(h.canonical)}">`,
      tag("robots", "name", h.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1"),
      tag("og:type", "property", h.ogType),
      tag("og:site_name", "property", site.name),
      tag("og:title", "property", h.ogTitle),
      tag("og:description", "property", h.description),
      tag("og:url", "property", h.canonical),
      tag("og:locale", "property", site.locale),
      tag("og:image", "property", h.image),
      h.image && tag("og:image:alt", "property", h.imageAlt),
      tag("article:published_time", "property", h.published),
      tag("article:modified_time", "property", h.modified),
      tag("twitter:card", "name", h.image ? "summary_large_image" : "summary"),
      tag("twitter:site", "name", site.twitter),
      `<script type="application/ld+json">${h.jsonld}</script>`,
    ].filter(Boolean).join("\n");
  });

  // Breadcrumb trail for the visible breadcrumbs include (the JSON-LD uses the same trail).
  eleventyConfig.addFilter("breadcrumbs", (url, all) => {
    const byUrl = new Map((all ?? []).filter((p) => p.url).map((p) => [p.url, { url: p.url, data: seoData(p.data) }]));
    return seo.breadcrumbs({ url }, byUrl);
  });

  eleventyConfig.addTransform("polish", (content, outputPath) =>
    outputPath?.endsWith(".html") ? minifyHtml(polishImages(content, input)) : content);

  eleventyConfig.on("eleventy.after", ({ directories }) => {
    const out = directories.output;
    fs.writeFileSync(path.join(out, "_headers"), headersFile());
    if (![...meta.values()].some((m) => m.kind === "post")) fs.rmSync(path.join(out, "feed.xml"), { force: true });
    if (redirects.length) fs.writeFileSync(path.join(out, "_redirects"), redirectLines(redirects).join("\n") + "\n");

    const issues = seoCheck(site, out, meta, redirects);
    const errors = issues.filter((i) => i.level === "error");
    for (const line of formatIssues(process.env.SEO_VERBOSE === "1" ? issues : errors)) console.log(`  ${line}`);
    console.log(`  SEO check for ${site.domain}: ${errors.length} errors, ${issues.length - errors.length} warnings`);
    if (errors.length && process.env.SEO_STRICT === "1") {
      throw new Error(`${site.domain}: ${errors.length} SEO errors (see above)`);
    }
  });

  return {
    templateFormats: ["md", "html", "liquid"],
    markdownTemplateEngine: "liquid",
    htmlTemplateEngine: "liquid",
  };
}
