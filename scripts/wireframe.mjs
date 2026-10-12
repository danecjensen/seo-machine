// Page archetypes <-> grayscale wireframes, for one site's sites/<domain>/_archetypes/.
//   npm run wireframe -- --site <domain> [name ...]                 skeleton -> wireframe: write <name>.png
//   npm run wireframe -- --site <domain> --from <image.png> <name>  wireframe -> skeleton: write <name>.html (and a clean <name>.png)
//   npm run wireframe -- --site <domain> --check                    fail if a .png doesn't match its skeleton
//   npm run wireframe -- --site <domain> --layout <name>            print the Eleventy layout the build makes from it
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { carrySlots, decodePng, encodePng, readImage, readSkeleton, renderTree, toLayout, writeSkeleton } from "../lib/wireframe.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    site: { type: "string" },
    from: { type: "string" },
    check: { type: "boolean", default: false },
    layout: { type: "string" },
  },
});
const fail = (msg) => { console.error(msg); process.exit(1); };
if (!values.site) fail("usage: npm run wireframe -- --site <domain> [--from <image.png> <name> | --check | --layout <name>] [name ...]");
const dir = path.resolve(import.meta.dirname, "..", "sites", values.site, "_archetypes");
if (!fs.existsSync(dir)) fail(`${values.site} has no _archetypes/ folder`);
const file = (name, ext) => path.join(dir, `${name}.${ext}`);
const names = positionals.length ? positionals : fs.readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5)).sort();
const skeleton = (name) => {
  if (!fs.existsSync(file(name, "html"))) fail(`no archetype ${name}: ${path.relative(process.cwd(), file(name, "html"))} doesn't exist`);
  return fs.readFileSync(file(name, "html"), "utf8");
};

if (values.layout) {
  process.stdout.write(toLayout(readSkeleton(skeleton(values.layout)), values.layout));
} else if (values.from) {
  if (names.length !== 1 || !positionals.length) fail("--from needs exactly one archetype name, e.g. --from home.png home");
  const [name] = names;
  const old = fs.existsSync(file(name, "html")) ? fs.readFileSync(file(name, "html"), "utf8") : "";
  const tree = readImage(decodePng(fs.readFileSync(values.from)));
  const unnamed = carrySlots(tree, old ? readSkeleton(old) : null);
  const comment = old.match(/^<!--\s*([\s\S]*?)\s*-->/)?.[1] ?? `${name} archetype. ${name}.png is this skeleton as a grayscale wireframe.`;
  fs.writeFileSync(file(name, "html"), writeSkeleton(tree, comment));
  fs.writeFileSync(file(name, "png"), encodePng(renderTree(tree)));
  console.log(`✓ ${name}: ${tree.sections.length} sections -> ${path.relative(process.cwd(), file(name, "html"))} (and a clean ${name}.png)`);
  if (unnamed.length) {
    console.log(`  These blocks have no data-slot yet, so the page shows a placeholder for them:`);
    for (const u of unnamed) console.log(`    ${u}`);
  }
} else {
  let stale = 0;
  for (const name of names) {
    const want = renderTree(readSkeleton(skeleton(name)));
    if (values.check) {
      const have = fs.existsSync(file(name, "png")) && decodePng(fs.readFileSync(file(name, "png")));
      const same = have && have.width === want.width && have.height === want.height && Buffer.from(have.gray).equals(Buffer.from(want.gray));
      if (!same) { stale++; console.error(`✗ ${name}.png doesn't match ${name}.html; run npm run wireframe -- --site ${values.site} ${name}`); }
      else console.log(`✓ ${name}.png matches ${name}.html`);
    } else {
      fs.writeFileSync(file(name, "png"), encodePng(want));
      console.log(`✓ ${name}: ${path.relative(process.cwd(), file(name, "png"))} (${want.width}x${want.height})`);
    }
  }
  if (stale) process.exit(1);
}
