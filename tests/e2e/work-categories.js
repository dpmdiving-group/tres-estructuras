/* Jobs tab: editing the job categories, editing workers, and starting a job
   from a worker. Run: node tests/e2e/work-categories.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Job categories and workers");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A", login: null, context: { viewport: { width: 360, height: 658 } }, promptAnswer: "Gasista" });
  const local = (k) => A.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), k);
  const opciones = (sel) => A.$$eval(sel + " option", (e) => e.map((x) => x.textContent));

  await t.check("Categorías opens the list on screen, with every category", async () => {
    await A.click("#tab-trabajos");
    await A.evaluate(() => window.scrollTo(0, 0));
    await A.click("#btn-categorias");
    await A.waitForFunction(() => { const r = document.getElementById("caja-categorias").getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight - 100; }, null, { timeout: 5000 });
    const nombres = await A.$$eval("#lista-categorias .cat-nombre", (e) => e.map((x) => x.value));
    expect(nombres.join(",") === "Limpieza,Reparación,Pintura,Jardín,Electricidad,Plomería", nombres.join(","));
  });

  await t.check("renaming and recolouring a category updates the filters, the legend and the job form", async () => {
    await A.fill("#lista-categorias .cat-nombre[data-nombre-cat='plomeria']", "Plomería y gas");
    await A.press("#lista-categorias .cat-nombre[data-nombre-cat='plomeria']", "Enter");
    await A.waitForFunction(() => /Plomería y gas/.test(document.getElementById("leyenda-categorias").textContent));
    expect((await opciones("#filtro-trabajo-cat")).includes("Plomería y gas"), "filter");
    await A.$eval("#lista-categorias .cat-color[data-color-cat='plomeria']", (e) => { e.value = "#ff0000"; e.dispatchEvent(new Event("change", { bubbles: true })); });
    const c = (await local("te_categorias")).find((x) => x.clave === "plomeria");
    expect(c.nombre === "Plomería y gas" && c.color === "#ff0000", JSON.stringify(c));
  });

  await t.check("a name already used is refused", async () => {
    await A.fill("#lista-categorias .cat-nombre[data-nombre-cat='pintura']", "limpieza");
    await A.press("#lista-categorias .cat-nombre[data-nombre-cat='pintura']", "Enter");
    await A.waitForFunction(() => /Ya hay una categoría/.test(document.body.innerText));
    expect((await A.inputValue("#lista-categorias .cat-nombre[data-nombre-cat='pintura']")) === "Pintura", "not reverted");
  });

  await t.check("adding a category; an unused one can be removed, one in use can't", async () => {
    await A.fill("#cat-nueva-nombre", "Albañilería");
    await A.press("#cat-nueva-nombre", "Enter");
    await A.waitForFunction(() => /Categoría agregada/.test(document.body.innerText));
    expect((await opciones("#filtro-trabajo-cat")).includes("Albañilería"), "new one not in the filter");
    await A.click("#lista-categorias button[data-quitar-cat='albanileria']");
    expect(!(await local("te_categorias")).some((x) => x.clave === "albanileria"), "not removed");
    // A job in Limpieza makes it impossible to remove
    await A.click("#btn-nuevo-trabajo");
    await A.selectOption("#tr-categoria", "limpieza");
    await A.fill("#tr-descripcion", "Limpieza final");
    await A.click("#btn-guardar-trabajo");
    await A.click("#btn-categorias");
    if (await A.isHidden("#caja-categorias")) await A.click("#btn-categorias");
    expect(await A.isDisabled("#lista-categorias button[data-quitar-cat='limpieza']"), "a category in use can be removed");
  });

  await t.check("a worker can be edited", async () => {
    await A.click("#btn-trabajadores");
    if (await A.isHidden("#caja-trabajadores")) await A.click("#btn-trabajadores");
    await A.fill("#t-nuevo-nombre", "Juan");
    await A.click("#btn-agregar-trabajador");
    await A.click("#lista-trabajadores button[data-editar-trabajador]");
    expect((await A.inputValue("#t-nuevo-nombre")) === "Juan" && (await A.textContent("#btn-agregar-trabajador")) === "Guardar cambios", "edit mode");
    await A.fill("#t-nuevo-nombre", "Juan Pérez");
    await A.fill("#t-nuevo-tel", "11 5555-1234");
    await A.selectOption("#t-nuevo-cat", "pintura");
    await A.fill("#t-nuevo-dni", "30.123.456");
    await A.fill("#t-nuevo-direccion", "Calle 123,  Quilmes");
    await A.fill("#t-nuevo-notas", "Trabaja martes y jueves.\nTiene herramientas propias.");
    await A.click("#btn-agregar-trabajador");
    await A.waitForFunction(() => /Cambios guardados: Juan Pérez/.test(document.body.innerText));
    const w = await local("te_trabajadores");
    expect(w.length === 1 && w[0].nombre === "Juan Pérez" && w[0].telefono === "1155551234" && w[0].categoria === "pintura", JSON.stringify(w));
    expect(w[0].dni === "30.123.456" && w[0].direccion === "Calle 123, Quilmes" && w[0].notas === "Trabaja martes y jueves.\nTiene herramientas propias.", JSON.stringify(w));
    const fila = await A.textContent("#lista-trabajadores");
    expect(/DNI 30\.123\.456 · Calle 123, Quilmes/.test(fila) && /Tiene herramientas propias/.test(fila), fila.slice(0, 200));
    expect((await A.inputValue("#t-nuevo-dni")) === "" && (await A.inputValue("#t-nuevo-notas")) === "", "form not cleared");
    // Editing again shows them
    await A.click("#lista-trabajadores button[data-editar-trabajador]");
    expect((await A.inputValue("#t-nuevo-direccion")) === "Calle 123, Quilmes", "address not loaded for editing");
    await A.click("#btn-cancelar-trabajador");
    expect((await A.textContent("#btn-agregar-trabajador")) === "Agregar trabajador", "still in edit mode");
  });

  await t.check("a worker's usual category can be a new one", async () => {
    await A.selectOption("#t-nuevo-cat", "__nueva__");
    expect((await A.$eval("#t-nuevo-cat", (s) => s.options[s.selectedIndex].textContent)) === "Gasista", "new category not picked");
    expect((await local("te_categorias")).some((x) => x.nombre === "Gasista"), "not saved");
  });

  await t.check("+ Trabajo on a worker opens a new job with that worker and their category", async () => {
    await A.click("#lista-trabajadores button[data-trabajo-de]");
    await A.waitForSelector("#form-trabajo:not([hidden])");
    expect((await A.$eval("#tr-trabajador", (s) => s.options[s.selectedIndex].textContent)) === "Juan Pérez", "worker");
    expect((await A.inputValue("#tr-categoria")) === "pintura", "category " + await A.inputValue("#tr-categoria"));
    await A.click("#btn-cancelar-trabajo");
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
