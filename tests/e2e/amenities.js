/* Choosing which amenity options the panel shows, adding the owners' own,
   and how they reach the property page. Run: node tests/e2e/amenities.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Amenity options");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A", email: "gerardo@example.com" });
  const opciones = (page) => page.$$eval("#amenities .check", (els) => els.map((e) => e.textContent.trim()));
  const marcadas = (page) => page.$$eval("#amenities input:checked", (els) => els.map((e) => e.value));

  await t.check("the form starts with every built-in option", async () => {
    await A.click("#lista button[data-accion='editar'][data-codigo='QLM-002']");
    const o = await opciones(A);
    expect(o.length === 18 && o[0] === "Pileta" && o.includes("Gimnasio"), o.join(", "));
  });

  await t.check("unticking options hides them, except the ones this property has", async () => {
    const tiene = await marcadas(A);
    await A.click("#btn-amenities-lista");
    for (const nombre of ["Pileta", "Gimnasio", "SUM", "Ascensor"]) {
      await A.uncheck("#amenities-opciones label:has-text('" + nombre + "') input");
    }
    const o = await opciones(A);
    expect(!o.includes("Pileta") && !o.includes("Gimnasio") && !o.includes("SUM"), o.join(", "));
    expect(o.length === 14, o.length + " left");
    expect(JSON.stringify(await marcadas(A)) === JSON.stringify(tiene), "a ticked amenity was lost");
  });

  await t.check("adding their own option ticks it on the property being edited", async () => {
    await A.fill("#amenity-nueva", "  Cochera   cubierta ");
    await A.click("#btn-amenity-agregar");
    expect((await opciones(A)).includes("Cochera cubierta"), (await opciones(A)).join(", "));
    expect((await marcadas(A)).includes("Cochera cubierta"), "not ticked");
    // Typing an existing one (even hidden, any case) shows it instead of duplicating it
    await A.fill("#amenity-nueva", "pileta");
    await A.press("#amenity-nueva", "Enter");
    const o = await opciones(A);
    expect(o.filter((x) => x === "Pileta").length === 1 && (await marcadas(A)).includes("pileta"), o.join(", "));
    await A.click("#btn-amenities-listo");
    expect(await A.isHidden("#amenities-lista"), "manager still open");
  });

  await t.check("saved and published, the property page shows the new amenity by its exact name", async () => {
    await A.click("#btn-guardar");
    await A.waitForSelector("#form", { state: "hidden" });
    await A.click('[data-te="publicar"]');
    await A.waitForFunction(() => /Publicado/.test((document.querySelector(".te-capa h2") || {}).textContent || ""));
    await A.click(".te-capa .te-btn");
    await A.waitForSelector(".te-capa", { state: "detached" });
    const p = site.published().find((x) => x.codigo === "QLM-002");
    expect(p.amenities.includes("Cochera cubierta") && p.amenities.includes("pileta"), JSON.stringify(p.amenities));
    const v = await phone(browser, site, { name: "visitor", path: null });
    await v.goto(site.base + "/propiedad.html?c=QLM-002");
    await v.waitForSelector("#sec-amenities:not([hidden])");
    const shown = await v.$$eval("#amenities .amenity span", (els) => els.map((e) => e.textContent));
    expect(shown.includes("Cochera cubierta") && shown.includes("Pileta"), shown.join(", "));
    expect(!v.errors.length, v.errors.join(" | "));
    await v.ctx.close();
  });

  await t.check("a property that has a hidden option still shows it ticked, so saving keeps it", async () => {
    await A.click("#lista button[data-accion='editar'][data-codigo='QLM-002']");
    await A.click("#btn-amenities-lista");
    await A.uncheck("#amenities-opciones label:has-text('Pileta') input");
    await A.click("#btn-amenities-listo");
    expect((await opciones(A)).includes("Pileta") && (await marcadas(A)).includes("pileta"), "hidden option dropped from this property");
    await A.click("#btn-cancelar");
    await A.click("#lista button[data-accion='editar'][data-codigo='BER-001']");
    expect(!(await opciones(A)).includes("Pileta"), "hidden option shown on another property");
    await A.click("#btn-cancelar");
  });

  await t.check("another phone gets the same options", async () => {
    await A.waitForTimeout(1800);
    await A.evaluate(() => TE_DATOS.sincronizar());
    const B = await phone(browser, site, { name: "B", email: "mauro@example.com" });
    await B.evaluate(() => TE_DATOS.sincronizar());
    await B.click("#btn-nueva");
    const o = await opciones(B);
    expect(o.includes("Cochera cubierta") && !o.includes("Gimnasio") && !o.includes("Pileta"), o.join(", "));
    expect(!B.errors.length, B.errors.join(" | "));
    await B.ctx.close();
  });

  await t.check("removing their own option asks first and says which properties still have it", async () => {
    await A.click("#btn-nueva");
    await A.click("#btn-amenities-lista");
    await A.click("#amenities-opciones button[data-quitar-amenity='Cochera cubierta']");
    expect(/Las 1 propiedades que la tienen la siguen mostrando/.test(A.dialogs[A.dialogs.length - 1] || ""), A.dialogs[A.dialogs.length - 1]);
    expect(!(await opciones(A)).includes("Cochera cubierta"), "still offered");
    await A.click("#btn-cancelar");
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
