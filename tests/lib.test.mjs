import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pagesProject, redirectLines } from "../lib/cloudflare.mjs";
import { imageSize, minifyCss } from "../lib/html.mjs";
import { breadcrumbs, pageTitle } from "../lib/seo.mjs";
import { seoSite } from "../lib/site.mjs";

test("titles follow the site's title_format", () => {
  const site = { name: "Acme", titleTemplate: "{title} | {site}" };
  assert.equal(pageTitle(site, { url: "/x/", data: { title: "Pricing" } }), "Pricing | Acme");
  assert.equal(pageTitle(site, { url: "/", data: { title: "Widgets" } }), "Acme: Widgets");
  assert.equal(pageTitle(site, { url: "/x/", data: { title: "P", seo_title: "Custom" } }), "Custom");
});

test("breadcrumbs use page titles and fall back to the URL", () => {
  const byUrl = new Map([["/blog/", { url: "/blog/", data: { title: "Guides", nav_title: "Blog" } }]]);
  assert.deepEqual(breadcrumbs({ url: "/blog/a-post/" }, byUrl).map((c) => c.name), ["Home", "Blog", "a post"]);
});

test("jekyll-seo-tag style config keys map onto the SEO settings", () => {
  const site = seoSite({ title: "Acme", description: "d", url: "https://acme.com/", twitter: { username: "acme" },
    image: { path: "/og.png", alt: "Acme" }, logo: "/logo.png" });
  assert.equal(site.baseUrl, "https://acme.com");
  assert.equal(site.twitter, "@acme");
  assert.equal(site.defaultImage, "/og.png");
  assert.equal(site.organization.logo, "/logo.png");
});

test("redirect sources get a slashless twin, wildcards don't", () => {
  assert.deepEqual(redirectLines([{ from: "/a/", to: "/b/" }, { from: "/blog/*", to: "/news/:splat", status: 302 }]),
    ["/a/ /b/ 301", "/a /b/ 301", "/blog/* /news/:splat 302"]);
  assert.equal(pagesProject({ domain: "shop.acme.com" }), "shop-acme-com");
  assert.equal(pagesProject({ domain: "x.com", cloudflare: { project: "custom" } }), "custom");
});

test("helpers: CSS minify and image sizes", () => {
  assert.equal(minifyCss("a { color : red ; }\n/* x */ b{margin:0}"), "a{color:red}b{margin:0}");
  assert.deepEqual(imageSize(new URL("../sites/ledger.example/assets/og.png", import.meta.url).pathname), [1200, 630]);
});

describe("indexnow", async () => {
  const { payload, sitemapUrls, validKey } = await import("../lib/indexnow.mjs");
  test("pings every sitemap URL on the site's own host, with the key file location", () => {
    const xml = "<urlset><url><loc>https://a.example/</loc></url><url><loc>https://a.example/x/?a=1&amp;b=2</loc></url><url><loc>https://b.example/</loc></url></urlset>";
    const body = payload("https://a.example", "abcdef123456", sitemapUrls(xml));
    assert.deepEqual(body, {
      host: "a.example",
      key: "abcdef123456",
      keyLocation: "https://a.example/abcdef123456.txt",
      urlList: ["https://a.example/", "https://a.example/x/?a=1&b=2"],
    });
  });
  test("keys are 8-128 letters, digits or hyphens", () => {
    assert.ok(validKey("1257c312a493fca042d79e477e8cea71"));
    assert.ok(!validKey("short"));
    assert.ok(!validKey("has/slash1"));
    assert.ok(!validKey(undefined));
  });
});
