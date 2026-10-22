/* Contabilidad's year view: the year's income, expenses and profit without
   adding up twelve months, month by month, by property, and its export.
   Today is pinned to 2026-10-22. Run: node tests/e2e/conta-year.js */

"use strict";

const fs = require("fs");
const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Contabilidad: the year");
const expect = t.expect;

const mov = (id, fecha, tipo, monto, extra) => Object.assign({ id: id, fecha: fecha, tipo: tipo, categoria: tipo === "ingreso" ? "alquiler" : "materiales", monto: monto, moneda: "ARS", codigo: "", descripcion: id }, extra);

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A", login: null, clock: "2026-10-22T10:00:00", context: { acceptDownloads: true }, seed: {
    te_movs: [
      mov("M1", "2026-03-10", "ingreso", 500000, { codigo: "QLM-002" }),
      mov("M2", "2026-03-15", "gasto", 80000, { codigo: "QLM-002" }),
      mov("M3", "2026-10-10", "ingreso", 700000, { codigo: "QLM-001" }),
      mov("M4", "2026-10-12", "gasto", 900000, { codigo: "QLM-001" }),
      mov("M5", "2026-07-01", "ingreso", 2000, { moneda: "USD", codigo: "QLM-001", categoria: "sena" }),
      mov("M6", "2025-12-20", "ingreso", 111111, { codigo: "QLM-002" })
    ]
  } });
  const metricas = async () => (await A.textContent("#conta-metricas")).replace(/\s+/g, " ");
  const fila = (sel, texto) => A.$eval(sel + " tbody tr:has(td:text-is('" + texto + "'))", (tr) => tr.innerText.replace(/\s+/g, " "));

  await t.check("'Año' shows the year's income, expenses and profit, pesos and dollars apart", async () => {
    await A.click("#tab-conta");
    await A.click("#conta-modo-anio");
    expect((await A.textContent("#conta-titulo")) === "Año 2026", await A.textContent("#conta-titulo"));
    const m = await metricas();
    expect(/Ingresos ARS\s*\$\s1\.200\.000/i.test(m) && /Gastos ARS\s*\$\s980\.000/i.test(m) && /Resultado ARS\s*\$\s220\.000/i.test(m), m);
    expect(/Ingresos USD\s*USD\s2\.000/i.test(m) && /Resultado USD\s*USD\s2\.000/i.test(m), m);
    expect(/5 movimientos este año/.test(await A.textContent("#conta-resumen")), await A.textContent("#conta-resumen"));
  });

  await t.check("month by month: each month's result, empty months too", async () => {
    expect(await A.isVisible("#conta-por-mes"), "no month table");
    expect((await A.$$eval("#conta-por-mes tbody tr", (r) => r.length)) === 12, "not 12 months");
    expect(/Marzo \$\s500\.000 \$\s80\.000 \$\s420\.000/.test(await fila("#conta-por-mes", "Marzo")), await fila("#conta-por-mes", "Marzo"));
    const oct = await fila("#conta-por-mes", "Octubre");
    expect(/\$\s-200\.000/.test(oct) && await A.$eval("#conta-por-mes tbody tr:nth-child(10) td:last-child", (td) => td.classList.contains("num--negativo")), oct);
    expect(/Julio USD\s2\.000/.test(await fila("#conta-por-mes", "Julio")), await fila("#conta-por-mes", "Julio"));
    expect(/Enero — — —/.test(await fila("#conta-por-mes", "Enero")), await fila("#conta-por-mes", "Enero"));
  });

  await t.check("by property for the whole year; the owners' monthly statement steps aside", async () => {
    const q = await fila("#conta-por-propiedad", "QLM-002");
    expect(/\$\s500\.000 \$\s80\.000 \$\s420\.000/.test(q), q);
    expect(await A.isHidden("#bloque-propietarios"), "owners' statement in the year view");
    expect((await A.textContent("#conta-movs-titulo")) === "Movimientos del año", await A.textContent("#conta-movs-titulo"));
  });

  await t.check("the arrows go year by year", async () => {
    await A.click("#conta-ant");
    expect((await A.textContent("#conta-titulo")) === "Año 2025" && /Resultado ARS\s*\$\s111\.111/i.test(await metricas()), await metricas());
    await A.click("#conta-sig");
  });

  await t.check("'Exportar año' downloads only that year", async () => {
    expect((await A.textContent("#btn-conta-csv-mes")) === "Exportar año (Excel)", await A.textContent("#btn-conta-csv-mes"));
    const [dl] = await Promise.all([A.waitForEvent("download"), A.click("#btn-conta-csv-mes")]);
    expect(dl.suggestedFilename() === "contabilidad-2026.csv", dl.suggestedFilename());
    const csv = fs.readFileSync(await dl.path(), "utf8");
    expect(/M1/.test(csv) && /M4/.test(csv) && !/M6/.test(csv), csv);
  });

  await t.check("back to 'Mes': this month, with the owners' statement", async () => {
    await A.click("#conta-modo-mes");
    expect((await A.textContent("#conta-titulo")) === "octubre 2026" && await A.isVisible("#bloque-propietarios") && await A.isHidden("#conta-por-mes"), await A.textContent("#conta-titulo"));
    expect(/Resultado ARS\s*\$\s-200\.000/i.test(await metricas()), await metricas());
    expect((await A.textContent("#btn-conta-csv-mes")) === "Exportar mes (Excel)", "export label");
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
