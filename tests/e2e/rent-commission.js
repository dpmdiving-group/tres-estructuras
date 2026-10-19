/* Third-party rentals: only the agency's commission reaches Contabilidad;
   the rest is shown as the owner's. Today is pinned to 2026-10-20.
   Run: node tests/e2e/rent-commission.js */

"use strict";

const fs = require("fs");
const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Commission on third-party rentals");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  // An existing contract whose October payment went to Contabilidad as the full rent
  const A = await phone(browser, site, { name: "A", login: null, clock: "2026-10-20T10:00:00", context: { acceptDownloads: true }, seed: {
    te_contratos: [{ id: "C1", codigo: "DPX-004", inquilino: "Fabian Belizan", telefono: "", moneda: "ARS", dia: 10, desde: "2026-10",
      montos: [{ desde: "2026-10", monto: 730000 }], estado: "activo" }],
    te_pagos: [{ id: "P1", contrato: "C1", periodo: "2026-10", fecha: "2026-10-10", monto: 730000, medio: "transferencia", mov: "M1" }],
    te_movs: [{ id: "M1", pago: "P1", tipo: "ingreso", categoria: "alquiler", fecha: "2026-10-10", monto: 730000, moneda: "ARS", codigo: "DPX-004", descripcion: "Alquiler octubre 2026 — Fabian Belizan" }]
  } });
  const local = (k) => A.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), k);
  const ingresos = async () => (await local("te_movs")).filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);

  await t.check("a new third-party contract at 10%: the payment puts only the commission in Contabilidad", async () => {
    await A.click("#tab-cobros");
    await A.click("#btn-nuevo-contrato");
    await A.fill("#c-inquilino", "Gabriela Soledad");
    await A.fill("#c-monto", "730000");
    await A.fill("#c-desde", "2026-10");
    await A.fill("#c-aldia", "");
    await A.fill("#c-comision", "10");
    await A.click("#btn-guardar-contrato");
    await A.waitForSelector("#form-contrato", { state: "hidden" });
    await A.click("#lista-cobros .cobro:has-text('Gabriela') button[data-pago-contrato]");
    await A.click("#btn-guardar-pago");
    await A.waitForSelector("#form-pago", { state: "hidden" });
    const m = (await local("te_movs")).find((x) => /Gabriela/.test(x.descripcion));
    expect(m && m.monto === 73000 && m.categoria === "comision" && m.descripcion === "Comisión 10% del alquiler octubre 2026 — Gabriela Soledad", JSON.stringify(m));
    const fila = (await A.textContent("#lista-cobros .cobro:has-text('Gabriela')")).replace(/\s+/g, " ");
    expect(/Comisión \$\s73\.000 · para el propietario \$\s657\.000/.test(fila), fila);
  });

  await t.check("the month shows what is the agency's and what is the owners'", async () => {
    const m = (await A.textContent("#cobros-metricas")).replace(/\s+/g, " ");
    expect(/Ganancia ARS\s*\$\s803\.000/i.test(m) && /Para propietarios ARS\s*\$\s657\.000/i.test(m), m);
  });

  await t.check("setting a commission on an existing contract offers to correct the incomes already loaded", async () => {
    expect((await ingresos()) === 803000, "before: " + await ingresos());
    await A.click("#lista-cobros .cobro:has-text('Fabian') button[data-editar-contrato]");
    await A.fill("#c-comision", "8");
    await A.click("#btn-guardar-contrato");
    await A.waitForSelector("#form-contrato", { state: "hidden" });
    expect(/Ya hay 1 pago cargado en Contabilidad con el alquiler completo/.test(A.dialogs[A.dialogs.length - 1] || ""), A.dialogs[A.dialogs.length - 1]);
    const m1 = (await local("te_movs")).find((x) => x.id === "M1");
    expect(m1.monto === 58400 && m1.categoria === "comision" && /Comisión 8%/.test(m1.descripcion), JSON.stringify(m1));
    expect((await ingresos()) === 131400, "after: " + await ingresos());
  });

  await t.check("Contabilidad's October total is now the real income", async () => {
    await A.click("#tab-conta");
    const m = (await A.textContent("#conta-metricas")).replace(/\s+/g, " ");
    expect(/Ingresos ARS\s*\$\s131\.400/i.test(m), m);
    expect(/Comisión por administración/.test(await A.textContent("#lista-movs")), "category name");
    await A.click("#tab-cobros");
  });

  await t.check("the payments export has the commission and the owner's part", async () => {
    const [dl] = await Promise.all([A.waitForEvent("download"), A.click("#btn-cobros-csv")]);
    const csv = fs.readFileSync(await dl.path(), "utf8");
    expect(/"Comisión %";"Ganancia";"Para el propietario"/.test(csv) && /"730000";"10";"73000";"657000"/.test(csv), csv.slice(0, 400));
  });

  await t.check("removing the commission puts the full rent back, if asked", async () => {
    await A.click("#lista-cobros .cobro:has-text('Fabian') button[data-editar-contrato]");
    await A.fill("#c-comision", "");
    await A.click("#btn-guardar-contrato");
    await A.waitForSelector("#form-contrato", { state: "hidden" });
    expect((await local("te_movs")).find((x) => x.id === "M1").monto === 730000, "not restored");
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
