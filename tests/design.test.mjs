// A Claude Design export restyles one site, and only that site.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { contrastIssues, mapTheme, readCss, readTokensJson } from "../lib/design.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

test("shadcn-style tokens map onto the theme without colliding", () => {
  const { vars } = readCss(`:root{--primary:24 95% 37%;--primary-foreground:0 0% 100%;--foreground:#1c1917;
    --background:#fff;--muted:#f5ede3;--muted-foreground:#57534e;--border:#e7dccd;--font-display:"Fraunces",serif}`);
  const { vars: out, mapped } = mapTheme(vars);
  assert.equal(mapped.brand, "hsl(var(--primary))");
  assert.equal(mapped.ink, "var(--foreground)");
  assert.equal(mapped.muted, "var(--muted-foreground)");
  assert.equal(mapped.soft, "var(--ds-muted)");
  assert.equal(out.get("--ds-muted"), "#f5ede3");
  assert.equal(mapped["font-heading"], "var(--font-display)");
  assert.deepEqual(contrastIssues(out, mapped), []);
});

test("W3C design tokens json flattens to custom properties", () => {
  const vars = readTokensJson({ color: { brand: { $value: "#0a7" }, text: { $value: "{color.ink}" }, ink: { $value: "#111" } } });
  assert.equal(vars.get("--color-brand"), "#0a7");
  assert.equal(vars.get("--color-text"), "var(--color-ink)");
  assert.equal(mapTheme(vars).mapped.brand, "var(--color-brand)");
});

test("low contrast is reported", () => {
  const { vars, mapped } = mapTheme(new Map([["--primary", "#fde68a"]]));
  assert.deepEqual(contrastIssues(vars, mapped).map((i) => `${i.fg}/${i.bg}`), ["brand/bg", "brand-ink/brand"]);
});

test("an imported design reaches only its own site", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seo-machine-design-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const item of ["package.json", "scripts", "sites", "lib", "theme"]) fs.cpSync(path.join(ROOT, item), path.join(dir, item), { recursive: true });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
  const exp = path.join(dir, "export");
  fs.mkdirSync(path.join(exp, "fonts"), { recursive: true });
  fs.writeFileSync(path.join(exp, "fonts", "Brand.woff2"), "wOF2");
  fs.writeFileSync(path.join(exp, "page.html"), `<style>:root{--color-primary:#0f766e;--radius:4px}
    @font-face{font-family:Brand;src:url(fonts/Brand.woff2) format("woff2")}</style>`);

  const run = (script, ...args) => spawnSync("node", [`scripts/${script}.mjs`, ...args], { cwd: dir, encoding: "utf8" });
  const imported = run("design", "--site", "plumbing.example", "--from", exp);
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(run("build").status, 0);

  const page = (d) => fs.readFileSync(path.join(dir, "dist", d, "index.html"), "utf8");
  assert.match(page("plumbing.example"), /--brand:var\(--color-primary\)/);
  assert.match(page("plumbing.example"), /font-display:swap/);
  assert.ok(fs.existsSync(path.join(dir, "dist/plumbing.example/assets/fonts/Brand.woff2")));
  assert.ok(!fs.existsSync(path.join(dir, "dist/plumbing.example/_design")));
  assert.doesNotMatch(page("ledger.example"), /color-primary/);
});
