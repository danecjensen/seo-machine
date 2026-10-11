// Small HTML/CSS helpers: minify, image dimensions, table of contents.
import fs from "node:fs";
import path from "node:path";

export function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}

export function minifyHtml(html) {
  const parts = html.split(/(<pre\b[\s\S]*?<\/pre>|<textarea\b[\s\S]*?<\/textarea>)/i);
  return parts
    .map((p, i) => (i % 2 ? p : p.replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{2,}/g, "\n")))
    .join("")
    .trim() + "\n";
}

/** Width and height for PNG, GIF, JPEG and SVG, so every <img> reserves its space (no layout shift). */
export function imageSize(file) {
  let data;
  try {
    data = fs.readFileSync(file);
  } catch {
    return null;
  }
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
  }
  if (/^GIF8[79]a/.test(data.subarray(0, 6).toString("latin1"))) return [data.readUInt16LE(6), data.readUInt16LE(8)];
  if (data[0] === 0xff && data[1] === 0xd8) {
    for (let i = 2; i < data.length - 9;) {
      if (data[i] !== 0xff) { i++; continue; }
      const marker = data[i + 1];
      if (marker >= 0xc0 && marker <= 0xc2) return [data.readUInt16BE(i + 7), data.readUInt16BE(i + 5)];
      i += 2 + data.readUInt16BE(i + 2);
    }
    return null;
  }
  if (path.extname(file) === ".svg") {
    const text = data.subarray(0, 2000).toString("utf8");
    const w = text.match(/\bwidth="([\d.]+)/), h = text.match(/\bheight="([\d.]+)/);
    if (w && h) return [Math.round(+w[1]), Math.round(+h[1])];
    const vb = text.match(/viewBox="[\d.-]+[ ,]+[\d.-]+[ ,]+([\d.]+)[ ,]+([\d.]+)/);
    if (vb) return [Math.round(+vb[1]), Math.round(+vb[2])];
  }
  return null;
}

/** Lazy-load images, fill in missing width/height from the file in the site folder. */
export function polishImages(html, inputDir) {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const has = (a) => new RegExp(`\\s${a}=`, "i").test(tag);
    const src = tag.match(/\ssrc="([^"]+)"/i)?.[1] ?? "";
    const extra = [];
    if (src.startsWith("/") && !(has("width") && has("height"))) {
      const size = imageSize(path.join(inputDir, decodeURI(src)));
      if (size) extra.push(`width="${size[0]}" height="${size[1]}"`);
    }
    if (!has("loading") && !has("fetchpriority")) extra.push('loading="lazy"');
    if (!has("decoding")) extra.push('decoding="async"');
    return extra.length ? tag.replace(/\s*\/?>$/, ` ${extra.join(" ")}>`) : tag;
  });
}

/** <h2 id="..."> headings of rendered content, for a table of contents. */
export const headings = (html) =>
  [...html.matchAll(/<h2[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => ({
    slug: m[1],
    text: m[2].replace(/<[^>]+>/g, "").trim(),
  }));
