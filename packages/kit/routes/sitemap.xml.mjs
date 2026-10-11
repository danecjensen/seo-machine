// Indexable pages only, with <lastmod> from front matter or the file's last commit.
import { getCollection } from "astro:content";
import site from "virtual:seo-machine/site";
import { isoDate } from "../lib/format.mjs";
import { buildPages } from "../lib/pages.mjs";
import { absolute } from "../lib/seo.mjs";

const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export async function GET() {
  const pages = buildPages(await getCollection("pages"), site.root)
    .filter((p) => p.indexable)
    .sort((a, b) => a.url.localeCompare(b.url));
  const rows = pages.map((p) =>
    `<url><loc>${xml(absolute(site, p.url))}</loc>${p.lastmod ? `<lastmod>${isoDate(p.lastmod)}</lastmod>` : ""}</url>`);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
}
