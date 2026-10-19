/* Deposit and contract fees: one-time charges at the start of a rental.
   The fees are income; the deposit is held and never counts as income.
   Today is pinned to 2026-10-20. Run: node tests/e2e/rent-deposit-fees.js */

"use strict";

const fs = require("fs");
const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Deposit and contract fees");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A", login: null, clock: "2026-10-20T10:00:00", context: { acceptDownloads: true } });
  const local = (k) => A.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), k);
  const hoy = async () => (await A.textContent("#cobros-hoy-lista")).replace(/\s+/g, " ");

  await t.check("a contract with a deposit and fees lists both as pending today", async () => {
    await A.click("#tab-cobros");
    await A.click("#btn-nuevo-contrato");
    await A.fill("#c-inquilino", "Gabriela Soledad");
    await A.fill("#c-monto", "730000");
    await A.fill("#c-desde", "2026-10");
    await A.fill("#c-aldia", "");
    await A.fill("#c-deposito", "730000");
    await A.fill("#c-honorarios", "150000");
    await A.click("#btn-guardar-contrato");
    await A.waitForSelector("#form-contrato", { state: "hidden" });
    const h = await hoy();
    expect(/Depósito pendiente: \$\s730\.000/.test(h) && /Honorarios por el contrato pendiente: \$\s150\.000/.test(h), h);
    expect(/pendiente/.test(await A.textContent("#lista-cobros .cobro")), "month row");
  });

  await t.check("recording the fees puts them in Contabilidad", async () => {
    await A.click("#cobros-hoy-lista button[data-concepto='honorarios']");
    expect(await A.isHidden("#p-periodo-campo"), "the month field shows for a one-time charge");
    expect((await A.inputValue("#p-monto")) === "150000", "amount");
    await A.click("#btn-guardar-pago");
    await A.waitForSelector("#form-pago", { state: "hidden" });
    const m = (await local("te_movs")).find((x) => x.categoria === "honorarios_contrato");
    expect(m && m.monto === 150000 && m.descripcion === "Honorarios por el contrato — Gabriela Soledad", JSON.stringify(m));
  });

  await t.check("recording the deposit keeps it out of Contabilidad and says it is held", async () => {
    await A.click("#cobros-hoy-lista button[data-concepto='deposito']");
    expect(await A.isHidden("#p-conta-campo"), "offers to put the deposit in Contabilidad");
    await A.click("#btn-guardar-pago");
    await A.waitForSelector("#form-pago", { state: "hidden" });
    const movs = await local("te_movs");
    expect(movs.length === 1, "the deposit reached Contabilidad: " + JSON.stringify(movs));
    const pagos = await local("te_pagos");
    expect(pagos.some((p) => p.concepto === "deposito" && p.monto === 730000 && !p.periodo), JSON.stringify(pagos));
    expect(!/pendiente/.test(await hoy()), "still pending today");
    expect(/Depósito \$\s730\.000 · cobrado el 20\/10 \(en garantía\)/.test((await A.textContent("#lista-cobros .cobro")).replace(/\s+/g, " ")), "month row");
  });

  await t.check("a deposit never counts as the month's rent", async () => {
    const row = (await A.textContent("#lista-cobros .cobro")).replace(/\s+/g, " ");
    expect(/Vencido hace 10 días/i.test(row), "October rent shows as paid by the deposit: " + row.slice(0, 160));
  });

  await t.check("the export names each payment's concept", async () => {
    const [dl] = await Promise.all([A.waitForEvent("download"), A.click("#btn-cobros-csv")]);
    const csv = fs.readFileSync(await dl.path(), "utf8");
    expect(/"Depósito";"";"";"Gabriela Soledad";"ARS";"730000";"";"0";""/.test(csv) && /"Honorarios por el contrato";"";"";"Gabriela Soledad";"ARS";"150000";"";"150000";""/.test(csv), csv);
  });

  await t.check("after the contract ends, the held deposit is still visible", async () => {
    await A.click("#lista-cobros button[data-editar-contrato]");
    await A.selectOption("#c-estado", "terminado");
    await A.click("#btn-guardar-contrato");
    await A.waitForSelector("#form-contrato", { state: "hidden" });
    expect(/depósito en garantía \$\s730\.000/.test((await A.textContent("#lista-terminados")).replace(/\s+/g, " ")), await A.textContent("#lista-terminados"));
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
