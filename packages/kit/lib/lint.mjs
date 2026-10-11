// SEO checks on the built HTML. Errors fail a strict build; warnings are advice.
import fs from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";
import YAML from "yaml";
import { redirectLines } from "./cloudflare.mjs";
import { urlFor } from "./pages.mjs";

const SLUG = /^\/([a-z0-9]+(-[a-z0-9]+)*\/)*$/;

function frontMatter(root) {
  const dir = path.join(root, "src", "content");
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const file of fs.readdirSync(dir, { recursive: true })) {
    if (!file.endsWith(".md")) continue;
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const data = m ? YAML.parse(m[1]) ?? {} : {};
    if (data.draft) continue;
    let { url, kind } = urlFor(file.replace(/\\/g, "/").replace(/\.md$/, ""));
    if (data.type) kind = data.type;
    else if (kind === "post" && !data.date) kind = "page";
    out.set(url, { ...data, kind });
  }
  return out;
}

function htmlFiles(dir) {
  return fs.readdirSync(dir, { recursive: true })
    .filter((f) => f.endsWith("index.html"))
    .map((f) => ({ file: path.join(dir, f), url: "/" + f.replace(/\\/g, "/").replace(/index\.html$/, "") }));
}

export function seoCheck(site, out, root) {
  const issues = [];
  const add = (level, url, message) => issues.push({ level, url, message });
  const meta = frontMatter(root);
  const files = htmlFiles(out);
  const urls = new Set(files.map((f) => f.url));
  const titles = new Map();
  const descriptions = new Map();
  const minWords = site.lint?.minWords ?? 250;

  for (const { file, url } of files) {
    const doc = parse(fs.readFileSync(file, "utf8"));
    const fm = meta.get(url) ?? {};
    const title = doc.querySelector("title")?.text.trim() ?? "";
    const desc = doc.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
    const robots = doc.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "";
    const indexable = !robots.includes("noindex");

    if (!title) add("error", url, "no <title>");
    if (!desc) add("error", url, "no meta description");
    if (!doc.querySelector('link[rel="canonical"]')) add("error", url, "no canonical link");
    if (indexable) {
      titles.set(title, [...(titles.get(title) ?? []), url]);
      if (desc) descriptions.set(desc, [...(descriptions.get(desc) ?? []), url]);
    }
    if (desc && (desc.length < 50 || desc.length > 160)) add("warning", url, `description is ${desc.length} chars; aim for 50-160`);
    if (title.length < 15 || title.length > 60) add("warning", url, `title is ${title.length} chars; aim for 15-60 so it isn't cut off`);
    if (!SLUG.test(url)) add("warning", url, "URL should be lowercase words joined by hyphens");

    const h1s = doc.querySelectorAll("h1");
    if (h1s.length !== 1) add("error", url, `${h1s.length} <h1> tags; every page needs exactly one`);
    const levels = doc.querySelectorAll("h1,h2,h3,h4,h5,h6").map((h) => Number(h.tagName[1]));
    const jump = levels.findIndex((l, i) => i > 0 && l > levels[i - 1] + 1);
    if (jump > 0) add("warning", url, `heading jumps from h${levels[jump - 1]} to h${levels[jump]}`);

    for (const img of doc.querySelectorAll("img")) {
      const src = img.getAttribute("src");
      if (!img.hasAttribute("alt")) add("error", url, `image ${src} has no alt text`);
      if (!img.hasAttribute("width") || !img.hasAttribute("height")) add("warning", url, `image ${src} has no width/height (causes layout shift)`);
    }

    for (const a of doc.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href");
      if (href.startsWith("/") && !href.startsWith("//")) {
        const target = href.split("#")[0].split("?")[0];
        if (urls.has(target) || fs.existsSync(path.join(out, target)) && fs.statSync(path.join(out, target)).isFile()) continue;
        if (!target.endsWith("/") && urls.has(target + "/")) add("warning", url, `link ${href} should end with / (avoids a redirect)`);
        else add("error", url, `broken internal link ${href}`);
      } else if (href.startsWith(site.baseUrl)) {
        add("warning", url, `link ${href} is absolute; use a relative /path/`);
      }
    }

    if (!fm.kind) continue; // pages not from Markdown (404) skip the content checks
    const main = doc.querySelector("main");
    main?.querySelectorAll("script,style").forEach((n) => n.remove());
    const words = (main?.text ?? "").split(/\s+/).filter(Boolean);
    if (indexable && fm.kind !== "list" && words.length < minWords) {
      add("warning", url, `only ${words.length} words of content; thin pages rank poorly (min ${minWords})`);
    }
    if (fm.keyword) {
      const k = fm.keyword.toLowerCase();
      const h1 = h1s[0]?.text ?? "";
      const opening = words.slice(0, 150).join(" ");
      for (const [where, text] of [["title", title], ["description", desc], ["h1", h1], ["first 150 words", opening]]) {
        if (!text.toLowerCase().includes(k)) add("warning", url, `keyword "${fm.keyword}" missing from ${where}`);
      }
    } else if (indexable && fm.kind !== "list") {
      add("warning", url, "no target keyword set in front matter");
    }
  }

  for (const [title, where] of titles) if (where.length > 1) add("error", where.join(", "), `duplicate title "${title}"`);
  for (const [, where] of descriptions) if (where.length > 1) add("error", where.join(", "), "duplicate meta description");
  // Cloudflare Pages limits: 2,000 static + 100 dynamic redirects, 100 header rules.
  const redirects = site.redirects ?? [];
  const lines = redirectLines(site);
  const dynamic = lines.filter((l) => /[*:]/.test(l.split(" ")[0])).length;
  if (lines.length - dynamic > 2000 || dynamic > 100) add("error", "/_redirects", "over Cloudflare Pages' redirect limits (2,000 static, 100 dynamic)");
  for (const r of redirects) {
    if (!r.from?.startsWith("/")) add("error", "/_redirects", `redirect source "${r.from}" must start with /`);
    if (![301, 302, 303, 307, 308, undefined].includes(r.status)) add("error", "/_redirects", `redirect ${r.from} has status ${r.status}`);
    if (r.to?.startsWith("/") && !/[*:]/.test(r.to) && !urls.has(r.to.split("#")[0])) add("error", "/_redirects", `redirect ${r.from} points to missing page ${r.to}`);
    if (urls.has(r.from)) add("warning", "/_redirects", `redirect ${r.from} shadows a page that still exists`);
    if (r.status === 302 || r.status === 307) add("warning", "/_redirects", `redirect ${r.from} is temporary (${r.status}); use 301 to pass ranking to the new URL`);
  }
  if (!site.defaultImage) add("warning", "/", "no defaultImage; social shares will have no preview");
  return issues;
}

export const formatIssues = (issues) => issues.map((i) => `${i.level.padEnd(7)} ${i.url}  ${i.message}`);
