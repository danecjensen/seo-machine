// Cloudflare Pages reads _headers and _redirects from the output root.
// https://developers.cloudflare.com/pages/configuration/headers/
export function headersFile() {
  return `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Strict-Transport-Security: max-age=31536000
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/assets/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400

# Keep *.pages.dev copies (previews and the default hostname) out of search results,
# so they never compete with the real domain as duplicate content.
https://:project.pages.dev/*
  X-Robots-Tag: noindex

https://:version.:project.pages.dev/*
  X-Robots-Tag: noindex
`;
}

/** [{ from: "/old/", to: "/new/", status: 301 }] -> _redirects lines.
 *  Pages matches sources exactly, so "/old/" also gets a "/old" line. */
export function redirectLines(redirects) {
  return redirects.flatMap((r) => {
    const line = (from) => `${from} ${r.to} ${r.status ?? 301}`;
    const bare = r.from.length > 1 && r.from.endsWith("/") && !/[*:]/.test(r.from) ? [line(r.from.slice(0, -1))] : [];
    return [line(r.from), ...bare];
  });
}

/** One Cloudflare Pages project per domain; ledger.example -> "ledger-example" unless set. */
export const pagesProject = (site) => site.cloudflare?.project ?? site.domain.replace(/\./g, "-");
export const validProject = (name) => /^[a-z0-9][a-z0-9-]{0,56}[a-z0-9]$/.test(name);
