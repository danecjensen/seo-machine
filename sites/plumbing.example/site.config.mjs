// Northside Plumbing: a local service business. Goal: phone calls and bookings from local search.
export default {
  domain: "plumbing.example",
  name: "Northside Plumbing",
  description: "Licensed plumbers in North Austin for leaks, drains and water heaters. Same-day service, upfront prices.",
  language: "en",
  locale: "en_US",
  titleTemplate: "{title} | {site}",
  defaultImage: "/og.png",
  defaultImageAlt: "Northside Plumbing service van",
  themeColor: "#b42318",

  goals: {
    primary: "Phone calls and service bookings",
    audience: "Homeowners in North Austin, TX",
    keywords: ["plumber north austin", "water heater repair austin", "drain cleaning austin"],
    cta: { text: "Book a plumber", title: "Need a plumber today? We answer 7 days a week.", url: "/contact/" },
  },

  // A schema.org LocalBusiness subtype, so Google can show it in local results.
  organization: {
    type: "Plumber",
    logo: "/logo.png",
    telephone: "+1-512-555-0142",
    priceRange: "$$",
    areaServed: ["Austin", "Round Rock", "Pflugerville", "Cedar Park"],
    openingHours: ["Mo-Su 07:00-19:00"],
    address: {
      streetAddress: "1200 W Braker Ln",
      addressLocality: "Austin",
      addressRegion: "TX",
      postalCode: "78758",
      addressCountry: "US",
    },
    geo: { latitude: 30.3905, longitude: -97.7203 },
  },

  nav: [
    { title: "Services", url: "/services/" },
    { title: "About", url: "/about/" },
  ],

  theme: { brand: "#b42318" },

  // Old URLs that moved. Written to _redirects for Cloudflare Pages.
  redirects: [
    { from: "/water-heaters/", to: "/services/water-heater-repair/", status: 301 },
    { from: "/drains/", to: "/services/drain-cleaning/", status: 301 },
  ],

  // Cloudflare Pages: one project per domain. These are the defaults, shown for reference.
  cloudflare: {
    project: "plumbing-example",
    productionBranch: "main",
    domains: ["plumbing.example"], // add "www.plumbing.example" and redirect it to the apex in Cloudflare
  },

  // Keep noindex pages crawlable: a robots.txt block hides their noindex tag.
  // Use disallow for areas that should never be fetched, blockAgents to opt out of specific bots.
  robots: { disallow: [], blockAgents: [] },
};
