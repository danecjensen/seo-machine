// Native vector artwork for Banner Goods. No raster images, external fonts or network calls.
// Each brief begins with the requested "Generate an SVG of ..." prompt.
// Run: node scripts/generate-bannergoods-illustrations.mjs
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const root = path.resolve(import.meta.dirname, "../sites/bannergoods.com");
const output = path.join(root, "assets/illustrations");
fs.mkdirSync(output, { recursive: true });
const c = { ink: "#083C4C", cream: "#FCF7F4", teal: "#56ABB9", yellow: "#E9C959", green: "#4AA25E", orange: "#EA9D51", red: "#EE6B3A", plum: "#754054", purple: "#C7A1B6", sky: "#DBEDF0", lime: "#E5F0D5", lilac: "#E7D8E8", blush: "#EFCAC0", butter: "#F6E9B7", apricot: "#F8D6AE" };
const xml = s => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
let sequence = 0;
const id = name => `${name}-${++sequence}`;
const group = (x, y, scale, rotation, body) => `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})">${body}</g>`;
const rect = (x, y, w, h, fill, radius = 0, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, color = c.ink, width = 3, extra = "") => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" ${extra}/>`;
const circle = (x, y, r, fill, extra = "") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const star = (x, y, size, color = c.cream) => group(x, y, size / 40, 0, `<path d="M0-40L10-11 40 0 11 10 0 40-10 11-40 0-11-10Z" fill="${color}"/>`);
const text = (x, y, s, size = 22, color = c.ink, extra = "") => `<text x="${x}" y="${y}" fill="${color}" font-family="sans-serif" font-size="${size}" font-weight="700" text-anchor="middle" ${extra}>${xml(s)}</text>`;
const shadow = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c.ink}" opacity=".10"/>`;
const stroke = `stroke="${c.ink}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;

function cap(color = c.ink, kind = "baseball", logo = c.yellow) {
  const trucker = kind === "trucker";
  return `<path d="M-178 52C-204-58-126-150-20-151 98-159 177-69 180 47L130 86-95 97Z" fill="${color}" ${stroke}/>
    ${trucker ? `<path d="M12-148C130-132 173-55 180 47L75 63C83-40 53-107 12-148Z" fill="${c.cream}" ${stroke}/><path d="M18-140C124-128 166-57 173 44L82 57C88-38 56-109 18-140Z" fill="url(#mesh)"/>` : ""}
    <path d="M-176 52C-102 27 49 28 180 47 205 53 252 86 285 124 196 166 39 178-95 97Z" fill="${trucker ? c.ink : color}" ${stroke}/>
    <path d="M-151 57C-65 43 102 48 164 63" fill="none" stroke="${c.cream}" opacity=".45" stroke-width="3" stroke-dasharray="6 7"/>
    <path d="M-26-149C-77-94-85-22-77 37M-22-149C34-108 72-44 75 39" fill="none" stroke="${c.cream}" opacity=".25" stroke-width="3"/>
    <path d="M-63 83C39 142 170 151 260 124" fill="none" stroke="${c.cream}" opacity=".45" stroke-width="3" stroke-dasharray="6 7"/>
    ${circle(-25, -154, 10, color, stroke)}
    ${trucker ? rect(-80, -74, 111, 72, logo, 12, stroke) + text(-25, -28, "B", 37) : star(-25, -42, 36, logo)}
    ${circle(-126, -65, 4, c.cream)}${circle(105, -49, 4, c.cream)}`;
}

function beanie(color = c.plum) {
  let ribs = "";
  for (let x = -120; x <= 120; x += 18) ribs += `<path d="M${x} 20Q${x * .88}-170 ${x * .3}-194" fill="none" stroke="${c.cream}" stroke-width="4" opacity=".27"/>`;
  return `<path d="M-155 90V-30C-155-245 155-245 155-30V90Z" fill="${color}" ${stroke}/>${ribs}
    ${rect(-174, 5, 348, 129, color, 19, stroke)}
    ${Array.from({ length: 28 }, (_, i) => line(-159 + i * 12, 20, -159 + i * 12, 116, c.cream, 2, 'opacity=".22"')).join("")}
    ${rect(-49, 34, 98, 65, c.butter, 5, stroke)}${text(0, 78, "B", 37)}`;
}

function tote(color = c.butter, print = c.ink, gusset = false, design = "sun") {
  const clip = id("bag");
  const shape = `M-151-84H139L163 218Q0 252-166 215Z`;
  return `<defs><clipPath id="${clip}"><path d="${shape}"/></clipPath></defs>
    <path d="M-91-75V-156C-91-283 87-283 87-156V-75" fill="none" stroke="${c.ink}" stroke-width="29"/>
    <path d="M-91-75V-156C-91-283 87-283 87-156V-75" fill="none" stroke="${color}" stroke-width="21"/>
    ${gusset ? `<path d="M139-84L190-59 210 192 163 218Z" fill="${c.orange}" ${stroke}/>` : ""}
    <path d="${shape}" fill="${color}" ${stroke}/><g clip-path="url(#${clip})">${rect(-180, -90, 380, 360, "url(#weave)")}</g>
    <path d="M-137-61H126M-142-59L-153 201Q-2 233 150 206L127-58" fill="none" stroke="${c.ink}" stroke-width="2" opacity=".35" stroke-dasharray="5 6"/>
    ${line(-91, -83, -91, -39, c.ink, 12)}${line(87, -83, 87, -39, c.ink, 12)}
    ${design === "type" ? text(-4, 45, "GOOD", 45, print) + text(-4, 98, "THINGS", 39, print) + star(-4, 156, 20, print) : circle(-5, 59, 63, print) + star(-5, 59, 39, color) + text(-5, 161, "BANNER", 23, print)}`;
}

function blanket(color = c.teal, folded = false, fleece = false) {
  const clip = id("blanket");
  const h = folded ? 205 : 360;
  let pattern = "";
  if (!fleece) {
    for (let y = -h / 2 + 39; y < h / 2; y += 72)
      for (let x = -184; x < 220; x += 92)
        pattern += `<path d="M${x} ${y - 26}l26 26-26 26-26-26Z" fill="${c.butter}"/>${circle(x, y, 7, c.plum)}`;
  }
  return `<defs><clipPath id="${clip}">${rect(-232, -h / 2, 464, h, "white", 12)}</clipPath></defs>
    ${rect(-232, -h / 2, 464, h, color, 12, stroke)}
    <g clip-path="url(#${clip})">${pattern}${rect(-240, -h / 2, 480, h, "url(#weave)")}</g>
    ${!fleece ? Array.from({ length: 30 }, (_, i) => line(-220 + i * 15, h / 2 + 2, -224 + i * 15, h / 2 + 28, c.cream, 7)).join("") : star(107, 4, 38, c.cream)}
    ${folded ? line(-224, h / 2 - 29, 223, h / 2 - 29, c.ink, 3, 'opacity=".3"') : ""}
    ${rect(151, h / 2 - 49, 61, 35, c.cream, 3, stroke)}${text(181, h / 2 - 24, "B", 22)}`;
}

function sock(color = c.ink, accent = c.orange, kind = "crew", patterned = false) {
  const clip = id("sock");
  const top = kind === "knee" ? -270 : -180;
  const outline = `M-74 ${top}H59V66Q62 101 105 125L151 152Q198 184 160 219 136 242 84 221L-43 157Q-74 140-74 97Z`;
  let details = "";
  if (patterned) for (let y = top + 85; y < 198; y += 63) for (let x = -44; x < 105; x += 59) details += star(x, y, 14, accent);
  else details = star(-7, top + 128, 28, accent);
  return `<defs><clipPath id="${clip}"><path d="${outline}"/></clipPath></defs>
    <path d="${outline}" fill="${color}" ${stroke}/>
    <g clip-path="url(#${clip})">${rect(-90, top + 23, 170, 12, accent)}${rect(-90, top + 48, 170, 12, accent)}
      ${details}<path d="M-80 73Q3 77-8 172L-90 151Z" fill="${accent}"/>
      <path d="M129 120Q100 167 102 240L198 244 220 149Z" fill="${accent}"/>
      ${rect(-80, top, 300, 510, "url(#weave)")}</g>
    ${Array.from({ length: 9 }, (_, i) => line(-61 + i * 13, top + 4, -61 + i * 13, top + 19, c.cream, 2, 'opacity=".5"')).join("")}`;
}

const socks = (color, accent, kind, pattern) => group(-71, -9, .95, 13, sock(accent, color, kind, pattern)) + group(80, 13, 1, -9, sock(color, accent, kind, pattern));
function box(filled = true, closed = false) {
  if (closed) return `<path d="M-205-138L46-210 242-102 4-17Z" fill="${c.butter}" ${stroke}/>
    <path d="M-205-138L4-17V184L-205 62Z" fill="${c.orange}" ${stroke}/>
    <path d="M4-17L242-102V97L4 184Z" fill="#D7AD70" ${stroke}/>
    <path d="M-115-163L90-49 140-67-60-180Z" fill="${c.cream}" opacity=".8"/>
    ${rect(45, 11, 125, 75, c.cream, 4)}${line(61, 28, 148, 28, c.ink, 3)}${line(61, 42, 115, 42, c.ink, 3)}
    ${Array.from({ length: 16 }, (_, i) => line(62 + i * 5, 55, 62 + i * 5, 74, c.ink, i % 3 === 0 ? 3 : 1)).join("")}`;
  return `<path d="M-230-104L0-181 239-90 8 4Z" fill="#C39960" ${stroke}/>
    <path d="M-230-104L-296-218-76-288 0-181Z" fill="${c.butter}" ${stroke}/>
    <path d="M0-181L81-277 311-181 239-90Z" fill="${c.apricot}" ${stroke}/>
    ${filled ? group(5, -105, .55, 14, socks(c.ink, c.orange, "crew", true)) : ""}
    <path d="M-230-104L8 4V197L-230 90Z" fill="${c.orange}" ${stroke}/>
    <path d="M8 4L239-90V103L8 197Z" fill="#D7AD70" ${stroke}/>
    <path d="M-230-104L8 4-60 87-302-22Z" fill="${c.apricot}" ${stroke}/>
    <path d="M8 4L239-90 303-6 79 89Z" fill="${c.butter}" ${stroke}/>
    ${star(124, 116, 31, c.ink)}`;
}
function swatches(x, y) {
  return group(x, y, 1, -8, [c.ink, c.teal, c.purple, c.yellow, c.orange].map((color, i) => rect(i * 44, 0, 37, 65, color, 3, 'stroke="#FFFFFF" stroke-width="3"')).join(""));
}
function flatlay() {
  return group(380, 290, .75, -13, cap(c.ink)) + group(800, 350, .79, 9, tote(c.butter)) + group(405, 663, .8, -11, blanket(c.teal, true)) + group(817, 676, .58, 9, socks(c.plum, c.orange));
}
function packing() {
  return shadow(585, 724, 327, 45) + group(570, 514, 1.05, -3, box(true)) + swatches(260, 197) +
    group(872, 610, .66, 15, cap(c.teal)) + group(856, 212, .8, 8, rect(-75, -49, 150, 98, c.cream, 7, stroke) + text(0, -9, "PACKED", 19) + text(0, 20, "WITH CARE", 15)) +
    `<path d="M224 409C329 316 423 387 381 452" fill="none" stroke="${c.ink}" stroke-width="5" stroke-dasharray="9 12"/>` + star(242, 517, 25, c.plum);
}

const briefs = [];
function save(name, subject, background, artwork) {
  const prompt = `Generate an SVG of ${subject}. Use Banner Goods' Craft palette, a warm paper background, clean dark navy outlines, tactile woven details and an editorial product illustration style. Keep the subject centered with safe margins for square and 4:3 crops. Use only native SVG vectors with no embedded raster images or external resources.`;
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" role="img" aria-labelledby="title desc">
  <title id="title">${xml(subject[0].toUpperCase() + subject.slice(1))}</title>
  <desc id="desc">${xml(prompt)}</desc>
  <defs>
    <pattern id="weave" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 2H9M2 0V9" fill="none" stroke="${c.ink}" stroke-width=".8" opacity=".11"/></pattern>
    <pattern id="mesh" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0 0L14 14M14 0L0 14" stroke="${c.ink}" stroke-width="1" opacity=".45"/></pattern>
    <pattern id="paper" width="29" height="31" patternUnits="userSpaceOnUse">${circle(4, 8, .9, c.ink, 'opacity=".08"')}${circle(20, 24, .7, c.ink, 'opacity=".06"')}</pattern>
  </defs>
  ${rect(0, 0, 1200, 900, background)}${rect(0, 0, 1200, 900, "url(#paper)")}
  <path d="M205 735Q600 654 995 735" fill="none" stroke="${c.ink}" stroke-width="2" opacity=".10"/>
  ${star(225, 165, 21, c.purple)}${circle(981, 728, 9, c.teal)}${artwork}
</svg>
`;
  fs.writeFileSync(path.join(output, `${name}.svg`), doc);
  const entry = { name, path: `/assets/illustrations/${name}.svg`, alt: `Illustration of ${subject}`, width: 1200, height: 900, prompt };
  briefs.push(entry);
  return entry;
}

save("merch-collection", "Banner Goods custom hats, totes, blankets and socks arranged together", c.lilac, flatlay());
save("order-packing", "a Banner Goods order being packed in a shipping box", c.sky, packing());
save("custom-hats", "custom embroidered caps and a cuffed beanie", c.sky,
  shadow(610, 715, 305, 41) + group(772, 336, .83, 9, beanie(c.plum)) + group(500, 566, 1.04, -13, cap(c.ink)));
save("custom-tote-bags", "custom printed canvas tote bags with bold graphic designs", c.lime,
  shadow(600, 748, 280, 35) + group(779, 434, .88, 13, tote(c.teal, c.cream)) + group(457, 497, 1.02, -9, tote(c.butter, c.ink, true, "type")));
save("custom-blankets", "custom woven throws and a folded fleece blanket", c.lilac,
  shadow(600, 759, 319, 36) + group(624, 381, 1.07, 9, blanket(c.teal)) + group(512, 654, .94, -8, blanket(c.plum, true, true)));
save("custom-socks", "custom knit crew and athletic socks in brand colors", c.apricot,
  shadow(600, 759, 300, 33) + group(600, 430, 1.2, -7, socks(c.ink, c.orange, "crew", true)));

const work = [
  ["embroidered-baseball-caps", "embroidered baseball caps", c.butter, group(741, 323, .72, 10, cap(c.teal, "baseball", c.cream)) + group(474, 557, 1.01, -12, cap(c.ink))],
  ["screen-printed-canvas-totes", "screen printed canvas totes", c.lime, group(752, 427, .81, 11, tote(c.orange, c.ink, false, "type")) + group(471, 484, 1.02, -9, tote(c.butter))],
  ["woven-design-blanket", "a woven blanket with a full design", c.blush, group(600, 441, 1.28, -8, blanket(c.teal))],
  ["brand-color-crew-socks", "knit crew socks in brand colors", c.apricot, group(575, 436, 1.24, -8, socks(c.plum, c.yellow))],
  ["patch-trucker-hats", "trucker hats with a patch logo", c.sky, group(750, 327, .7, 8, cap(c.orange, "trucker", c.cream)) + group(481, 560, 1.07, -12, cap(c.teal, "trucker", c.butter))],
  ["cotton-conference-totes", "cotton conference totes", c.butter, group(758, 440, .83, 12, tote(c.cream, c.teal, false, "type")) + group(463, 481, .97, -10, tote(c.cream, c.plum, false, "type"))],
  ["woven-label-beanies", "knit beanies with a woven label", c.lilac, group(776, 397, .86, 12, beanie(c.teal)) + group(461, 522, 1.05, -11, beanie(c.plum))],
  ["embroidered-fleece-blankets", "embroidered fleece blankets", c.lime, group(662, 354, 1.02, 8, blanket(c.ink, true, true)) + group(532, 596, 1.13, -9, blanket(c.green, true, true))],
  ["athletic-team-socks", "athletic team socks", c.sky, group(579, 447, 1.24, -6, socks(c.cream, c.teal)) + text(600, 752, "TEAM COLORS. EVERY STEP.", 21)],
  ["colored-printed-totes", "colored totes with a light print", c.butter, group(747, 416, .87, 11, tote(c.ink, c.cream, false, "type")) + group(458, 491, 1.03, -10, tote(c.plum, c.cream))],
  ["logo-tag-stadium-blankets", "stadium blankets folded with a logo tag", c.apricot, group(680, 336, .96, 9, blanket(c.teal, true)) + group(527, 593, 1.12, -9, blanket(c.ink, true))],
  ["welcome-kit-socks", "patterned socks packed for a welcome kit", c.lilac, group(594, 506, 1.15, -3, box(true))],
  ["printed-logo-dad-hats", "dad hats with a printed logo", c.blush, group(763, 327, .73, 10, cap(c.orange, "dad", c.ink)) + group(476, 557, 1.04, -12, cap(c.green, "dad", c.cream))],
  ["gusseted-event-totes", "gusseted totes used as event bags", c.sky, group(749, 419, .83, 10, tote(c.orange, c.ink, true, "type")) + group(450, 489, .99, -10, tote(c.butter, c.plum, true))],
  ["throw-blanket-gift-box", "a throw blanket gift box", c.butter, group(599, 512, 1.09, -3, box(false)) + group(594, 349, .78, -3, blanket(c.plum, true))],
  ["knee-high-uniform-socks", "knee-high socks for a team uniform", c.lime, group(587, 481, 1.08, -6, socks(c.ink, c.yellow, "knee"))],
];
for (const [name, subject, bg, art] of work) save(name, subject, bg, shadow(600, 757, 302, 34) + art);

save("cap-logo-proof", "a logo proof on a cap", c.sky,
  group(600, 452, 1, -5, rect(-340, -287, 680, 570, c.cream, 13, stroke) + rect(-292, -240, 584, 402, c.butter, 6) + group(-35, -12, .91, -5, cap(c.ink)) + text(-194, 227, "LOGO PROOF", 24) + line(78, 213, 251, 213, c.teal, 12)));
save("product-approval", "products laid out for approval", c.butter,
  group(0, -30, .91, 0, flatlay()) + group(854, 653, .9, 6, rect(-115, -75, 230, 155, c.cream, 6, stroke) + text(0, -20, "DESIGN REVIEW", 16) + circle(0, 27, 26, c.green) + `<path d="M-14 26l10 10 20-23" fill="none" stroke="white" stroke-width="6"/>`));
save("ready-to-ship", "a finished order ready to ship", c.lime,
  shadow(600, 745, 289, 39) + group(599, 484, 1.35, -6, box(false, true)) + group(840, 217, .82, 8, circle(0, 0, 58, c.green, stroke) + `<path d="M-28 0l20 20 39-45" fill="none" stroke="white" stroke-width="10"/>`));

// Retain the exact generation briefs alongside the site, outside published assets.
fs.mkdirSync(path.join(root, "_design"), { recursive: true });
fs.writeFileSync(path.join(root, "_design/illustration-prompts.json"), JSON.stringify(briefs, null, 2) + "\n");

// Bind every existing empty gallery slot to its corresponding vector image.
const galleryFile = path.join(root, "_data/past_work.yml");
const gallery = YAML.parse(fs.readFileSync(galleryFile, "utf8"));
for (const item of gallery) {
  const brief = briefs.find(b => b.alt === `Illustration of ${item.label}`);
  if (!brief) throw new Error(`No illustration for ${item.label}`);
  item.image = brief.path;
  item.alt = brief.alt;
}
fs.writeFileSync(galleryFile, "# Illustrated product examples. These are design concepts, not customer photographs.\n# product: product page; show: additional pages that display the example.\n" + YAML.stringify(gallery, { lineWidth: 0 }));
console.log(`Generated ${briefs.length} SVG illustrations and linked ${gallery.length} gallery examples.`);
