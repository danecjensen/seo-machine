import site from "virtual:seo-machine/site";

export function GET() {
  const { disallow = [], blockAgents = [] } = site.robots ?? {};
  const lines = ["User-agent: *", ...(disallow.length ? disallow.map((p) => `Disallow: ${p}`) : ["Allow: /"])];
  for (const agent of blockAgents) lines.push("", `User-agent: ${agent}`, "Disallow: /");
  lines.push("", `Sitemap: ${site.baseUrl}/sitemap.xml`);
  return new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "text/plain" } });
}
