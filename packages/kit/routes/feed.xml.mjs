// RSS for dated posts. Sites without posts get no feed file at all.
import { getCollection } from "astro:content";
import site from "virtual:seo-machine/site";
import { buildPages } from "../lib/pages.mjs";
import { absolute } from "../lib/seo.mjs";

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function posts() {
  return buildPages(await getCollection("pages"), site.root)
    .filter((p) => p.kind === "post" && p.indexable && p.published)
    .sort((a, b) => b.published - a.published)
    .slice(0, 20);
}

export async function getStaticPaths() {
  return (await posts()).length ? [{ params: { feed: "feed" } }] : [];
}

export async function GET() {
  const items = (await posts()).map((p) => {
    const link = absolute(site, p.url);
    return `<item><title>${xml(p.data.title)}</title><link>${link}</link><guid>${link}</guid>` +
      `<pubDate>${p.published.toUTCString()}</pubDate><description>${xml(p.data.description)}</description></item>`;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` +
    `<title>${xml(site.name)}</title><link>${site.baseUrl}/</link><description>${xml(site.description)}</description>` +
    `<atom:link href="${site.baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>${items.join("")}</channel></rss>\n`;
  return new Response(body, { headers: { "Content-Type": "application/rss+xml" } });
}
