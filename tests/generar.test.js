/* Tests for herramientas/generar.js, run on a throwaway copy of the files
   it reads and writes. Run: node --test tests/ */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, "e2e", "fixtures", "propiedades.json"), "utf8"));

function copySite(props) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "te-generar-"));
  for (const f of ["herramientas/generar.js", "propiedad.html", "js/config.js", "sw.js"]) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  fs.mkdirSync(path.join(dir, "data"));
  fs.writeFileSync(path.join(dir, "data/propiedades.json"), JSON.stringify(props));
  return dir;
}

function run(dir, env) {
  const clean = Object.assign({}, process.env);
  delete clean.COMMIT_REF;
  return execFileSync(process.execPath, [path.join(dir, "herramientas/generar.js")], { env: Object.assign(clean, env || {}), encoding: "utf8" });
}

test("every property gets its page, and each old code gets the same page with the new code as canonical", function () {
  const props = FIXTURE.map((p) => (p.codigo === "LAN-001" ? Object.assign({}, p, { codigo: "LAN-002", codigosAnteriores: ["LAN-001"] }) : p));
  const dir = copySite(props);
  try {
    run(dir);
    for (const p of props) assert.ok(fs.existsSync(path.join(dir, "fichas", p.codigo.toLowerCase(), "index.html")), p.codigo);
    const old = fs.readFileSync(path.join(dir, "fichas/lan-001/index.html"), "utf8");
    assert.match(old, /window\.__FICHA_CODIGO__ = "LAN-002"/);
    assert.match(old, /rel="canonical" href="https:\/\/tresestructuras\.com\/p\/LAN-002"/);
    const sitemap = fs.readFileSync(path.join(dir, "sitemap.xml"), "utf8");
    assert.ok(sitemap.includes("/p/LAN-002") && !sitemap.includes("/p/LAN-001"), "the sitemap lists only current codes");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an old code never replaces the page of a current code", function () {
  const props = FIXTURE.map((p) => (p.codigo === "QLM-002" ? Object.assign({}, p, { codigosAnteriores: ["QLM-001"] }) : p));
  const dir = copySite(props);
  try {
    run(dir);
    assert.match(fs.readFileSync(path.join(dir, "fichas/qlm-001/index.html"), "utf8"), /__FICHA_CODIGO__ = "QLM-001"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("on Netlify the service worker VERSION becomes the deployed commit; a local run leaves it alone", function () {
  const dir = copySite(FIXTURE);
  try {
    const before = fs.readFileSync(path.join(dir, "sw.js"), "utf8");
    run(dir);
    assert.equal(fs.readFileSync(path.join(dir, "sw.js"), "utf8"), before);
    run(dir, { COMMIT_REF: "abcdef0123456789abcdef" });
    assert.match(fs.readFileSync(path.join(dir, "sw.js"), "utf8"), /var VERSION = "te-abcdef012345";/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
