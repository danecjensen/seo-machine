// robots.txt for every site: the site's own rules, plus named groups for AI crawlers so
// ChatGPT, Claude, Perplexity, Gemini and the rest can find and cite the site.

// Robots.txt tokens for AI crawlers, by what they do. Update this list as vendors add bots.
// - search: indexes pages for an AI search or answer engine (these drive citations and clicks)
// - user: fetches a page when a person asks the assistant about it
// - training: collects pages to train models, or is the opt-out token for training
export const AI_CRAWLERS = [
  { agent: "OAI-SearchBot", owner: "OpenAI", use: "search" },
  { agent: "ChatGPT-User", owner: "OpenAI", use: "user" },
  { agent: "GPTBot", owner: "OpenAI", use: "training" },
  { agent: "Claude-SearchBot", owner: "Anthropic", use: "search" },
  { agent: "Claude-User", owner: "Anthropic", use: "user" },
  { agent: "ClaudeBot", owner: "Anthropic", use: "training" },
  { agent: "PerplexityBot", owner: "Perplexity", use: "search" },
  { agent: "Perplexity-User", owner: "Perplexity", use: "user" },
  { agent: "Google-Extended", owner: "Google (Gemini)", use: "training" },
  { agent: "Applebot-Extended", owner: "Apple Intelligence", use: "training" },
  { agent: "meta-externalagent", owner: "Meta AI", use: "training" },
  { agent: "meta-externalfetcher", owner: "Meta AI", use: "user" },
  { agent: "Amazonbot", owner: "Amazon (Alexa, Rufus)", use: "search" },
  { agent: "DuckAssistBot", owner: "DuckDuckGo", use: "search" },
  { agent: "MistralAI-User", owner: "Mistral (Le Chat)", use: "user" },
  { agent: "CCBot", owner: "Common Crawl", use: "training" },
];

/**
 * Which AI crawlers a site lets in, from `robots:` in _config.yml:
 *   ai_crawlers: true | false   (default true; false blocks every AI crawler)
 *   ai_training: true | false   (default true; false blocks only the training bots)
 *   block_agents: [...]         (any named bot is blocked, AI or not)
 */
export function aiCrawlerRules(robots = {}) {
  const blocked = new Set((robots.block_agents ?? []).map((a) => String(a).toLowerCase()));
  return AI_CRAWLERS.map((c) => ({
    ...c,
    allow: robots.ai_crawlers !== false && !(robots.ai_training === false && c.use === "training") &&
      !blocked.has(c.agent.toLowerCase()),
  }));
}

/** The whole robots.txt. sitemapUrl is absolute. */
export function robotsTxt(robots = {}, sitemapUrl) {
  const disallow = robots.disallow ?? [];
  // A crawler follows only the most specific group that names it, so every allowed AI group
  // repeats the site's Disallow lines instead of inheriting them from `User-agent: *`.
  const rules = disallow.length ? disallow.map((p) => `Disallow: ${p}`) : ["Allow: /"];
  const ai = aiCrawlerRules(robots);
  const aiAgents = new Set(ai.map((c) => c.agent.toLowerCase()));
  const groups = [["User-agent: *", ...rules]];

  const allowed = ai.filter((c) => c.allow);
  if (allowed.length) groups.push(["# AI search, assistant and training crawlers: welcome",
    ...allowed.map((c) => `User-agent: ${c.agent}`), ...rules]);
  const refused = ai.filter((c) => !c.allow);
  if (refused.length) groups.push(["# AI crawlers this site opts out of",
    ...refused.map((c) => `User-agent: ${c.agent}`), "Disallow: /"]);

  for (const agent of robots.block_agents ?? []) {
    if (!aiAgents.has(String(agent).toLowerCase())) groups.push([`User-agent: ${agent}`, "Disallow: /"]);
  }
  return groups.map((g) => g.join("\n")).join("\n\n") + `\n\nSitemap: ${sitemapUrl}\n`;
}
