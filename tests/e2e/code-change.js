/* Changing a property's code: photos stay, old codes keep opening the
   property, and they are never given to another one.
   Run: node tests/e2e/code-change.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Changing a property's code");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const page = await phone(browser, site, { name: "panel" });
  const prop = (code) => page.evaluate((c) => TE_ADMIN.obtenerProps().find((x) => x.codigo === c), code);
  const before = await prop("LAN-001");

  await t.check("the warning is accurate: photos stay, old QRs keep working, the old code is reserved", async () => {
    await page.click("#lista button[data-accion='editar'][data-codigo='LAN-001']");
    await page.fill("#f-codigo", "LAN-002");
    await page.click("#btn-guardar");
    await page.waitForSelector("#form", { state: "hidden" });
    const msg = page.dialogs[page.dialogs.length - 1] || "";
    expect(/Las fotos y los datos quedan igual/.test(msg) && /queda reservado/.test(msg) && !/rotas/.test(msg), msg);
  });

  await t.check("the old code is kept and the photos don't move", async () => {
    const p = await prop("LAN-002");
    expect(p && JSON.stringify(p.codigosAnteriores) === '["LAN-001"]', JSON.stringify(p && p.codigosAnteriores));
    expect(JSON.stringify(p.fotos) === JSON.stringify(before.fotos), "photos changed");
    expect(/antes LAN-001/.test(await page.textContent("#lista")), "list row");
  });

  await t.check("a new property never gets an old code, typed or suggested", async () => {
    await page.click("#btn-nueva");
    await page.selectOption("#f-zona", "Lanús");
    expect((await page.inputValue("#f-codigo")) === "LAN-003", "suggested " + await page.inputValue("#f-codigo"));
    await page.fill("#f-codigo", "LAN-001");
    await page.fill("#f-titulo", "Casa de prueba");
    await page.fill("#f-barrio", "Centro");
    await page.fill("#f-precio", "1000");
    await page.fill("#f-ambientes", "2");
    await page.fill("#f-m2c", "50");
    await page.fill("#f-descripcion", "Una descripción suficientemente larga.");
    await page.click("#btn-guardar");
    await page.waitForFunction(() => /ya se usó antes para LAN-002/.test(document.body.innerText));
    expect(await page.evaluate(() => !document.getElementById("form").hidden), "form closed");
    await page.click("#btn-cancelar");
  });

  await t.check("the form lists the old codes, and a property can go back to its own old code", async () => {
    await page.click("#lista button[data-accion='editar'][data-codigo='LAN-002']");
    expect(/Antes: LAN-001/.test(await page.textContent("#f-codigos-anteriores")), "note");
    await page.fill("#f-codigo", "LAN-001");
    await page.click("#btn-guardar");
    await page.waitForSelector("#form", { state: "hidden" });
    const p = await prop("LAN-001");
    expect(p && JSON.stringify(p.codigosAnteriores) === '["LAN-002"]', JSON.stringify(p && p.codigosAnteriores));
  });

  await t.check("a plain edit asks nothing and keeps the old codes", async () => {
    const n = page.dialogs.length;
    await page.click("#lista button[data-accion='editar'][data-codigo='LAN-001']");
    await page.fill("#f-precio", "123456");
    await page.click("#btn-guardar");
    await page.waitForSelector("#form", { state: "hidden" });
    const p = await prop("LAN-001");
    expect(page.dialogs.length === n && JSON.stringify(p.codigosAnteriores) === '["LAN-002"]', JSON.stringify(p.codigosAnteriores));
  });

  await t.check("a lead that mentions an old code goes to the current one", async () => {
    await page.click("#tab-leads");
    await page.click("#btn-nuevo-lead");
    await page.fill("#l-mensaje", "Hola, vi el cartel LAN-002");
    const shown = await page.evaluate(() => document.getElementById("l-mensaje").closest("section, form, div").innerText);
    expect(/LAN-001/.test(shown), shown.slice(0, 200));
    await page.click("#tab-props");
  });

  await t.check("published, the old code opens the property page and the sign", async () => {
    await page.click('[data-te="publicar"]');
    await page.waitForFunction(() => /Publicado/.test((document.querySelector(".te-capa h2") || {}).textContent || ""));
    expect(JSON.stringify(site.published().find((p) => p.codigo === "LAN-001").codigosAnteriores) === '["LAN-002"]', "published");
    const v = await phone(browser, site, { name: "visitor", path: null });
    await v.goto(site.base + "/propiedad.html?c=LAN-002&f=cartel");
    await v.waitForSelector("#encabezado:not([hidden])");
    expect((await v.textContent("#codigo")) === "LAN-001", "page shows " + await v.textContent("#codigo"));
    expect(/\/p\/LAN-001\?f=cartel$/.test(v.url()), "address " + v.url());
    await v.goto(site.base + "/cartel.html?c=LAN-002");
    await v.waitForFunction(() => /LAN-001/.test(document.getElementById("c-codigo").textContent));
    expect(!v.errors.length, v.errors.join(" | "));
  });

  await t.check("no JavaScript errors", async () => { expect(!page.errors.length, page.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
