import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPages, urlFor } from "../packages/kit/lib/pages.mjs";
import { breadcrumbs, pageTitle } from "../packages/kit/lib/seo.mjs";

test("clean URLs from file paths", () => {
  assert.deepEqual(urlFor("index"), { url: "/", kind: "page" });
  assert.deepEqual(urlFor("pricing"), { url: "/pricing/", kind: "page" });
  assert.deepEqual(urlFor("blog/index"), { url: "/blog/", kind: "list" });
  assert.deepEqual(urlFor("blog/first-post"), { url: "/blog/first-post/", kind: "post" });
});

test("nested pages are posts only when dated; lists collect their children", () => {
  const e = (id, data) => ({ id, data: { title: id, description: "d", ...data } });
  const pages = buildPages([e("blog/index"), e("blog/a", { date: new Date("2026-01-01") }), e("blog/b")], "/nonexistent");
  const by = Object.fromEntries(pages.map((p) => [p.url, p]));
  assert.equal(by["/blog/a/"].kind, "post");
  assert.equal(by["/blog/b/"].kind, "page");
  assert.deepEqual(by["/blog/"].children.map((c) => c.url), ["/blog/a/", "/blog/b/"]);
  assert.deepEqual(breadcrumbs(by["/blog/a/"], new Map(pages.map((p) => [p.url, p]))).map((c) => c.url), ["/", "/blog/", "/blog/a/"]);
});

test("titles follow the site template", () => {
  const site = { name: "Acme", titleTemplate: "{title} | {site}" };
  assert.equal(pageTitle(site, { url: "/x/", data: { title: "Pricing" } }), "Pricing | Acme");
  assert.equal(pageTitle(site, { url: "/", data: { title: "Widgets" } }), "Acme: Widgets");
  assert.equal(pageTitle(site, { url: "/x/", data: { title: "P", seo_title: "Custom" } }), "Custom");
});
