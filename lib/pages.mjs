// URL and date helpers shared by the SEO tag, sitemap and checks.
import { execFileSync } from "node:child_process";
import path from "node:path";

export function parentUrl(url) {
  const parts = url.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}/` : "/";
}

const gitCache = new Map();
/** Last commit date per file, so the sitemap's <lastmod> stays honest without manual upkeep. */
export function gitDates(dir) {
  if (gitCache.has(dir)) return gitCache.get(dir);
  const dates = new Map();
  gitCache.set(dir, dates);
  try {
    const opts = { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] };
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], opts).trim();
    const log = execFileSync("git", ["log", "--format=%x00%cs", "--name-only", "--", "."], opts);
    for (const chunk of log.split("\0").slice(1)) {
      const [day, ...files] = chunk.trim().split("\n");
      for (const f of files) {
        const abs = path.resolve(top, f);
        if (!dates.has(abs)) dates.set(abs, new Date(day));
      }
    }
  } catch {
    // not a git checkout: no commit dates
  }
  return dates;
}
