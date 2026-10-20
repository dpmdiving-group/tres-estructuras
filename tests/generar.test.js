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
  fs.cpSync(path.join(ROOT, "admin"), path.join(dir, "admin"), { recursive: true });
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

test("on Netlify the panel gets a version stamp from its own files; publishing properties doesn't change it", function () {
  const dir = copySite(FIXTURE);
  const sello = () => (fs.readFileSync(path.join(dir, "admin/index.html"), "utf8").match(/<meta name="te-panel" content="([^"]*)">/) || [])[1];
  const publicado = () => JSON.parse(fs.readFileSync(path.join(dir, "admin/version.json"), "utf8")).panel;
  try {
    run(dir);
    assert.equal(sello(), "", "a local run leaves the panel alone");
    assert.ok(!fs.existsSync(path.join(dir, "admin/version.json")));

    run(dir, { COMMIT_REF: "abcdef0123456789abcdef" });
    const primero = sello();
    assert.match(primero, /^[0-9a-f]{12}$/);
    assert.equal(publicado(), primero);

    // Same panel, new properties and a new commit (a publish): same version
    fs.writeFileSync(path.join(dir, "data/propiedades.json"), JSON.stringify(FIXTURE.slice(1)));
    run(dir, { COMMIT_REF: "1111111111111111" });
    assert.equal(sello(), primero, "a publish must not ask open panels to reload");
    assert.equal(publicado(), primero);

    // A change in the panel's code: new version
    fs.appendFileSync(path.join(dir, "admin/cobros.js"), "\n// cambio\n");
    run(dir, { COMMIT_REF: "2222222222222222" });
    assert.notEqual(sello(), primero);
    assert.equal(publicado(), sello());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a property for rent and for sale gets both in its title and both offers in its data", function () {
  const props = FIXTURE.map((p) => (p.codigo === "QLM-002" ? Object.assign({}, p, { operacion: "alquiler", precio: 520000, moneda: "ARS", tambien: { precio: 85000, moneda: "USD" } }) : p));
  const dir = copySite(props);
  try {
    run(dir);
    const html = fs.readFileSync(path.join(dir, "fichas/qlm-002/index.html"), "utf8");
    assert.match(html, /<title>[^<]* — Alquiler \$ 520\.000 · Venta USD 85\.000 \| Tres Estructuras<\/title>/);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)[1]);
    assert.ok(Array.isArray(ld.offers) && ld.offers.length === 2, JSON.stringify(ld.offers));
    assert.deepEqual(ld.offers.map((o) => [o.price, o.priceCurrency, o.businessFunction.split("#")[1]]), [[520000, "ARS", "LeaseOut"], [85000, "USD", "Sell"]]);
    // The others are as before: one offer, one operation in the title
    const otra = fs.readFileSync(path.join(dir, "fichas/qlm-001/index.html"), "utf8");
    assert.ok(!/ · (Venta|Alquiler) /.test(otra.match(/<title>[^<]*<\/title>/)[0]));
    assert.ok(!Array.isArray(JSON.parse(otra.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)[1]).offers));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
