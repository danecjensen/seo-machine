// Ledgerly: a SaaS product site. Goal: free-trial signups from organic search.
export default {
  domain: "ledger.example",
  name: "Ledgerly",
  description: "Bookkeeping software for freelancers: track income, expenses and quarterly taxes in one place.",
  language: "en",
  locale: "en_US",
  titleTemplate: "{title} | {site}",
  defaultImage: "/og.png", // 1200x630 PNG or JPG used when a page has no image
  defaultImageAlt: "Ledgerly bookkeeping for freelancers",
  twitter: "@ledgerly",
  author: "The Ledgerly team",
  themeColor: "#0f766e",

  goals: {
    primary: "Free trial signups",
    audience: "US freelancers and solo consultants",
    keywords: ["bookkeeping for freelancers", "freelancer expense tracker", "quarterly estimated taxes"],
    cta: { text: "Start free trial", title: "Get your books in order this week.", url: "/signup/" },
  },

  // schema.org Organization; any extra keys pass straight into the JSON-LD.
  organization: {
    type: "Organization",
    logo: "/logo.png",
    sameAs: ["https://x.com/ledgerly", "https://www.linkedin.com/company/ledgerly"],
  },

  nav: [
    { title: "Features", url: "/features/" },
    { title: "Pricing", url: "/pricing/" },
    { title: "Blog", url: "/blog/" },
  ],

  theme: { brand: "#0f766e" }, // CSS custom properties

  lint: { minWords: 250 },
};
