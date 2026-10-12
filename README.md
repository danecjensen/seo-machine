# seo machine

One repo that builds many static marketing sites, one per domain, with
[Eleventy](https://www.11ty.dev) set up to work like Jekyll. Each site has its own
`_config.yml`, content and output folder, and none of them can see the others. A shared
theme gives every page the SEO essentials and checks them on every build. Each domain
deploys to its own Cloudflare Pages project.

```
sites/
  ledger.example/                a SaaS site; goal: free-trial signups
    _config.yml                  title, url, description, goals, organization, colors...
    _data/navigation.yml         the header menu
    _posts/2026-09-02-title.md   blog posts, dated by file name
    blog/index.md                the blog's list page (layout: list)
    index.md, pricing.md, ...    pages
    assets/                      images, copied as-is
    lighthouse.json              optional Lighthouse budget overrides
  plumbing.example/              a local business site; goal: phone calls and bookings
  gohappyclub.com/               Happy Club, custom promotional wearables; goal: email signups
theme/                           shared _layouts, _includes, CSS, sitemap, robots, feed, 404
lib/                             the Eleventy config, SEO tag and SEO check
scripts/                         build, deploy and new-site commands
lighthouse/                      Lighthouse runner and default budgets
dist/<domain>/                   static output, one folder per site
```

## Coming from Jekyll

Most of it is what you know. These are the differences.

| Jekyll | Here |
|---|---|
| `_config.yml` | `sites/<domain>/_config.yml`, one per site. `url` must match the folder name. |
| `_layouts/`, `_includes/` | Same. The shared ones live in `theme/`, like a theme gem. A file with the same path in a site folder replaces the theme's. |
| `_posts/YYYY-MM-DD-title.md` | Same. URL comes from `permalink:` in `_config.yml` (default `/blog/:title/`; `:year`, `:month`, `:day` also work). |
| `_data/navigation.yml` → `site.data.navigation` | Same file, but use `navigation` in templates. |
| `_drafts/`, `published: false` | Same: not built. |
| `defaults:` in `_config.yml` | Same, with `scope.path` and `scope.type` (`posts` or `pages`). Markdown pages default to `layout: page`. |
| `{{ page.title }}`, `{{ page.description }}` | `{{ title }}`, `{{ description }}`. Front matter is top-level. `page.url` and `page.date` still work. |
| `{{ content }}` in layouts | Same. |
| `{% include file.html key="value" %}` and `include.key` | Same. |
| `site.posts` | `collections.posts` (newest first). |
| `site.pages` | `collections.all` |
| `{% seo %}` (jekyll-seo-tag) | Same tag, with richer JSON-LD (see below). |
| jekyll-sitemap, jekyll-feed | Built in: `sitemap.xml` and `feed.xml`. Use `sitemap: false` to leave a page out. |
| `redirect_from:` (jekyll-redirect-from) | Same front matter. It becomes a 301 in Cloudflare's `_redirects` file. |
| `last_modified_at:` | Same. It's used for "Updated" dates, `dateModified` and the sitemap. |
| Filters: `absolute_url`, `relative_url`, `date_to_xmlschema`, `date_to_string`, `date_to_long_string`, `xml_escape`, `jsonify` | Same. |
| `bundle exec jekyll build` | `npm run build` (every site) or `npm run build -- --site <domain>`. |
| `bundle exec jekyll serve` | `npm run serve -- --site <domain>` |
| kramdown | markdown-it with kramdown-style heading ids and smart quotes. |

## Use it

Needs Node 22.12 or newer.

```sh
npm install
npm run build                                   # every site -> dist/<domain>/
npm run build -- --site ledger.example --strict --verbose
npm run serve -- --site ledger.example          # preview at http://localhost:4000, rebuilds on save
npm run new-site -- mysite.com "My Site"        # scaffold a site
npm test                                        # isolation, output and unit tests
npm run wireframe -- --site gohappyclub.com     # redraw each page archetype's wireframe image
node scripts/deploy.mjs --site ledger.example --dry-run   # show what a deploy would do
```

`--strict` fails a site that has SEO errors. `--verbose` also prints warnings.

## Page archetypes and wireframes

A site can define page archetypes: one layout per kind of page, drawn as a simple grayscale wireframe.
gohappyclub.com has three, `home`, `product` and `collection`, in `sites/gohappyclub.com/_archetypes/`.
Each archetype is two files that say the same thing:

- `home.html`, an HTML skeleton of the page's blocks, and
- `home.png`, the same skeleton drawn as a grayscale wireframe.

The build turns each skeleton into the layout `_layouts/home.html` (pages use it with `layout: home`), so the
wireframe dictates the page's layout. Rows become a 12-column grid that stacks on phones.

**In the image**, each kind of block is one flat gray on a white page. Headings are black bars (a taller bar is
a higher level: h1, h2, h3), buttons are dark gray, images are mid gray, text is light gray lines, and panels are
very light gray boxes holding other blocks. Spacing groups them: the widest gaps separate sections, a medium gap
separates groups in a section, a narrow gap separates blocks in one column, and text lines sit closer still.
Columns snap to a 12-column grid. The image can be any size; spacing is judged relative to its width.

| Block | Gray | Skeleton |
|---|---|---|
| Heading | `#000000` | `<h1>`, `<h2>`, `<h3>` |
| Button | `#404040` | `<a>` |
| Image | `#808080` | `<figure data-ratio="4:3">` |
| Text | `#b0b0b0` | `<p data-lines="3">` |
| Panel | `#e0e0e0` | `<div data-span="3" class="panel">` |
| Page | `#ffffff` | |

**In the skeleton**, a `<section>` holds blocks, or `<div class="row">` rows of `<div data-span="1-12">` columns.
`data-slot="name"` says what fills a block: the build includes `_includes/slots/name.html` there. A row whose
columns are all alike with one slot repeats for as many items as there are (one card per product), so its
column count only sets how many fit across. A block without a slot shows a "[Placeholder]" on the page.

**Converting:**

```sh
npm run wireframe -- --site gohappyclub.com                          # skeleton -> image, for every archetype
npm run wireframe -- --site gohappyclub.com --from new-home.png home # image -> skeleton (and a clean home.png)
npm run wireframe -- --site gohappyclub.com --check                  # does every image match its skeleton?
npm run wireframe -- --site gohappyclub.com --layout home            # print the layout the build makes
```

Reading an image keeps the slot names of the skeleton it replaces, matching blocks of the same shape in order,
and lists any block it couldn't name. `npm test` checks that every image matches its skeleton and that each
archetype converts to an image and back unchanged.

## How sites stay isolated

- Each site is its own folder with its own `_config.yml`, and its `url` must match the folder name.
- A file or symlink in a site folder that points outside it fails the build.
- Each site builds separately: `theme/` plus that one site folder are combined in `.build/<domain>/`,
  so a site can only see the shared theme and its own files.
- Each site builds to its own `dist/<domain>/` through a staging folder that only replaces the
  previous output when the build succeeds, so a broken site keeps its last good build.
- `npm run build` carries on past failures; one site's error never stops another.
- CI runs one job per site with `fail-fast: false`, so each site passes or fails on its own.

## SEO built in

`{% seo %}` in `theme/_layouts/default.html` writes:

- The `<title>` (from `title_format`, or `seo_title` in front matter), meta description, canonical
  URL and robots tag.
- Open Graph and Twitter card tags, with a per-page `image` or the site's default.
- JSON-LD in one `@graph`: the organization (or any LocalBusiness type such as `Plumber`, with
  address, geo, hours and service area), WebSite, WebPage and BreadcrumbList. It also adds
  BlogPosting for posts, FAQPage when the page has `faq` (also shown on the page, as Google
  requires), and Service with an Offer when it has `service`.

The theme also adds visible breadcrumbs, one `<h1>` per page, a table of contents on long posts,
clean trailing-slash URLs, `sitemap.xml` (with `<lastmod>` from `last_modified_at`, the post
date or the file's last git commit), `robots.txt`, `feed.xml` when the site has posts, and a
`404.html`.

Pages ship no JavaScript, use a system font stack, and inline one small stylesheet, so nothing
blocks rendering. Images with a `/path` get their `width` and `height` filled in from the file,
plus `loading="lazy"`. A typical page is about 9 KB.

## The SEO check

After each build, every page's HTML is checked:

- **Errors** (these fail with `--strict`): a missing title, description or canonical; anything
  other than exactly one `<h1>`; images without alt text; broken internal links; duplicate titles
  or descriptions; redirects to pages that don't exist.
- **Warnings**: titles over 60 characters; descriptions outside 50 to 160 characters; skipped
  heading levels; images without dimensions; URLs that aren't lowercase-hyphenated; thin pages
  (under `lint.minWords`, 250 by default); temporary redirects; and a page's target `keyword`
  missing from its title, description, `<h1>` or first 150 words.

## Front matter

```yaml
---
title: "Water Heater Repair in Austin"   # also the og:title
description: "..."                        # 50-160 characters
keyword: "water heater repair"            # target phrase the SEO check looks for
layout: page                              # page (default), post, list, or your own
seo_title: "..."                          # replaces the templated <title>
heading: "..."                            # replaces the <h1> when it should differ from title
nav_title: "..."                          # shorter name for breadcrumbs
lede: "..."                               # intro line under the heading
author: "Maya Chen"
last_modified_at: 2026-10-01
image: /assets/hero.png                   # or { path: ..., alt: ... }
noindex: true                             # adds noindex and leaves it out of the sitemap
sitemap: false                            # just leaves it out of the sitemap
canonical_url: "https://..."              # points at another URL
redirect_from: [/old-url/]
published: false                          # not built at all
cta: false                                # hides the closing call to action
service:                                  # Service + Offer schema
  name: "Drain cleaning"
  price: 129
faq:                                      # visible FAQ + FAQPage schema
  - q: "Question?"
    a: "Answer."
---
```

`layout: list` shows every page one level below it: put `services/index.md` with
`layout: list` next to `services/drain-cleaning.md` and the list builds itself.

## Designs from Claude Design

Each site's look comes from its own design, made in [Claude Design](https://claude.ai/design). The shared
theme supplies the layouts and a plain default; a site's design replaces its colors, fonts and radius,
and only that site changes.

1. Design the site in Claude Design (a design system for the brand, or a page design).
2. Get it to Claude: use **Send to Claude Code** (handoff) and ask it to apply the design to the domain,
   or **Export** as .zip or standalone HTML and attach it in the project.
3. Claude (or you) runs the import, previews it, and opens a PR; the Lighthouse gate checks it like any change:

```sh
npm run design -- --site gohappyclub.com --from happy-club.zip --source https://claude.ai/design/...
npm run serve -- --site gohappyclub.com
```

`--from` takes a .zip export, a folder, a standalone .html page, a .css file or a design tokens .json.
The import writes `sites/<domain>/_design/`:

| File | What it is |
|---|---|
| `tokens.css` | Generated. The design's tokens and fonts, with the theme's `--brand`, `--ink`, `--bg`, `--muted`, `--soft`, `--line`, `--radius`, `--font`, `--font-heading` pointed at them. Re-import to change it. |
| `fonts/` | Generated. The design's .woff2/.woff files, served from `/assets/fonts/`. Google Fonts are downloaded so the site hosts them itself (latin subset; `--subsets latin,latin-ext` for more). |
| `site.css` | Yours, never touched by an import: styles the tokens can't express. |

Both CSS files are inlined after the theme's CSS on every page of that site, so keep them small. For
structural changes (a different header, a new hero), put files in the site's own `_layouts/` or
`_includes/`; they replace the theme's for that site only. The import warns about color pairs under 4.5:1
contrast and heavy fonts, the two things a design most often costs in Lighthouse.

## Lighthouse

The Lighthouse checks run against `dist/<domain>/`, using the pages in each site's sitemap.
Default budgets apply, with optional per-site overrides in `sites/<domain>/lighthouse.json`.
Every page of both sample sites scores 100 for Performance, Accessibility, Best Practices and
SEO on mobile. See `lighthouse/README.md`.

## Cloudflare Pages

Every domain deploys to its own Cloudflare Pages project, named after the domain
(`ledger.example` becomes `ledger-example`). To change that, add to `_config.yml`:

```yaml
cloudflare:
  project: ledger-example
  productionBranch: main
  domains: [ledger.example]   # custom domains attached on production deploys
```

The two example sites set `deploy: false` under `cloudflare:`, so they are built and checked but
never deployed. Remove that line for a real domain.

Each build writes the files Pages reads from the output root:

- `_headers`: security headers, caching for `/assets/`, and `X-Robots-Tag: noindex` on every
  `*.pages.dev` hostname, so preview and default URLs never compete with the real domain in search.
- `_redirects`: from `redirect_from` front matter (or `redirects:` in `_config.yml`), only when
  there are any. A source like `/old/` also gets an `/old` line, because Pages matches paths exactly.
- `404.html`, which Pages serves with a 404 status for unknown paths.

Pages already redirects `/about` to `/about/`, which matches the site's URLs.

### Deploying

`node scripts/deploy.mjs --site <domain>` creates the Pages project if it doesn't exist, uploads
`dist/<domain>/`, and on the production branch attaches each custom domain. It needs two
environment variables:

- `CLOUDFLARE_API_TOKEN`: an API token with the Account > Cloudflare Pages > Edit permission.
- `CLOUDFLARE_ACCOUNT_ID`: the account ID from the Cloudflare dashboard.

In CI, add both as repository secrets. `.github/workflows/sites.yml` runs one job per domain
that builds and SEO-checks the site, runs Lighthouse, and deploys only if both pass. Pushes to
`main` go to production; pull requests from this repo get a preview at
`<branch>.<project>.pages.dev`. Without the secrets, every step except the deploy still runs.

DNS is created automatically when the domain's zone is on the same Cloudflare account. Otherwise,
point a CNAME at `<project>.pages.dev`. Pages can't redirect `www` to the apex with `_redirects`;
use a Cloudflare Bulk Redirect or Redirect Rule for that.

### Going live with a domain registered at Namecheap (gohappyclub.com)

`sites/gohappyclub.com` deploys to the Pages project `gohappyclub-com`, and production deploys
attach both `gohappyclub.com` and `www.gohappyclub.com`. A bare domain like `gohappyclub.com`
can only point at Pages when Cloudflare runs its DNS, so the domain moves its nameservers
to Cloudflare while the registration stays at Namecheap.

1. **Add the site to Cloudflare.** In the Cloudflare dashboard choose *Add a domain*, enter
   `gohappyclub.com`, and pick the **Free** plan.
2. **Check the copied DNS records.** Cloudflare scans the existing records. Compare them with
   Namecheap's *Advanced DNS* tab and add anything missing, above all the **MX** and **TXT**
   (SPF, DKIM, DMARC, verification) records, or email will stop working. Delete any old `A` or
   `CNAME` records for `@` and `www` that point at a previous host (such as Namecheap's parking
   page); Pages adds its own in step 5.
3. **Switch nameservers at Namecheap.** In Namecheap go to *Domain List → Manage →
   Nameservers*, choose *Custom DNS*, and enter the two nameservers Cloudflare shows. If DNSSEC
   is on at Namecheap, turn it off first (you can turn it on again in Cloudflare later).
4. **Wait for Cloudflare to say the domain is Active.** This usually takes minutes, sometimes
   up to a day.
5. **Deploy.** Once the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets are set, a
   push to `main` deploys the site and attaches both domains; because the zone is on the same
   account, Cloudflare creates the DNS records and certificates. (To do it by hand instead:
   *Workers & Pages → gohappyclub-com → Custom domains → Set up a domain*, once for each name.)
6. **Redirect www to the bare domain.** In the `gohappyclub.com` zone, open *Rules → Redirect
   Rules → Create rule* (or use the *Redirect from WWW to root* template):
   - When: *Hostname* equals `www.gohappyclub.com`
   - Then: *Dynamic* redirect to `concat("https://gohappyclub.com", http.request.uri.path)`,
     status **301**, with *Preserve query string* on.

   Check it with `curl -sI https://www.gohappyclub.com/products/`, which should return a 301
   to `https://gohappyclub.com/products/`.

Before launch, set `contact.form_action` in `sites/gohappyclub.com/_config.yml` to the URL of a
form handler that stores email signups (Mailchimp, ConvertKit, Formspree or similar), and have it
send people to `https://gohappyclub.com/thanks/` afterwards. The form posts `email` and an
optional `interest` (hats, tote bags, blankets, socks or something else). Until it's set, the
signup page shows a yellow "[Placeholder]" note. Once it's set, the signup page and each product
page show the form (`signup_form: true`, set for `products/` in `_config.yml` defaults); other
pages link to the signup page.
