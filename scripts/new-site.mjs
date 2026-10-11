// npm run new-site -- example.com ["Example Co"]
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const [domain, nameArg] = process.argv.slice(2);
if (!domain || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
  console.error("usage: npm run new-site -- example.com [\"Site Name\"]");
  process.exit(1);
}
const dir = path.join(ROOT, "sites", domain);
if (fs.existsSync(dir)) {
  console.error(`sites/${domain} already exists`);
  process.exit(1);
}
const name = nameArg ?? domain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const astro = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).devDependencies.astro;
const files = {
  "package.json": JSON.stringify({
    name: domain, private: true, type: "module",
    scripts: { dev: "astro dev", build: "astro build", preview: "astro preview" },
    dependencies: { "@seo-machine/kit": "*", astro },
  }, null, 2) + "\n",
  "astro.config.mjs": `import { defineSite } from "@seo-machine/kit";\nimport site from "./site.config.mjs";\n\nexport default defineSite(import.meta.url, site);\n`,
  "src/content.config.mjs": `export { collections } from "@seo-machine/kit/content";\n`,
  "site.config.mjs": `export default {
  domain: "${domain}",
  name: "${name}",
  description: "One sentence on what ${name} does and who it is for, 50 to 160 characters long.",
  language: "en",
  locale: "en_US",
  titleTemplate: "{title} | {site}",
  // defaultImage: "/og.png", // 1200x630 PNG or JPG in public/, used when a page has no image

  goals: {
    primary: "What a visitor should do, e.g. book a call",
    audience: "Who the site is for",
    keywords: [],
    cta: { text: "Get started", title: "Ready when you are.", url: "/contact/" },
  },

  organization: { type: "Organization" }, // or LocalBusiness, Plumber, Dentist, LegalService...
  nav: [{ title: "About", url: "/about/" }],
  theme: { brand: "#1d4ed8" },
};
`,
  "src/content/index.md": `---\ntitle: "${name}"\ndescription: "Replace with a 50 to 160 character summary of ${name} that includes your main keyword."\nkeyword: ""\n---\n\nWrite the opening paragraph here. Lead with the outcome the reader wants.\n`,
  "src/content/about.md": `---\ntitle: "About ${name}"\ndescription: "Who is behind ${name}, why it exists, and how it helps. Replace this with 50 to 160 characters."\n---\n\nTell the story here.\n`,
  "src/content/contact.md": `---\ntitle: "Contact ${name}"\ndescription: "How to reach ${name}. Replace this with 50 to 160 characters that say how and when to get in touch."\n---\n\nHow to get in touch.\n`,
  "public/favicon.svg": fs.readFileSync(path.join(ROOT, "packages/kit/public/favicon.svg"), "utf8"),
};
for (const [file, body] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), body);
}
console.log(`created sites/${domain}/. Next: npm install && npm run build -- --site ${domain}`);
