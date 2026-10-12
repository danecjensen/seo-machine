// Per-site designs from Claude Design. scripts/design.mjs turns an export (tokens, CSS or a
// standalone HTML page) into sites/<domain>/_design/tokens.css; these helpers do the parsing.
// The theme reads a handful of custom properties (--brand, --ink, --bg ...); an import keeps the
// design's own tokens and points the theme's at them, so the shared layouts take on the design.

/** The theme's custom properties, and the token names a design system commonly uses for each. */
export const THEME_TOKENS = {
  brand: ["brand", "primary", "brand-primary", "accent", "primary-500", "brand-500"],
  "brand-ink": ["brand-ink", "on-primary", "primary-foreground", "primary-contrast", "on-brand", "brand-foreground", "on-accent"],
  ink: ["ink", "text", "foreground", "fg", "text-primary", "on-background", "on-surface", "body"],
  muted: ["muted-foreground", "text-muted", "text-secondary", "text-subtle", "muted-text", "fg-muted", "ink-muted"],
  bg: ["bg", "background", "surface", "page", "body-bg", "canvas"],
  soft: ["soft", "surface-muted", "bg-muted", "background-muted", "surface-alt", "bg-subtle", "surface-2", "muted", "secondary"],
  line: ["line", "border", "divider", "outline", "border-color", "stroke"],
  radius: ["radius", "radius-md", "border-radius", "rounded", "radius-base", "radius-default"],
  font: ["font", "font-body", "font-sans", "font-family", "font-base", "font-text", "body-font"],
  "font-heading": ["font-heading", "font-display", "heading-font", "display-font", "font-headline", "font-title"],
};

const PREFIXES = /^(colors?|clr|c|theme|ds|sys|ref)-/;
const norm = (name) => name.replace(/^--/, "").toLowerCase().replace(/_/g, "-").replace(PREFIXES, "");

/** Split CSS into top-level statements: { type: "rule" | "at", prelude, body } with comments removed. */
export function parseCss(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  let i = 0;
  while (i < src.length) {
    let j = i;
    let quote = null;
    while (j < src.length) {
      const ch = src[j];
      if (quote) { if (ch === "\\") j++; else if (ch === quote) quote = null; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "{" || ch === ";") break;
      j++;
    }
    const prelude = src.slice(i, j).trim();
    if (j >= src.length) break;
    if (src[j] === ";") { // @import, @charset
      if (prelude) out.push({ type: "at", prelude, body: null });
      i = j + 1;
      continue;
    }
    let depth = 1;
    let k = j + 1;
    quote = null;
    while (k < src.length && depth) {
      const ch = src[k];
      if (quote) { if (ch === "\\") k++; else if (ch === quote) quote = null; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      k++;
    }
    out.push({ type: prelude.startsWith("@") ? "at" : "rule", prelude, body: src.slice(j + 1, k - 1) });
    i = k;
  }
  return out;
}

/** Declarations in a block, in order: [[prop, value], ...]. */
export function declarations(body) {
  const out = [];
  let buf = "";
  let depth = 0;
  let quote = null;
  for (let i = 0; i <= body.length; i++) {
    const ch = body[i];
    if (ch === undefined || (ch === ";" && !depth && !quote)) {
      const at = buf.indexOf(":");
      if (at > 0) out.push([buf.slice(0, at).trim(), buf.slice(at + 1).trim()]);
      buf = "";
      continue;
    }
    if (quote) { if (ch === quote) quote = null; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    buf += ch;
  }
  return out;
}

const ROOTISH = /^(:root|html|:host)$/;

/** Custom properties set on :root/html at the top level (later wins), plus @font-face and @import rules. */
export function readCss(css) {
  const vars = new Map();
  const fontFaces = [];
  const imports = [];
  for (const s of parseCss(css)) {
    if (s.type === "rule" && s.prelude.split(",").some((sel) => ROOTISH.test(sel.trim()))) {
      for (const [p, v] of declarations(s.body)) if (p.startsWith("--")) vars.set(p, v);
    } else if (s.type === "at" && /^@font-face$/i.test(s.prelude)) {
      fontFaces.push(declarations(s.body));
    } else if (s.type === "at" && /^@import\b/i.test(s.prelude)) {
      const m = s.prelude.match(/@import\s+(?:url\()?\s*["']?([^"')\s]+)/i);
      if (m) imports.push(m[1]);
    }
  }
  return { vars, fontFaces, imports };
}

/** W3C design tokens ({ color: { primary: { $value } } }) or a flat map -> Map("--color-primary" -> value). */
export function readTokensJson(json) {
  const vars = new Map();
  const walk = (node, trail) => {
    if (node === null || typeof node !== "object") {
      if (trail.length && (typeof node === "string" || typeof node === "number")) vars.set(`--${trail.join("-")}`, String(node));
      return;
    }
    if ("$value" in node || "value" in node) {
      const v = node.$value ?? node.value;
      if (typeof v === "string" || typeof v === "number") vars.set(`--${trail.join("-")}`, String(v));
      else if (Array.isArray(v) && v.every((x) => typeof x === "string")) vars.set(`--${trail.join("-")}`, v.map(fontName).join(", "));
      return;
    }
    for (const [k, v] of Object.entries(node)) if (!k.startsWith("$")) walk(v, [...trail, k.toLowerCase().replace(/[^a-z0-9-]+/g, "-")]);
  };
  walk(json, []);
  // {color.primary} references -> var(--color-primary)
  for (const [k, v] of vars) vars.set(k, v.replace(/\{([^}]+)\}/g, (_, ref) => `var(--${ref.toLowerCase().replace(/\./g, "-")})`));
  return vars;
}

const fontName = (f) => (/^[\w-]+$/.test(f) ? f : `"${f.replace(/"/g, "")}"`);

// shadcn-style "222 47% 11%" channels are only a color inside hsl().
const HSL_CHANNELS = /^-?[\d.]+(deg)?\s+[\d.]+%\s+[\d.]+%(\s*\/\s*[\d.]+%?)?$/;

/**
 * Point each theme token at the design's matching token: { vars, mapped: { brand: "var(--primary)" } }.
 * A design token with a theme token's name but another meaning (shadcn's --muted is a background,
 * the theme's is text) is renamed to --ds-<name> so the two don't collide.
 */
export function mapTheme(designVars) {
  let vars = new Map(designVars);
  const find = (names, skip) => {
    const byNorm = new Map();
    for (const name of vars.keys()) if (name !== skip && !byNorm.has(norm(name))) byNorm.set(norm(name), name);
    return names.map((n) => byNorm.get(n)).find(Boolean);
  };
  for (const [theme, names] of Object.entries(THEME_TOKENS)) {
    const own = `--${theme}`;
    const usedElsewhere = Object.entries(THEME_TOKENS).some(([t, n]) => t !== theme && n.includes(theme));
    if (!vars.has(own) || !usedElsewhere || !find(names, own)) continue;
    const renamed = `--ds-${theme}`;
    const ref = new RegExp(`var\\(${own}(?=[\\s,)])`, "g");
    vars = new Map([...vars].map(([k, v]) => [k === own ? renamed : k, v.replace(ref, `var(${renamed}`)]));
  }
  const mapped = {};
  for (const [theme, names] of Object.entries(THEME_TOKENS)) {
    if (vars.has(`--${theme}`)) continue; // the design already sets the theme's own name
    const hit = find(names);
    if (hit) mapped[theme] = HSL_CHANNELS.test(vars.get(hit)) ? `hsl(var(${hit}))` : `var(${hit})`;
  }
  return { vars, mapped };
}

/** Follow var() references until a literal value, or undefined. */
export function resolve(value, vars, seen = new Set()) {
  if (value === undefined) return undefined;
  const v = value.trim();
  const m = v.match(/^(hsl\()?var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)\)?$/);
  if (!m) return v;
  if (seen.has(m[2])) return undefined;
  seen.add(m[2]);
  const inner = resolve(vars.get(m[2]) ?? m[3], vars, seen);
  return m[1] && inner ? `hsl(${inner})` : inner;
}

/** [r, g, b] (0-255) for hex, rgb() and hsl() colors; null for anything else. */
export function parseColor(value) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (m) return m.slice(1, 4).map(Number);
  m = v.match(/^hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (m) {
    const [h, s, l] = [Number(m[1]) / 360, Number(m[2]) / 100, Number(m[3]) / 100];
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  }
  if (v === "white") return [255, 255, 255];
  if (v === "black") return [0, 0, 0];
  return null;
}

export function contrast(a, b) {
  const lum = ([r, g, b]) => {
    const c = [r, g, b].map((x) => (x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text/background pairs the theme draws; Lighthouse's accessibility score needs 4.5:1 for each.
const PAIRS = [["ink", "bg"], ["muted", "bg"], ["brand", "bg"], ["brand-ink", "brand"], ["ink", "soft"]];
const DEFAULTS = { brand: "#1d4ed8", "brand-ink": "#ffffff", ink: "#111827", muted: "#4b5563", bg: "#ffffff", soft: "#f3f4f6" };

/** Color pairs under 4.5:1 once the design is applied: [{ fg, bg, ratio }]. */
export function contrastIssues(vars, mapped) {
  const all = new Map(vars);
  for (const [k, v] of Object.entries(mapped)) all.set(`--${k}`, v);
  const color = (t) => parseColor(resolve(all.get(`--${t}`) ?? DEFAULTS[t], all));
  const out = [];
  for (const [fg, bg] of PAIRS) {
    const [a, b] = [color(fg), color(bg)];
    if (!a || !b) continue;
    const ratio = contrast(a, b);
    if (ratio < 4.5) out.push({ fg, bg, ratio: Math.round(ratio * 100) / 100 });
  }
  return out;
}

/** The generated tokens.css: font faces, the design's tokens, then the theme's tokens pointed at them. */
export function tokensCss({ vars, mapped, fontFaces = [], source, date }) {
  const lines = [
    `/* Generated by \`npm run design\` from ${source} on ${date}.`,
    "   Re-run the import to change it; hand-written styles go in site.css next to this file. */",
  ];
  for (const decls of fontFaces) lines.push(`@font-face { ${decls.map(([p, v]) => `${p}: ${v};`).join(" ")} }`);
  lines.push(":root {");
  for (const [k, v] of vars) lines.push(`  ${k}: ${v};`);
  if (Object.keys(mapped).length) lines.push("  /* theme tokens -> design tokens */");
  for (const [k, v] of Object.entries(mapped)) lines.push(`  --${k}: ${v};`);
  lines.push("}");
  return lines.join("\n") + "\n";
}

/** CSS that is safe to put inside an inline <style>. */
export const inlineSafe = (css) => css.replace(/<\/(style)/gi, "<\\/$1");
