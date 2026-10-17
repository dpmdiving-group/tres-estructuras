/* Adding workers from the Jobs tab on a phone: the box comes into view,
   adding confirms it, and the job form can add one on the spot.
   Run: node tests/e2e/workers.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Workers (Trabajos)");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  // A real phone screen: the box used to open below it, so the tap seemed to do nothing
  const A = await phone(browser, site, { name: "A", login: null, context: { viewport: { width: 360, height: 658 } }, promptAnswer: "Rosa Pérez" });
  const local = (key) => A.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]"), key);

  await t.check("tapping Trabajadores brings the box into view, ready to type", async () => {
    await A.click("#tab-trabajos");
    await A.evaluate(() => window.scrollTo(0, 0));
    await A.click("#btn-trabajadores");
    await A.waitForFunction(() => {
      const r = document.getElementById("caja-trabajadores").getBoundingClientRect();
      return r.top >= 0 && r.top < innerHeight - 100;
    }, null, { timeout: 5000 });
    expect((await A.getAttribute("#btn-trabajadores", "aria-expanded")) === "true", "aria-expanded");
    expect(await A.evaluate(() => document.activeElement.id === "t-nuevo-nombre"), "name field not focused");
  });

  await t.check("adding one confirms it and lists it", async () => {
    await A.fill("#t-nuevo-nombre", "Juan Gómez");
    await A.fill("#t-nuevo-tel", "11 2345-6789");
    await A.click("#btn-agregar-trabajador");
    await A.waitForFunction(() => /Trabajador agregado: Juan Gómez/.test(document.body.innerText));
    expect(/Juan Gómez/.test(await A.textContent("#lista-trabajadores")), "not listed");
    const w = (await local("te_trabajadores")).find((x) => x.nombre === "Juan Gómez");
    expect(w && w.telefono === "1123456789", JSON.stringify(w));
    expect((await A.inputValue("#t-nuevo-nombre")) === "", "name not cleared");
  });

  await t.check("without a name it says so", async () => {
    await A.click("#btn-agregar-trabajador");
    await A.waitForFunction(() => /Falta el nombre del trabajador/.test(document.body.innerText));
  });

  await t.check("the job form can add a worker on the spot and picks it", async () => {
    await A.click("#btn-nuevo-trabajo");
    await A.selectOption("#tr-trabajador", "__nuevo__");
    const elegido = await A.$eval("#tr-trabajador", (s) => s.options[s.selectedIndex].textContent);
    expect(elegido === "Rosa Pérez", "selected: " + elegido);
    await A.fill("#tr-descripcion", "Pintar el frente");
    await A.click("#btn-guardar-trabajo");
    const job = (await local("te_trabajos")).find((x) => x.descripcion === "Pintar el frente");
    const rosa = (await local("te_trabajadores")).find((x) => x.nombre === "Rosa Pérez");
    expect(rosa && job && job.trabajador === rosa.id, JSON.stringify({ job, rosa }));
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
