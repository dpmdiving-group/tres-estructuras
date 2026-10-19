/* Rent marked collected with "Al día hasta" must reach Contabilidad: the
   client's case (contracts loaded with "al día hasta octubre", accounting
   empty) and the contract form. Today is pinned to 2026-10-19.
   Run: node tests/e2e/rent-accounting.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Rent and Contabilidad");
const expect = t.expect;
const contrato = (id, inquilino, codigo, monto, extra) => Object.assign({
  id: id, codigo: codigo, inquilino: inquilino, telefono: "", moneda: "ARS", dia: 10, desde: "2026-08",
  montos: [{ desde: "2026-08", monto: monto }], estado: "activo", alDiaHasta: "2026-10"
}, extra || {});

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A", login: null, clock: "2026-10-19T12:00:00", seed: {
    te_contratos: [contrato("C1", "Fabian Belizan", "QLM-002", 730000), contrato("C2", "Gabriela Soledad", "AVE-001", 730000),
      contrato("C3", "Luciano Nuñez", "", 700000)]
  } });
  const local = (k) => A.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), k);

  await t.check("the client's case: months marked collected say they aren't in Contabilidad, with a one-tap fix", async () => {
    await A.click("#tab-cobros");
    const hoy = (await A.textContent("#cobros-hoy-lista")).replace(/\s+/g, " ");
    expect(/3 meses figuran cobrados pero sin el pago registrado \(Fabian Belizan, Gabriela Soledad, Luciano Nuñez\): por eso no aparecen en Contabilidad/.test(hoy), hoy);
    expect(/no figura en Contabilidad/.test(await A.textContent("#lista-cobros")), "row note");
  });

  await t.check("registering them creates the payments and the incomes, and the notice goes away", async () => {
    await A.click("#cobros-hoy-lista button[data-registrar-previos]");
    await A.waitForFunction(() => /3 pagos registrados y cargados en Contabilidad/.test(document.body.innerText));
    const pagos = await local("te_pagos");
    expect(pagos.length === 3 && pagos.every((p) => p.periodo === "2026-10" && p.fecha === "2026-10-10" && p.mov), JSON.stringify(pagos));
    const movs = await local("te_movs");
    expect(movs.length === 3 && movs.every((m) => m.tipo === "ingreso" && m.categoria === "alquiler" && m.fecha === "2026-10-10"), JSON.stringify(movs));
    expect(movs.reduce((s, m) => s + m.monto, 0) === 2160000, "total");
    const contratos = await local("te_contratos");
    expect(contratos.every((c) => c.alDiaHasta === "2026-09"), JSON.stringify(contratos.map((c) => c.alDiaHasta)));
    expect(!/figuran cobrados/.test(await A.textContent("#cobros-hoy-lista")), "notice still there");
    expect(/Pagado/i.test(await A.textContent("#lista-cobros")) && (await A.$$eval("#lista-cobros .cobro__pagos li", (e) => e.length)) === 3, "rows");
  });

  await t.check("Contabilidad shows them in October", async () => {
    await A.click("#tab-conta");
    const m = (await A.textContent("#conta-metricas")).replace(/\s+/g, " ");
    expect(/Ingresos ARS\s*\$\s2\.160\.000/i.test(m), m);
    expect((await A.$$eval("#lista-movs .mov", (e) => e.length)) === 3, "movements listed");
  });

  await t.check("a new contract marked 'al día' this month offers to register it, and does", async () => {
    await A.click("#tab-cobros");
    await A.click("#btn-nuevo-contrato");
    await A.fill("#c-inquilino", "Nueva Inquilina");
    await A.fill("#c-monto", "500000");
    await A.fill("#c-desde", "2026-10");
    await A.fill("#c-aldia", "2026-10");
    await A.click("#btn-guardar-contrato");
    await A.waitForSelector("#form-contrato", { state: "hidden" });
    expect(/Marcaste como cobrado octubre/.test(A.dialogs[A.dialogs.length - 1] || ""), A.dialogs[A.dialogs.length - 1]);
    const c = (await local("te_contratos")).find((x) => x.inquilino === "Nueva Inquilina");
    expect(c.alDiaHasta === "", "al día hasta: " + c.alDiaHasta);
    expect((await local("te_pagos")).some((p) => p.contrato === c.id && p.monto === 500000), "payment");
    expect((await local("te_movs")).some((m) => m.monto === 500000 && /Nueva Inquilina/.test(m.descripcion)), "income");
  });

  await t.check("history before this month stays 'al día' without payments", async () => {
    await A.click("#cobros-ant");
    const row = await A.textContent("#lista-cobros");
    expect(/Al día/.test(row) && /no figura en Contabilidad/.test(row), row.slice(0, 200));
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
