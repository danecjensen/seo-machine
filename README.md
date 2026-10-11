# seo machine

One repo that builds many static marketing sites with [Astro](https://astro.build), one per
domain. Each site has its own content goals, config, content and output folder, and none of
them can see the others. A shared kit gives every page the SEO essentials and checks them on
every build.

```
sites/
  ledger.example/              a SaaS site; goal: free-trial signups
    site.config.mjs            name, goals, keywords, organization, nav, brand colors
    astro.config.mjs           one line: defineSite(import.meta.url, site)
    src/content/**/*.md        pages, as Markdown with YAML front matter
    src/content.config.mjs     one line: re-exports the kit's content schema
    public/                    favicon, og.png, images (copied as-is)
    lighthouse.json            optional Lighthouse budget overrides
  plumbing.example/            a local business site; goal: phone calls and bookings
packages/kit/                  shared layout, routes, styles, SEO and checks
scripts/build.mjs              builds each site into dist/<domain>/
dist/<domain>/                 static output, one folder per site, ready to upload
```

## Use it

Needs Node 22.12 or newer.

```sh
npm install
npm run build                                   # every site -> dist/<domain>/
npm run build -- --site ledger.example --strict --verbose
npm run new-site -- mysite.com "My Site"        # scaffold a site, then npm install
npm test                                        # isolation, output and unit tests

cd sites/ledger.example && npx astro dev        # live preview of one site
```

`--strict` fails a site that has SEO errors. `--verbose` also prints warnings.

## How sites stay isolated

- Each site is its own Astro project in its own folder, and the folder name must equal `domain`
  in `site.config.mjs`.
- Content comes only from the site's own `src/content/`. A file or symlink in `src/` or `public/`
  that points outside the site folder fails the build.
- Each site builds to its own `dist/<domain>/` through a staging folder that only replaces the
  previous output when the build succeeds, so a broken site keeps its last good build.
- `npm run build` builds sites one at a time and carries on past failures; one site's error never
  stops another.
- CI runs one job per site with `fail-fast: false`, so each site passes or fails on its own.

## SEO built in

Every page gets:

- A `<title>` from the site's `titleTemplate`, a meta description, a canonical URL and a robots tag.
- Clean trailing-slash URLs (`src/content/pricing.md` becomes `/pricing/`).
- Open Graph and Twitter card tags, with a per-page or site-wide share image.
- JSON-LD in one `@graph`: the Organization (or any LocalBusiness type such as `Plumber`, with
  address, geo, hours and service area), WebSite, WebPage, and BreadcrumbList. It also adds
  BlogPosting for dated posts, FAQPage when the page has `faq` (also shown on the page, as Google
  requires), and Service with an Offer when it has `service`.
- Visible breadcrumbs, one `<h1>`, and a table of contents on long posts.

Every site gets `sitemap.xml` (indexable pages only, with `<lastmod>` from front matter or the
file's last git commit), `robots.txt` pointing at the sitemap, `feed.xml` when it has dated posts,
a `404.html`, and a `_headers` file with security and caching headers for Cloudflare Pages or
Netlify.

Pages ship no JavaScript, use a system font stack, and inline their one small stylesheet, so
nothing blocks rendering. A typical page is about 9 KB. Images placed next to the Markdown
(`![alt](./photo.jpg)`) are resized, converted and given dimensions by Astro.

## The SEO check

After each build, the kit checks the rendered HTML of every page and reports:

- **Errors** (these fail with `--strict`): a missing title, description or canonical; anything
  other than exactly one `<h1>`; images without alt text; broken internal links; duplicate titles
  or descriptions.
- **Warnings**: titles over 60 characters; descriptions outside 50 to 160 characters; skipped
  heading levels; images without dimensions; URLs that aren't lowercase-hyphenated; thin pages
  (under `lint.minWords`, 250 by default); and a page's target `keyword` missing from its title,
  description, `<h1>` or first 150 words.

## Front matter

```yaml
---
title: "Water Heater Repair in Austin"   # required; also the og:title
description: "..."                        # required; 50-160 characters
keyword: "water heater repair"            # target phrase the SEO check looks for
seo_title: "..."                          # replaces the templated <title>
heading: "..."                            # replaces the <h1> when it should differ from title
nav_title: "..."                          # shorter name for breadcrumbs
lede: "..."                               # intro line under the heading
date: 2026-09-02                          # makes a nested page a dated post (BlogPosting, RSS)
updated: 2026-10-01
author: "Maya Chen"
image: "/hero.png"                        # share image for this page
noindex: true                             # adds noindex and leaves it out of the sitemap
draft: true                               # not built at all
canonical: "https://..."                  # points at another URL (also leaves the sitemap)
cta: false                                # hides the closing call to action
service:                                  # Service + Offer schema
  name: "Drain cleaning"
  price: 129
faq:                                      # visible FAQ + FAQPage schema
  - q: "Question?"
    a: "Answer."
---
```

`src/content/blog/index.md` makes `/blog/` a list page that shows every page in that folder.
Front matter is validated, so a typo in a field name fails the build.

## Lighthouse

The Lighthouse checks run against `dist/<domain>/`, with default budgets plus optional per-site
overrides in `sites/<domain>/lighthouse.json`. Every indexable page of both sample sites
scores 100 for Performance, Accessibility, Best Practices and SEO on mobile.
