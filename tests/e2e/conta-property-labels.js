/* Contabilidad by property for rentals: incomes of contracts without a
   published property are grouped by the contract's name instead of all in
   "(sin propiedad)", and follow the contract when its property is chosen.
   Today is pinned to 2026-10-20. Run: node tests/e2e/conta-property-labels.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Contabilidad groups rentals by property");
const expect = t.expect;

const contrato = (id, extra) => Object.assign({ id: id, telefono: "", moneda: "ARS", dia: 10, desde: "2026-10", montos: [{ desde: "2026-10", monto: 700000 }], estado: "activo" }, extra);
const pago = (id, c, mov, monto) => ({ id: id, contrato: c, periodo: "2026-10", fecha: "2026-10-10", monto: monto, medio: "transferencia", mov: mov });
const mov = (id, p, monto, codigo) => ({ id: id, pago: p, tipo: "ingreso", categoria: "alquiler", fecha: "2026-10-10", monto: monto, moneda: "ARS", codigo: codigo, descripcion: "Alquiler octubre 2026" });

(async function main() {
  const site = await startSite();
  const browser = await launch();
  // The client's case: incomes recorded before names existed, all with no property
  const A = await phone(browser, site, { name: "A", login: null, clock: "2026-10-20T10:00:00", seed: {
    te_contratos: [contrato("C1", { codigo: "", inquilino: "Ana", referencia: "Mitre 1234" }),
      contrato("C2", { codigo: "", inquilino: "Luciano Nuñez", referencia: "" }),
      contrato("C3", { codigo: "DPX-004", inquilino: "Fabian" })],
    te_pagos: [pago("P1", "C1", "M1", 800000), pago("P2", "C2", "M2", 700000), pago("P3", "C3", "M3", 730000)],
    te_movs: [mov("M1", "P1", 800000, ""), mov("M2", "P2", 700000, ""), mov("M3", "P3", 730000, "DPX-004"),
      { id: "M9", tipo: "gasto", categoria: "materiales", fecha: "2026-10-05", monto: 50000, moneda: "ARS", codigo: "", descripcion: "Pintura general" }]
  } });
  const filas = () => A.$$eval("#conta-por-propiedad tbody tr", (trs) => trs.map((tr) => tr.children[0].textContent));

  await t.check("old incomes regroup under each contract's name; only the manual expense stays without property", async () => {
    await A.click("#tab-conta");
    const f = await filas();
    expect(JSON.stringify(f) === '["(sin propiedad)","Contrato de Luciano Nuñez","DPX-004","Mitre 1234"]', f.join(" | "));
  });

  await t.check("the filter offers those names and '(sin propiedad)'", async () => {
    const o = await A.$$eval("#filtro-mov-prop option", (e) => e.map((x) => x.textContent));
    expect(o.includes("Mitre 1234 (no publicada)") && o.includes("Contrato de Luciano Nuñez (no publicada)") && o.includes("(sin propiedad)"), o.join(" | "));
    await A.selectOption("#filtro-mov-prop", "et:Mitre 1234");
    expect((await A.$$eval("#lista-movs .mov", (e) => e.length)) === 1, "Mitre 1234 filter");
    await A.selectOption("#filtro-mov-prop", "__sin__");
    expect(/Pintura general/.test(await A.textContent("#lista-movs")) && (await A.$$eval("#lista-movs .mov", (e) => e.length)) === 1, "sin propiedad filter");
    await A.selectOption("#filtro-mov-prop", "");
  });

  await t.check("choosing the property in a contract moves its incomes there", async () => {
    await A.click("#tab-cobros");
    await A.click("#lista-cobros .cobro:has-text('Luciano') button[data-editar-contrato]");
    expect(/figura como «Contrato de Luciano Nuñez»/.test(await A.textContent("#c-propiedad-ayuda")), "help text");
    await A.selectOption("#c-codigo", "QLM-002");
    expect(await A.isHidden("#c-propiedad-ayuda"), "help still shown with a property");
    await A.click("#btn-guardar-contrato");
    await A.waitForFunction(() => /1 ingreso pasó a QLM-002/.test(document.body.innerText));
    await A.click("#tab-conta");
    const f = await filas();
    expect(f.includes("QLM-002") && !f.includes("Contrato de Luciano Nuñez"), f.join(" | "));
  });

  await t.check("a new payment of an unpublished property comes already named", async () => {
    await A.click("#tab-cobros");
    await A.click("#btn-nuevo-contrato");
    await A.fill("#c-inquilino", "Rosa");
    await A.fill("#c-referencia", "Belgrano 55");
    await A.fill("#c-monto", "500000");
    await A.fill("#c-desde", "2026-10");
    await A.fill("#c-aldia", "");
    await A.click("#btn-guardar-contrato");
    await A.waitForSelector("#form-contrato", { state: "hidden" });
    await A.click("#lista-cobros .cobro:has-text('Rosa') button[data-pago-contrato]");
    await A.click("#btn-guardar-pago");
    await A.waitForSelector("#form-pago", { state: "hidden" });
    const m = (await A.evaluate(() => JSON.parse(localStorage.getItem("te_movs")))).find((x) => x.monto === 500000);
    expect(m.codigo === "" && m.etiqueta === "Belgrano 55", JSON.stringify(m));
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
