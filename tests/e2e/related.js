/* "Otras propiedades" on the property page: same building first, then the
   same neighbourhood, then the zone; and grouping a building from the panel.
   Run: node tests/e2e/related.js */

"use strict";

const { launch, startSite, phone, checker, FIXTURE } = require("./lib");

const t = checker("Related properties");
const expect = t.expect;

// Quilmes listings: same neighbourhood written differently, a building group,
// a reserved one and a sale, so every rule shows
const prop = (codigo, extra) => Object.assign({}, FIXTURE.find((p) => p.codigo === "QLM-002"), { codigo: codigo }, extra);
const LISTA = [
  prop("QLM-010", { barrio: "Quilmes Oeste", titulo: "Oeste alquiler" }),
  prop("QLM-011", { barrio: "Quilmes centro.", titulo: "Centro venta", operacion: "venta" }),
  prop("QLM-012", { barrio: "Quilmes Centro", titulo: "Centro reservada", estado: "reservada" }),
  prop("QLM-013", { barrio: "Quilmes Oeste", titulo: "Mismo edificio", edificio: "QLM-020" }),
  prop("QLM-014", { barrio: "Quilmes Centro", titulo: "Centro alquiler" }),
  prop("QLM-015", { barrio: "Quilmes Centro", titulo: "Cerrada", estado: "cerrada" }),
  prop("QLM-020", { barrio: "Quilmes Centro", titulo: "La escaneada", edificio: "QLM-020", estado: "reservada" }),
  FIXTURE.find((p) => p.codigo === "BER-001")
];

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const v = await phone(browser, site, { name: "visitor", path: null });
  await v.ctx.route("**/data/propiedades.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(LISTA) }));
  const tarjetas = () => v.$$eval("#relacionadas-grilla .ficha__codigo", (els) => els.map((e) => e.textContent));

  await t.check("same building first, then the same neighbourhood (any spelling), same operation and available first", async () => {
    await v.goto(site.base + "/propiedad.html?c=QLM-020&f=cartel");
    await v.waitForSelector("#sec-relacionadas:not([hidden])");
    const c = await tarjetas();
    expect(JSON.stringify(c) === '["QLM-013","QLM-014","QLM-012"]', c.join(","));
    expect((await v.textContent("#relacionadas-titulo")) === "En el mismo edificio y en Quilmes Centro", await v.textContent("#relacionadas-titulo"));
  });

  await t.check("without a building, the neighbourhood comes first and names the section", async () => {
    await v.goto(site.base + "/propiedad.html?c=QLM-014");
    await v.waitForSelector("#sec-relacionadas:not([hidden])");
    const c = await tarjetas();
    // Rentals first for a rental (the sale goes last); same status keeps the site's order
    expect(JSON.stringify(c) === '["QLM-012","QLM-020","QLM-011"]', c.join(","));
    expect((await v.textContent("#relacionadas-titulo")) === "Otras propiedades en Quilmes Centro", await v.textContent("#relacionadas-titulo"));
  });

  await t.check("a building with nothing else in the neighbourhood says 'y cerca'", async () => {
    await v.goto(site.base + "/propiedad.html?c=QLM-013");
    await v.waitForSelector("#sec-relacionadas:not([hidden])");
    const c = await tarjetas();
    expect(c[0] === "QLM-020" && c[1] === "QLM-010", c.join(","));
    expect((await v.textContent("#relacionadas-titulo")) === "En el mismo edificio y cerca", await v.textContent("#relacionadas-titulo"));
  });

  await t.check("closed ones never show", async () => {
    await v.goto(site.base + "/propiedad.html?c=QLM-010");
    await v.waitForSelector("#sec-relacionadas:not([hidden])");
    expect(!(await tarjetas()).includes("QLM-015"), "closed shown");
    expect(!v.errors.length, v.errors.join(" | "));
  });

  await t.check("the panel groups a building, and the property page then shows them together", async () => {
    const A = await phone(browser, site, { name: "A" });
    await A.click("#lista button[data-accion='editar'][data-codigo='QLM-003']");
    await A.selectOption("#f-edificio", "QLM-001");
    await A.click("#btn-guardar");
    await A.waitForSelector("#form", { state: "hidden" });
    // Opening it again shows the choice
    await A.click("#lista button[data-accion='editar'][data-codigo='QLM-003']");
    expect((await A.inputValue("#f-edificio")) === "QLM-001", "not kept: " + await A.inputValue("#f-edificio"));
    await A.click("#btn-cancelar");
    // A duplicated property starts in the same building as the original
    await A.click("#lista button[data-accion='duplicar'][data-codigo='QLM-003']");
    expect(["QLM-001", "QLM-003"].includes(await A.inputValue("#f-edificio")), "duplicate: " + await A.inputValue("#f-edificio"));
    await A.click("#btn-cancelar");
    await A.click('[data-te="publicar"]');
    await A.waitForFunction(() => /Publicado/.test((document.querySelector(".te-capa h2") || {}).textContent || ""));
    const pub = site.published();
    const g = (c) => pub.find((p) => p.codigo === c).edificio;
    expect(g("QLM-003") === "QLM-001" && g("QLM-001") === "QLM-001", g("QLM-003") + " / " + g("QLM-001"));
    expect(!JSON.stringify(pub).match(/Mitre|calle/i), "an address got published");
    const w = await phone(browser, site, { name: "visitor2", path: null });
    await w.goto(site.base + "/propiedad.html?c=QLM-001");
    await w.waitForSelector("#sec-relacionadas:not([hidden])");
    const c = await w.$$eval("#relacionadas-grilla .ficha__codigo", (els) => els.map((e) => e.textContent));
    expect(c[0] === "QLM-003", c.join(","));
    expect(!A.errors.length && !w.errors.length, A.errors.concat(w.errors).join(" | "));
  });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
