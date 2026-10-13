// Measures a built page in a headless browser so its wireframe takes the page's real proportions: how long each
// heading is, how many lines each text block wraps to, each image's shape and each button's width, plus the
// site's header and footer. scripts/wireframe.mjs builds the site with <!--wf:id--> markers around every
// filled block (see toLayout in lib/wireframe.mjs), serves it, and calls measurePage for each archetype.
import fs from "node:fs";

/** A Chrome or Chromium to drive: CHROME_PATH, Playwright's own download, or a system install. */
export async function findBrowser() {
  const { chromium } = await import("playwright-core");
  const candidates = [process.env.CHROME_PATH, chromium.executablePath(), "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  return candidates.find((p) => { try { return p && fs.statSync(p).isFile(); } catch { return false; } }) ?? null;
}

export async function openBrowser() {
  const executablePath = await findBrowser();
  if (!executablePath) throw new Error("no Chrome or Chromium found; set CHROME_PATH, or use --plain for a wireframe drawn from the skeleton alone");
  const { chromium } = await import("playwright-core");
  return chromium.launch({ executablePath });
}

/** -> { measured: Map(id -> { width, blocks } | { items: [{ width, blocks }] }), chrome: { header, footer } } */
export async function measurePage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    const res = await page.goto(url);
    if (!res?.ok()) throw new Error(`${url} returned ${res?.status()}`);
    const { blocks, chrome } = await page.evaluate(inPage);
    return { measured: new Map(Object.entries(blocks)), chrome };
  } finally {
    await page.close();
  }
}

// Runs in the page. Everything it needs is defined inside it.
function inPage() {
  const visible = (el) => { const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden"; };
  /** The lines of text in an element: one box per line, however many inline elements the line spans. */
  const linesOf = (root) => {
    const rects = [];
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      if (!tw.currentNode.data.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(tw.currentNode);
      for (const x of r.getClientRects()) if (x.width > 1) rects.push(x);
    }
    const lines = [];
    for (const r of rects.sort((a, b) => a.top - b.top || a.left - b.left)) {
      const mid = (r.top + r.bottom) / 2;
      const line = lines.find((l) => mid > l.top && mid < l.bottom);
      if (line) { line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right); }
      else lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    }
    return lines.map(({ top, left, right }) => ({ top: top + scrollY, left, right }));
  };
  /** The blocks inside some nodes, in reading order, as wireframe kinds. */
  const blocksIn = (nodes) => {
    const out = [];
    const visit = (el) => {
      if (el.nodeType !== 1 || !visible(el)) return;
      const r = el.getBoundingClientRect();
      if (el.matches("figure, img, picture, video, .media")) return out.push({ kind: "image", w: r.width, h: r.height });
      if (el.matches(".btn, button, input[type=submit]")) return out.push({ kind: "button", w: r.width });
      if (el.matches("h1, h2, h3, h4, h5, h6, .cta-title")) return out.push({ kind: "heading", lines: linesOf(el) });
      if (el.matches("p, li, summary, dt, dd, td, th, blockquote, label") && !el.querySelector("p, li, figure, .btn, h1, h2, h3, h4, ul, ol, table, details")) {
        const lines = linesOf(el);
        return lines.length && out.push({ kind: "text", lines });
      }
      for (const c of el.children) visit(c);
    };
    nodes.forEach(visit);
    return out;
  };

  // Every <!--wf:id--> ... <!--/wf:id--> pair, and the elements between them.
  const marks = {};
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
  while (tw.nextNode()) {
    const m = tw.currentNode.data.match(/^(\/?)wf:(.+)$/);
    if (m) (marks[m[2]] ??= {})[m[1] ? "end" : "start"] = tw.currentNode;
  }
  const blocks = {};
  for (const [id, { start, end }] of Object.entries(marks)) {
    if (!start || !end) continue;
    const els = [];
    for (let n = start.nextSibling; n && n !== end; n = n.nextSibling) if (n.nodeType === 1) els.push(n);
    const width = start.parentElement.getBoundingClientRect().width;
    if (id.endsWith(".r")) { // a repeating row: one item per child of the list the slot output
      const items = [...(els[0]?.children ?? [])].filter(visible);
      blocks[id] = { items: items.map((li) => ({ width: li.getBoundingClientRect().width, blocks: blocksIn([li]) })) };
    } else blocks[id] = { width, blocks: blocksIn(els) };
  }

  // The header (with breadcrumbs) and footer, as bands with their blocks at their positions.
  const main = document.querySelector("main");
  const mainBox = main.getBoundingClientRect(), cs = getComputedStyle(main);
  const left = mainBox.left + parseFloat(cs.paddingLeft), contentWidth = mainBox.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const band = (els, top, bottom) => {
    const parts = [];
    for (const el of els) {
      for (const b of blocksIn([el])) {
        if (b.kind === "heading" || b.kind === "text") {
          for (const l of b.lines) parts.push({ kind: b.kind, left: l.left, top: l.top + (b.kind === "heading" ? 4 : 6), width: l.right - l.left, height: b.kind === "heading" ? 14 : 8 });
        }
      }
      for (const a of el.querySelectorAll(".brand")) for (const l of linesOf(a)) parts.push({ kind: "heading", left: l.left, top: l.top + 4, width: l.right - l.left, height: 14 });
      for (const a of el.querySelectorAll("nav a:not(.btn), .crumbs li")) for (const l of linesOf(a)) parts.push({ kind: "text", left: l.left, top: l.top + 6, width: l.right - l.left, height: 8 });
      for (const b of el.querySelectorAll(".btn")) { const r = b.getBoundingClientRect(); parts.push({ kind: "button", left: r.left, top: r.top + scrollY, width: r.width, height: r.height }); }
    }
    const seen = new Set();
    return { left, top, contentWidth, height: bottom - top,
      blocks: parts.filter((p) => { const k = `${Math.round(p.left)},${Math.round(p.top)}`; return !seen.has(k) && seen.add(k); }) };
  };
  const header = document.querySelector(".site-header"), crumbs = document.querySelector(".crumbs"), footer = document.querySelector(".site-footer");
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY }; };
  const chrome = {};
  if (header) {
    const els = [header, crumbs].filter(Boolean);
    chrome.header = band(els, 0, Math.max(...els.map((e) => box(e).bottom)) + 16);
  }
  if (footer) { const b = box(footer); chrome.footer = band([footer], b.top, b.bottom); }
  return { blocks, chrome };
}
