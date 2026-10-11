// Everything a crawler reads: titles, canonical URLs, breadcrumbs and JSON-LD.
import { isoDate as iso } from "./format.mjs";
import { parentUrl } from "./pages.mjs";

export const absolute = (site, url) => (/^https?:\/\//.test(url) ? url : site.baseUrl + "/" + url.replace(/^\//, ""));

export function pageTitle(site, page) {
  const d = page.data;
  if (d.seo_title) return d.seo_title;
  if (page.url === "/") return d.title.includes(site.name) ? d.title : `${site.name}: ${d.title}`;
  return (site.titleTemplate ?? "{title} | {site}").replace("{title}", d.title).replace("{site}", site.name);
}

export function breadcrumbs(page, byUrl) {
  if (page.url === "/") return [];
  const trail = [];
  for (let url = page.url; url !== "/"; url = parentUrl(url)) {
    const p = byUrl.get(url);
    const slug = url.split("/").filter(Boolean).at(-1);
    trail.unshift({ name: p ? p.data.nav_title ?? p.data.title : slug.replace(/-/g, " "), url });
  }
  return [{ name: "Home", url: "/" }, ...trail];
}

export function organization(site) {
  const { type = "Organization", logo, address, geo, ...rest } = site.organization ?? {};
  const node = { "@type": type, "@id": `${site.baseUrl}/#organization`, name: site.name, url: `${site.baseUrl}/`, ...rest };
  if (logo) node.logo = absolute(site, logo);
  if (address) node.address = { "@type": "PostalAddress", ...address };
  if (geo) node.geo = { "@type": "GeoCoordinates", ...geo };
  if (type !== "Organization" && !node.image && node.logo) node.image = node.logo; // LocalBusiness wants an image
  return node;
}

export function jsonld(site, page, byUrl, image) {
  const d = page.data;
  const canonical = absolute(site, d.canonical ?? page.url);
  const orgId = `${site.baseUrl}/#organization`;
  const websiteId = `${site.baseUrl}/#website`;
  const lang = site.language ?? "en";
  const graph = [
    organization(site),
    { "@type": "WebSite", "@id": websiteId, url: `${site.baseUrl}/`, name: site.name, inLanguage: lang, publisher: { "@id": orgId } },
  ];
  const webpage = {
    "@type": page.kind === "list" ? "CollectionPage" : "WebPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: pageTitle(site, page),
    description: d.description,
    isPartOf: { "@id": websiteId },
    inLanguage: lang,
  };
  if (image) webpage.primaryImageOfPage = { "@type": "ImageObject", url: image };
  graph.push(webpage);

  const crumbs = breadcrumbs(page, byUrl);
  if (crumbs.length) {
    webpage.breadcrumb = { "@id": `${canonical}#breadcrumb` };
    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${canonical}#breadcrumb`,
      itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absolute(site, c.url) })),
    });
  }

  if (page.kind === "post") {
    const author = d.author ?? site.author;
    graph.push({
      "@type": "BlogPosting",
      "@id": `${canonical}#article`,
      headline: d.title.slice(0, 110),
      description: d.description,
      mainEntityOfPage: { "@id": `${canonical}#webpage` },
      publisher: { "@id": orgId },
      author: author ? { "@type": "Person", name: author } : { "@id": orgId },
      ...(page.published && { datePublished: iso(page.published), dateModified: iso(page.updated) }),
      ...(image && { image: [image] }),
    });
  }

  if (d.faq?.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${canonical}#faq`,
      mainEntity: d.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    });
  }

  if (d.service) {
    const s = d.service;
    graph.push({
      "@type": "Service",
      "@id": `${canonical}#service`,
      name: s.name ?? d.title,
      description: s.description ?? d.description,
      provider: { "@id": orgId },
      ...(s.area_served && { areaServed: s.area_served }),
      ...(s.price != null && { offers: { "@type": "Offer", price: String(s.price), priceCurrency: s.currency } }),
    });
  }

  // Escape "<" so content can never close the script tag.
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

export function head(site, page, byUrl) {
  const d = page.data;
  const imagePath = d.image ?? site.defaultImage;
  const image = imagePath ? absolute(site, imagePath) : undefined;
  const post = page.kind === "post";
  return {
    title: pageTitle(site, page),
    ogTitle: d.title,
    description: d.description,
    canonical: absolute(site, d.canonical ?? page.url),
    noindex: d.noindex,
    image,
    imageAlt: d.image_alt ?? site.defaultImageAlt ?? site.name,
    ogType: post ? "article" : "website",
    published: post ? iso(page.published) : undefined,
    modified: post ? iso(page.updated) : undefined,
    jsonld: jsonld(site, page, byUrl, image),
    breadcrumbs: breadcrumbs(page, byUrl),
  };
}
