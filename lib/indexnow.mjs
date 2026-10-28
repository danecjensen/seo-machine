// IndexNow tells Bing (and so DuckDuckGo, Yahoo and Copilot), Yandex, Seznam and Naver that pages
// changed, so they crawl them within hours. Google doesn't use it; Search Console covers Google.
// https://www.indexnow.org/documentation
//
// `indexnow_key:` in _config.yml turns it on. The key isn't a secret: the build publishes it at
// /<key>.txt so search engines can check the ping came from the site's owner.

export const ENDPOINT = "https://api.indexnow.org/indexnow";
export const validKey = (key) => /^[A-Za-z0-9-]{8,128}$/.test(key ?? "");

/** <loc> values from a sitemap.xml. */
export const sitemapUrls = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

/** The JSON body for one IndexNow ping (max 10,000 URLs, all on the site's own host). */
export function payload(baseUrl, key, urls) {
  const host = new URL(baseUrl).hostname;
  return {
    host,
    key,
    keyLocation: `${baseUrl.replace(/\/$/, "")}/${key}.txt`,
    urlList: urls.filter((u) => new URL(u).hostname === host).slice(0, 10000),
  };
}
