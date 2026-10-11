// npm run new-site -- example.com ["Example Co"]
import fs from "node:fs";
import path from "node:path";
import { DOMAIN_RE } from "../lib/site.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const [domain, nameArg] = process.argv.slice(2);
if (!domain || !DOMAIN_RE.test(domain)) {
  console.error('usage: npm run new-site -- example.com ["Site Name"]');
  process.exit(1);
}
const dir = path.join(ROOT, "sites", domain);
if (fs.existsSync(dir)) {
  console.error(`sites/${domain} already exists`);
  process.exit(1);
}
const name = nameArg ?? domain.split(".")[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const files = {
  "_config.yml": `title: ${name}
description: "One sentence on what ${name} does and who it is for, 50 to 160 characters long."
url: https://${domain}
lang: en
locale: en_US
title_format: "{title} | {site}"
# image:
#   path: /assets/og.png   # 1200x630 share image used when a page has none
#   alt: ${name}
colors:
  brand: "#1d4ed8"

permalink: /blog/:title/

goals:
  primary: What a visitor should do, e.g. book a call
  audience: Who the site is for
  keywords: []
  cta:
    text: Get started
    title: Ready when you are.
    url: /contact/

organization:
  type: Organization   # or LocalBusiness, Plumber, Dentist, LegalService...
`,
  "_data/navigation.yml": "- title: About\n  url: /about/\n",
  "index.md": `---\ntitle: "${name}"\ndescription: "Replace with a 50 to 160 character summary of ${name} that includes your main keyword."\nkeyword: ""\n---\n\nWrite the opening paragraph here. Lead with the outcome the reader wants.\n`,
  "about.md": `---\ntitle: "About ${name}"\ndescription: "Who is behind ${name}, why it exists, and how it helps. Replace this with 50 to 160 characters."\n---\n\nTell the story here.\n`,
  "contact.md": `---\ntitle: "Contact ${name}"\ndescription: "How to reach ${name}. Replace this with 50 to 160 characters that say how and when to get in touch."\n---\n\nHow to get in touch.\n`,
  "assets/.gitkeep": "",
};
for (const [file, body] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), body);
}
console.log(`created sites/${domain}/. Next: npm run build -- --site ${domain} --verbose`);
