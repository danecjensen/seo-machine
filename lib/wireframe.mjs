// Page archetypes as grayscale wireframes. An archetype is an HTML skeleton (sites/<domain>/_archetypes/<name>.html)
// that converts both ways with a grayscale PNG next to it, and builds into the Eleventy layout _layouts/<name>.html.
//
// Skeleton:  <section> holds groups, stacked. A group is a run of leaves (one full-width column) or a
//            <div class="row"> of <div data-span="1-12" [class="panel"]> columns, each a stack of leaves.
//            Leaves: <h1>-<h3> heading, <p data-lines="N"> text, <a> button, <figure data-ratio="4:3"> image.
//            data-slot="name" on a section, column or leaf fills it with _includes/slots/<name>.html.
// Image:     white page, 12-column grid. Each kind of block is one flat gray (GRAYS), and the gaps between
//            blocks say how they group: wide gaps between sections, medium between groups, narrow between
//            blocks in a column, and text lines closer still (GRID).
import zlib from "node:zlib";
import { parse } from "node-html-parser";

export const GRID = { width: 1200, margin: 40, sectionGap: 64, groupGap: 32, leafGap: 16, gutter: 24, pad: 24,
  line: 10, lineGap: 6, buttonW: 160, buttonH: 44 };
export const GRAYS = { bg: 255, panel: 224, text: 176, image: 128, button: 64, heading: 0 };
const HEADING_H = { 1: 40, 2: 28, 3: 20 };
const HEADING_W = 0.75; // headings are drawn at 3/4 of their column, so they read as headings
const RATIOS = ["1:1", "4:3", "3:2", "16:9", "2:1", "3:4", "2:3"];
const ratioValue = (r) => { const [w, h] = r.split(":").map(Number); return w / h; };

// ---------------------------------------------------------------- skeleton HTML <-> tree

/** Skeleton HTML -> { sections: [{ slot, groups: [{ cols: [{ span, panel, slot, leaves }] }] }] } */
export function readSkeleton(html) {
  const root = parse(html, { comment: false });
  const els = (node) => node.childNodes.filter((n) => n.nodeType === 1);
  const sections = els(root).map((sec) => {
    if (sec.tagName !== "SECTION") throw new Error(`skeleton: expected <section>, found <${sec.tagName.toLowerCase()}>`);
    const groups = [];
    let loose = null; // consecutive leaves directly in a section stack up as one full-width column
    for (const el of els(sec)) {
      if (el.classList.contains("row")) {
        loose = null;
        groups.push({ cols: els(el).map((col) => {
          const span = Number(col.getAttribute("data-span"));
          if (!(span >= 1 && span <= 12)) throw new Error(`skeleton: a column needs data-span="1" to "12"`);
          return { span, panel: col.classList.contains("panel"), slot: col.getAttribute("data-slot"), leaves: els(col).map(readLeaf) };
        }) });
      } else {
        if (!loose) groups.push({ cols: [loose = { span: 12, panel: false, slot: undefined, leaves: [] }] });
        loose.leaves.push(readLeaf(el));
      }
    }
    return { slot: sec.getAttribute("data-slot"), groups };
  });
  return { sections };
}

function readLeaf(el) {
  const tag = el.tagName.toLowerCase();
  const slot = el.getAttribute("data-slot");
  if (/^h[1-3]$/.test(tag)) return { kind: "heading", level: Number(tag[1]), slot };
  if (tag === "p") return { kind: "text", lines: Math.max(1, Number(el.getAttribute("data-lines") ?? 1)), slot };
  if (tag === "a") return { kind: "button", slot };
  if (tag === "figure") {
    const ratio = el.getAttribute("data-ratio") ?? "1:1";
    if (!RATIOS.includes(ratio)) throw new Error(`skeleton: data-ratio="${ratio}" should be one of ${RATIOS.join(", ")}`);
    return { kind: "image", ratio, slot };
  }
  throw new Error(`skeleton: <${tag}> isn't a block; use h1-h3, p, a or figure`);
}

/** Tree -> skeleton HTML. */
export function writeSkeleton(tree, comment = "") {
  const out = comment ? [`<!-- ${comment} -->`] : [];
  const slot = (x) => (x.slot ? ` data-slot="${x.slot}"` : "");
  const leaf = (l) => {
    if (l.kind === "heading") return `<h${l.level}${slot(l)}></h${l.level}>`;
    if (l.kind === "text") return `<p${l.lines > 1 ? ` data-lines="${l.lines}"` : ""}${slot(l)}></p>`;
    if (l.kind === "button") return `<a${slot(l)}></a>`;
    return `<figure data-ratio="${l.ratio}"${slot(l)}></figure>`;
  };
  for (const sec of tree.sections) {
    out.push(`<section${slot(sec)}>`);
    let prevLoose = false;
    for (const g of sec.groups) {
      const [c] = g.cols;
      const loose = g.cols.length === 1 && c.span === 12 && !c.panel && !c.slot && !prevLoose;
      if (loose) for (const l of c.leaves) out.push(`  ${leaf(l)}`);
      else {
        out.push(`  <div class="row">`);
        for (const col of g.cols) {
          out.push(`    <div data-span="${col.span}"${col.panel ? ` class="panel"` : ""}${slot(col)}>`);
          for (const l of col.leaves) out.push(`      ${leaf(l)}`);
          out.push(`    </div>`);
        }
        out.push(`  </div>`);
      }
      prevLoose = loose;
    }
    out.push(`</section>`);
  }
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------- tree -> grayscale image

const unitWidth = () => (GRID.width - 2 * GRID.margin + GRID.gutter) / 12;

/** Node ids shared by the layout's measuring markers and the drawing: s0, s0.g1.r, s0.g1.c2, s0.g1.c2.l0. */
const ids = { section: (s) => `s${s}`, repeat: (s, g) => `s${s}.g${g}.r`, col: (s, g, c) => `s${s}.g${g}.c${c}`,
  leaf: (s, g, c, l) => `s${s}.g${g}.c${c}.l${l}` };

/** How to draw a leaf: line widths as fractions of its column, and an image's shape. Measured from the built
 *  page when there's a measurement for it (block), else the skeleton's own fixed sizes. */
function spec(l, block, cw) {
  if (l.kind === "heading") return { ...l, bars: block?.lines?.length ? block.lines.map((x) => (x.right - x.left) / cw) : [HEADING_W] };
  if (l.kind === "text") {
    return { ...l, bars: block?.lines?.length ? block.lines.map((x) => (x.right - x.left) / cw)
      : Array.from({ length: l.lines }, (_, i) => (l.lines > 1 && i === l.lines - 1 ? 0.6 : 1)) };
  }
  if (l.kind === "button") return { ...l, frac: block ? block.w / cw : null };
  return { ...l, aspect: block?.h ? block.w / block.h : ratioValue(l.ratio) };
}

/** Pair a column's leaves with the blocks measured in it, in order and by kind. The last text leaf also takes
 *  every heading and text block after it, so a block of rich content draws as one run of text lines. */
function matchBlocks(leaves, blocks = []) {
  let at = 0;
  const lastText = leaves.map((l) => l.kind).lastIndexOf("text");
  return leaves.map((l, i) => {
    const j = blocks.findIndex((b, k) => k >= at && b.kind === l.kind);
    if (j < 0) return undefined;
    at = j + 1;
    if (i !== lastText) return blocks[j];
    const rest = [blocks[j]];
    while (at < blocks.length && (blocks[at].kind === "text" || blocks[at].kind === "heading")) rest.push(blocks[at++]);
    const lines = [];
    for (const ln of rest.flatMap((b) => b.lines)) {
      const same = lines.find((x) => Math.abs(x.top - ln.top) < 6);
      if (same) { same.left = Math.min(same.left, ln.left); same.right = Math.max(same.right, ln.right); }
      else lines.push({ ...ln });
    }
    return { kind: "text", lines: lines.sort((a, b) => a.top - b.top) };
  });
}

/** The tree with each leaf turned into a drawing spec, using measurements (Map id -> inventory) when given. */
function drawable(tree, inv) {
  const m = (id) => inv?.get(id);
  return tree.sections.map((sec, si) => {
    const secInv = sec.slot && m(ids.section(si));
    if (secInv && !secInv.blocks?.length) return null; // a slot section with nothing on this page (no FAQ yet) isn't drawn
    const secBlocks = secInv?.blocks?.length ? matchBlocks(sec.groups.flatMap((g) => g.cols.flatMap((c) => c.leaves)), secInv.blocks) : null;
    let n = 0;
    return sec.groups.map((g, gi) => {
      const rep = isRepeat(g) && g.cols[0].slot && m(ids.repeat(si, gi));
      if (rep?.items?.length) {
        const fit = Math.floor(12 / g.cols[0].span); // a repeating row draws the items that fit across one row
        return rep.items.slice(0, fit).map((item) => ({ span: g.cols[0].span, panel: g.cols[0].panel,
          leaves: matchBlocks(g.cols[0].leaves, item.blocks).map((b, i) => spec(g.cols[0].leaves[i], b, item.width)) }));
      }
      return g.cols.map((col, ci) => {
        const colInv = col.slot && m(ids.col(si, gi, ci));
        const colBlocks = colInv ? matchBlocks(col.leaves, colInv.blocks) : null;
        return { span: col.span, panel: col.panel, leaves: col.leaves.map((l, li) => {
          if (secBlocks) return spec(l, secBlocks[n++], secInv.width);
          if (colBlocks) return spec(l, colBlocks[li], colInv.width);
          const leafInv = l.slot && m(ids.leaf(si, gi, ci, li));
          return spec(l, leafInv ? matchBlocks([l], leafInv.blocks)[0] : undefined, leafInv?.width);
        }) };
      });
    });
  });
}

const barsHeight = (bars, h) => bars.length * (h + GRID.lineGap) - GRID.lineGap;
function leafHeight(l, w) {
  if (l.kind === "heading") return barsHeight(l.bars, HEADING_H[l.level]);
  if (l.kind === "text") return barsHeight(l.bars, GRID.line);
  if (l.kind === "button") return GRID.buttonH;
  return Math.round(w / l.aspect);
}
const stackHeight = (leaves, w) => leaves.reduce((h, l, i) => h + leafHeight(l, w) + (i ? GRID.leafGap : 0), 0);
const colHeight = (col, w) => (col.panel ? stackHeight(col.leaves, w - 2 * GRID.pad) + 2 * GRID.pad : stackHeight(col.leaves, w));

/** Tree -> { width, height, gray } (one byte per pixel). With measurements from the built page (see
 *  scripts/wireframe.mjs), blocks take the page's real proportions and the site's header and footer are drawn
 *  as edge-to-edge bands; the grid, spacing and grays stay the same, so the image still reads back. */
export function renderTree(tree, { measured, chrome } = {}) {
  const rects = [];
  const unit = unitWidth();
  const bar = (x, y, w, h, g) => rects.push([x, y, w, h, g]);
  let y = GRID.margin;
  if (chrome?.header) y = drawBand(chrome.header, 0, bar) + GRID.margin;
  drawable(tree, measured).filter(Boolean).forEach((groups, si) => {
    if (si) y += GRID.sectionGap;
    groups.forEach((cols, gi) => {
      if (gi) y += GRID.groupGap;
      let at = 0, rowH = 0;
      for (const col of cols) {
        const x = GRID.margin + at * unit, w = col.span * unit - GRID.gutter;
        const h = colHeight(col, w);
        if (col.panel) bar(x, y, w, h, GRAYS.panel);
        const p = col.panel ? GRID.pad : 0;
        let ly = y + p;
        for (const l of col.leaves) {
          const lw = w - 2 * p, lh = leafHeight(l, lw);
          if (l.kind === "heading" || l.kind === "text") {
            const h1 = l.kind === "heading" ? HEADING_H[l.level] : GRID.line;
            l.bars.forEach((f, i) => bar(x + p, ly + i * (h1 + GRID.lineGap), Math.max(4, Math.min(1, f) * lw), h1, GRAYS[l.kind]));
          } else if (l.kind === "button") bar(x + p, ly, Math.min(lw, l.frac ? l.frac * lw : GRID.buttonW), lh, GRAYS.button);
          else bar(x + p, ly, lw, lh, GRAYS.image);
          ly += lh + GRID.leafGap;
        }
        rowH = Math.max(rowH, h);
        at += col.span;
      }
      y += rowH;
    });
  });
  y += GRID.margin;
  if (chrome?.footer) y = drawBand(chrome.footer, y, bar);
  const width = GRID.width, height = Math.round(y);
  const gray = new Uint8Array(width * height).fill(GRAYS.bg);
  for (const [x, ry, w, h, g] of rects) {
    const x0 = Math.round(x), x1 = Math.round(x + w), y0 = Math.round(ry), y1 = Math.round(ry + h);
    for (let yy = y0; yy < y1; yy++) gray.fill(g, yy * width + x0, yy * width + x1);
  }
  return { width, height, gray };
}

/** The site's header (with breadcrumbs) or footer: an edge-to-edge panel band with its blocks inside, at their
 *  measured positions. Bands touch the image's edges, which is how reading an image knows to skip them. */
function drawBand(band, y0, bar) {
  const scale = (GRID.width - 2 * GRID.margin) / band.contentWidth;
  bar(0, y0, GRID.width, band.height * scale, GRAYS.panel);
  for (const b of band.blocks) {
    const x = GRID.margin + (b.left - band.left) * scale, y = y0 + (b.top - band.top) * scale;
    const w = b.width * scale, h = Math.max(4, b.height * scale);
    bar(x, y, w, h, b.kind === "button" ? GRAYS.button : b.kind === "heading" ? GRAYS.heading : GRAYS.text);
  }
  return y0 + band.height * scale;
}

// ---------------------------------------------------------------- grayscale image -> tree

const PALETTE = Object.entries(GRAYS); // [kind, gray]

/** { width, height, gray } -> tree. Works on any size: spacing is judged relative to the content's width. */
export function readImage({ width, height, gray }) {
  const kind = new Array(width * height);
  const nearest = new Map();
  for (let i = 0; i < gray.length; i++) {
    let k = nearest.get(gray[i]);
    if (!k) {
      k = PALETTE.reduce((best, [name, g]) => (Math.abs(g - gray[i]) < Math.abs(GRAYS[best] - gray[i]) ? name : best), "bg");
      nearest.set(gray[i], k);
    }
    kind[i] = k;
  }
  const fg = (k) => k !== "bg";
  const inPanel = (k) => k !== "bg" && k !== "panel";
  // The header and footer bands touch the image's edges; the archetype is what's between them.
  let top = 0, bottom = height;
  while (top < height && kind[top * width] !== "bg") top++;
  while (bottom > top && kind[(bottom - 1) * width] !== "bg") bottom--;
  const box = bbox(kind, width, [0, width, top, bottom], fg);
  if (!box) throw new Error("wireframe image is blank");
  const s = (box[1] - box[0]) / (GRID.width - 2 * GRID.margin); // scale against the reference grid
  const T = { section: 48 * s, group: 24 * s, leaf: 12 * s, col: 12 * s };
  const unit = (box[1] - box[0] + GRID.gutter * s) / 12;

  const lines = runs(profile(kind, width, box, "y", fg), box[2]);
  const sections = [];
  let prevEnd = null;
  for (const [a, b] of lines) {
    const gap = prevEnd === null ? Infinity : a - prevEnd;
    if (gap >= T.section) sections.push([[a, b]]);
    else if (gap >= T.group) sections.at(-1).push([a, b]);
    else sections.at(-1).at(-1)[1] = b;
    prevEnd = b;
  }

  return {
    sections: sections.map((groups) => ({
      groups: groups.map(([y0, y1]) => {
        const spans = merge(runs(profile(kind, width, [box[0], box[1], y0, y1], "x", fg), box[0]), T.col);
        const cols = spans.map(([x0, x1]) => {
          const area = [x0, x1, y0, y1];
          const panelPx = count(kind, width, area, (k) => k === "panel");
          const panel = panelPx > 0.4 * (x1 - x0) * (y1 - y0);
          const inner = panel ? bbox(kind, width, bbox(kind, width, area, fg), inPanel) : bbox(kind, width, area, fg);
          const leaves = inner ? readStack(kind, width, inner, panel ? inPanel : fg, T, s) : [];
          return { x0, x1, panel, leaves };
        });
        const starts = cols.map((c) => Math.max(0, Math.min(11, Math.round((c.x0 - box[0]) / unit))));
        return {
          cols: cols.map((c, i) => {
            const est = c.x1 - c.x0;
            const open = i === cols.length - 1; // only the next column's start bounds a column, so the last one is a guess
            const end = open ? Math.min(12, starts[i] + Math.round((est + GRID.gutter * s) / unit)) : starts[i + 1];
            const span = Math.max(1, end - starts[i]);
            return { span, panel: c.panel, slot: undefined, leaves: c.leaves.map(({ w, ...l }) => l),
              guess: open && { start: starts[i], min: span } };
          }),
        };
      }),
    })),
  };
}

function readStack(kind, width, [x0, x1, y0, y1], isFg, T, s) {
  const raw = runs(profile(kind, width, [x0, x1, y0, y1], "y", isFg), y0);
  return merge(raw, T.leaf).map(([a, b]) => {
    const [lx0, lx1] = bbox(kind, width, [x0, x1, a, b], isFg);
    const tally = {};
    for (let y = a; y < b; y++) for (let x = lx0; x < lx1; x++) {
      const k = kind[y * width + x];
      if (isFg(k)) tally[k] = (tally[k] ?? 0) + 1;
    }
    const k = Object.entries(tally).sort((p, q) => q[1] - p[1])[0][0];
    const w = lx1 - lx0, h = (b - a) / s;
    if (k === "heading") { // a long heading draws as several bars; the bar's thickness gives its level
      const [ra, rb] = raw.find(([ra, rb]) => ra >= a && rb <= b) ?? [a, b];
      const bh = (rb - ra) / s;
      return { kind: "heading", level: bh >= 34 ? 1 : bh >= 24 ? 2 : 3, w };
    }
    if (k === "text") return { kind: "text", lines: raw.filter(([ra, rb]) => ra >= a && rb <= b).length, w };
    if (k === "button") return { kind: "button", w };
    if (k === "panel") return { kind: "text", lines: 1, w }; // a stray panel-colored bar inside a panel: treat as text
    const r = w / (b - a);
    return { kind: "image", ratio: RATIOS.reduce((best, x) => (Math.abs(Math.log(ratioValue(x) / r)) < Math.abs(Math.log(ratioValue(best) / r)) ? x : best)), w };
  });
}

/** Whether each row ("y") or column ("x") of the area holds a pixel that passes test. */
function profile(kind, width, [x0, x1, y0, y1], axis, test) {
  const out = new Array(axis === "y" ? y1 - y0 : x1 - x0).fill(false);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (test(kind[y * width + x])) out[axis === "y" ? y - y0 : x - x0] = true;
  }
  return out;
}
/** [true, true, false, true] -> [[0, 2], [3, 4]] (half-open, offset added). */
function runs(flags, offset) {
  const out = [];
  flags.forEach((on, i) => {
    if (on && (i === 0 || !flags[i - 1])) out.push([i + offset, i + offset + 1]);
    else if (on) out.at(-1)[1] = i + offset + 1;
  });
  return out;
}
const merge = (rs, minGap) => rs.reduce((out, r) => {
  if (out.length && r[0] - out.at(-1)[1] < minGap) out.at(-1)[1] = r[1];
  else out.push([...r]);
  return out;
}, []);
function bbox(kind, width, [x0, x1, y0, y1], test) {
  let a = Infinity, b = -1, c = Infinity, d = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (test(kind[y * width + x])) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); }
  }
  return b < 0 ? null : [a, b + 1, c, d + 1];
}
function count(kind, width, [x0, x1, y0, y1], test) {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (test(kind[y * width + x])) n++;
  return n;
}

// ---------------------------------------------------------------- keeping slot names across an image edit

const leafSig = (l) => (l.kind === "heading" ? `h${l.level}` : l.kind);
const colSig = (c) => `${c.panel ? "panel:" : ""}${c.leaves.map(leafSig).join(",")}`;
const isRepeat = (g) => g.cols.length > 1 && g.cols.every((c) => colSig(c) === colSig(g.cols[0]));

/** Give a tree read from an image the slot names of the skeleton it replaces, matching blocks of the same
 *  shape in order. A row of identical columns keeps its slot whatever the column count. Returns the
 *  blocks that found no name. */
export function carrySlots(tree, old) {
  const queues = new Map();
  const add = (sig, slot) => queues.set(sig, [...(queues.get(sig) ?? []), slot]);
  const take = (sig) => queues.get(sig)?.shift();
  const sectionSig = (sec) => sec.groups.flatMap((g) => g.cols.flatMap((c) => c.leaves.map(leafSig))).join(",");
  for (const sec of old?.sections ?? []) {
    add(`section:${sectionSig(sec)}`, sec.slot);
    if (sec.slot) continue;
    for (const g of sec.groups) {
      if (isRepeat(g)) { add(`repeat:${colSig(g.cols[0])}`, g.cols[0].slot); if (g.cols[0].slot) continue; }
      for (const c of g.cols) {
        add(`col:${colSig(c)}`, c.slot);
        if (!c.slot) for (const l of c.leaves) add(`leaf:${leafSig(l)}`, l.slot);
      }
    }
  }
  const unnamed = [];
  // A slot section that rendered nothing on the measured page (an FAQ before any page has one) isn't drawn;
  // put it back where the skeleton had it.
  let j = 0;
  for (const sec of old?.sections ?? []) {
    if (j < tree.sections.length && sectionSig(tree.sections[j]) === sectionSig(sec)) j++;
    else if (sec.slot) tree.sections.splice(j++, 0, structuredClone(sec));
  }
  // A last column's span is read from how far its content reaches, which can fall short of the column (a short
  // heading, a ragged last line). Where the skeleton had the same column, keep its span if the content fits it.
  tree.sections.forEach((sec, si) => sec.groups.forEach((g, gi) => g.cols.forEach((c, ci) => {
    const was = old?.sections[si]?.groups[gi]?.cols[ci];
    if (c.guess && was && colSig(was) === colSig(c) && was.span >= c.guess.min && c.guess.start + was.span <= 12) c.span = was.span;
    delete c.guess;
  })));
  tree.sections.forEach((sec, si) => {
    sec.slot = take(`section:${sectionSig(sec)}`);
    if (sec.slot) return;
    for (const g of sec.groups) {
      if (isRepeat(g)) {
        const slot = take(`repeat:${colSig(g.cols[0])}`);
        if (slot) { for (const c of g.cols) c.slot = slot; continue; }
      }
      for (const c of g.cols) {
        c.slot = take(`col:${colSig(c)}`);
        if (c.slot) continue;
        for (const l of c.leaves) {
          l.slot = take(`leaf:${leafSig(l)}`);
          if (!l.slot) unnamed.push(`section ${si + 1}: ${leafSig(l)}${l.kind === "text" ? ` (${l.lines} lines)` : ""}`);
        }
      }
    }
  });
  return unnamed;
}

/** Whether two trees describe the same layout: same sections, rows, spans, panels, block kinds and slots.
 *  Text line counts and how many times a repeating row repeats don't count. */
export function sameShape(a, b) {
  const shape = (t) => t.sections.map((sec) => ({ slot: sec.slot, groups: sec.groups.map((g) => {
    const cols = g.cols.length > 1 && g.cols.every((c) => c.slot && c.slot === g.cols[0].slot && colSig(c) === colSig(g.cols[0])) ? [g.cols[0]] : g.cols;
    return cols.map((c) => ({ span: c.span, panel: c.panel, slot: c.slot,
      leaves: c.leaves.map((l) => ({ kind: leafSig(l), ratio: l.ratio, slot: l.slot })) }));
  }) }));
  return JSON.stringify(shape(a)) === JSON.stringify(shape(b));
}

// ---------------------------------------------------------------- tree -> Eleventy layout

/** Tree -> the Liquid layout _layouts/<name>.html. Rows become a 12-column CSS grid with the skeleton's spans.
 *  markers: true wraps each filled block in <!--wf:id--> comments so scripts/wireframe.mjs can measure it. */
export function toLayout(tree, name, { markers = false } = {}) {
  const out = ["---", "layout: default", "---",
    `{% comment %}Built from _archetypes/${name}.html. Edit that skeleton or its wireframe image, not this file.{% endcomment %}`,
    `<article class="wf wf-${name}">`];
  const params = (x, span) => {
    const leaves = x.leaves ?? (x.kind ? [x] : []);
    const h = leaves.find((l) => l.kind === "heading"), img = leaves.find((l) => l.kind === "image");
    return [span && `span=${span}`, h && `level=${h.level}`, img && `ratio="${img.ratio.replace(":", "x")}"`].filter(Boolean).map((p) => " " + p).join("");
  };
  const include = (id, slot, p = "") => {
    const inc = `{% include slots/${slot}.html${p} %}`;
    return markers ? `<!--wf:${id}-->${inc}<!--/wf:${id}-->` : inc;
  };
  const leaf = (id, l) => (l.slot ? include(id, l.slot, params(l)) : `<p class="placeholder">[Placeholder: ${leafSig(l)} block, no data-slot]</p>`);
  tree.sections.forEach((sec, si) => {
    if (sec.slot) { out.push(include(ids.section(si), sec.slot)); return; }
    out.push(`<section class="wf-section">`);
    sec.groups.forEach((g, gi) => {
      if (isRepeat(g) && g.cols[0].slot && g.cols.every((c) => c.slot === g.cols[0].slot)) {
        out.push(include(ids.repeat(si, gi), g.cols[0].slot, params(g.cols[0], g.cols[0].span))); // the slot repeats the column itself
        return;
      }
      const [c] = g.cols;
      if (g.cols.length === 1 && c.span === 12 && !c.panel && !c.slot) {
        out.push(`<div class="wf-stack">`, ...c.leaves.map((l, li) => leaf(ids.leaf(si, gi, 0, li), l)), `</div>`);
        return;
      }
      out.push(`<div class="wf-row">`);
      g.cols.forEach((col, ci) => {
        out.push(`<div class="wf-col span-${col.span}${col.panel && !col.slot ? " wf-panel" : ""}">`);
        out.push(...(col.slot ? [include(ids.col(si, gi, ci), col.slot, params(col))] : col.leaves.map((l, li) => leaf(ids.leaf(si, gi, ci, li), l))));
        out.push(`</div>`);
      });
      out.push(`</div>`);
    });
    out.push(`</section>`);
  });
  out.push(`</article>`);
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------- PNG

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

/** 8-bit grayscale PNG. */
export function encodePng({ width, height, gray }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(gray.buffer, gray.byteOffset + y * width, width).copy(raw, y * (width + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/** Any 8-bit, non-interlaced PNG (gray, RGB, palette, with or without alpha) -> grayscale over white. */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG file");
  let width, height, depth, type, interlace, palette;
  const idat = [];
  for (let i = 8; i < buf.length;) {
    const len = buf.readUInt32BE(i), name = buf.toString("latin1", i + 4, i + 8), data = buf.subarray(i + 8, i + 8 + len);
    if (name === "IHDR") [width, height, depth, type, interlace] = [data.readUInt32BE(0), data.readUInt32BE(4), data[8], data[9], data[12]];
    else if (name === "PLTE") palette = data;
    else if (name === "IDAT") idat.push(data);
    else if (name === "IEND") break;
    i += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (depth !== 8 || interlace || !channels) throw new Error("PNG must be 8-bit and not interlaced; re-export it as a plain 8-bit PNG");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[dst + x - channels] : 0, b = y ? px[dst - stride + x] : 0;
      const c = x >= channels && y ? px[dst - stride + x - channels] : 0;
      const pred = [0, a, b, (a + b) >> 1, (() => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })()][filter];
      px[dst + x] = (raw[src + x] + pred) & 255;
    }
  }
  const gray = new Uint8Array(width * height);
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  for (let i = 0; i < width * height; i++) {
    const p = i * channels;
    let v, alpha = 255;
    if (type === 0) v = px[p];
    else if (type === 4) [v, alpha] = [px[p], px[p + 1]];
    else if (type === 3) v = lum(palette[px[p] * 3], palette[px[p] * 3 + 1], palette[px[p] * 3 + 2]);
    else { v = lum(px[p], px[p + 1], px[p + 2]); if (type === 6) alpha = px[p + 3]; }
    gray[i] = Math.round((v * alpha + 255 * (255 - alpha)) / 255);
  }
  return { width, height, gray };
}
