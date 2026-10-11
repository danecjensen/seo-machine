// Turns content entries into pages: URL, kind, parent/children and dates.
import { execFileSync } from "node:child_process";
import path from "node:path";

/** "index" -> "/", "pricing" -> "/pricing/", "blog/index" -> "/blog/" (a list), "blog/x" -> "/blog/x/" */
export function urlFor(id) {
  const parts = id.split("/");
  let kind = "page";
  if (parts.at(-1) === "index") {
    parts.pop();
    if (parts.length) kind = "list";
  } else if (parts.length > 1) {
    kind = "post"; // demoted to "page" below when it has no date
  }
  return { url: parts.length ? `/${parts.join("/")}/` : "/", kind };
}

let gitCache;
/** Last commit date per file, so the sitemap's <lastmod> stays honest without manual upkeep. */
export function gitDates(root) {
  if (gitCache) return gitCache;
  gitCache = new Map();
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const log = execFileSync("git", ["log", "--format=%x00%cs", "--name-only", "--", "."], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    for (const chunk of log.split("\0").slice(1)) {
      const [day, ...files] = chunk.trim().split("\n");
      for (const f of files) {
        const abs = path.resolve(top, f);
        if (!gitCache.has(abs)) gitCache.set(abs, new Date(day));
      }
    }
  } catch {
    // not a git checkout: no commit dates
  }
  return gitCache;
}

export function buildPages(entries, root = process.cwd()) {
  const dates = gitDates(root);
  const pages = entries
    .filter((e) => !e.data.draft)
    .map((entry) => {
      let { url, kind } = urlFor(entry.id);
      if (entry.data.type) kind = entry.data.type;
      else if (kind === "post" && !entry.data.date) kind = "page";
      const d = entry.data;
      const updated = d.updated ?? d.date;
      const committed = entry.filePath ? dates.get(path.resolve(root, entry.filePath)) : undefined;
      const lastmod = [updated, committed].filter(Boolean).sort((a, b) => b - a)[0];
      return {
        entry, url, kind, data: d,
        indexable: !d.noindex && !d.canonical,
        published: d.date, updated, lastmod,
        children: [],
      };
    });

  const byUrl = new Map();
  for (const p of pages) {
    if (byUrl.has(p.url)) throw new Error(`${p.entry.id} and ${byUrl.get(p.url).entry.id} both build ${p.url}`);
    byUrl.set(p.url, p);
  }
  for (const p of pages) {
    if (p.kind === "list" || p.url === "/") continue;
    const parent = byUrl.get(parentUrl(p.url));
    if (parent?.kind === "list") parent.children.push(p);
  }
  for (const p of pages) p.children.sort((a, b) => (b.published ?? 0) - (a.published ?? 0) || a.url.localeCompare(b.url));
  return pages;
}

export function parentUrl(url) {
  const parts = url.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}/` : "/";
}
