/* The Cobros tab: rental contracts, payments, overdue rent, WhatsApp
   reminders and confirmations, adjustments, and the link with Contabilidad.
   Today is pinned to Friday 2026-10-16. Run: node tests/e2e/rent-collection.js */

"use strict";

const fs = require("fs");
const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Rent collection (Cobros)");
const expect = t.expect;
const HOY = "2026-10-16T12:00:00";

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A", email: "gerardo@example.com", clock: HOY, context: { acceptDownloads: true } });
  // The text as written (not as styled), one space between pieces
  const text = (page, sel) => page.$eval(sel, (e) => {
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (w.nextNode()) parts.push(w.currentNode.nodeValue);
    return parts.join(" ");
  }).then((s) => s.replace(/\s+/g, " ").replace(/\( /g, "(").trim());
  const local = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]"), key);
  const hoyItems = (page) => page.$$eval("#cobros-hoy-lista .cobro-hoy p", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));

  await t.check("a new contract takes the property's rent; the tab says what to do today", async () => {
    await A.click("#tab-cobros");
    expect(/Todavía no hay contratos/.test(await text(A, "#cobros-vacio")), "empty state");
    await A.click("#btn-nuevo-contrato");
    await A.selectOption("#c-codigo", "QLM-002");
    expect((await A.inputValue("#c-monto")) === "520000", "rent from the property: " + await A.inputValue("#c-monto"));
    await A.fill("#c-monto", "300000");
    await A.fill("#c-inquilino", "Ana Pérez");
    await A.fill("#c-telefono", "11 2345-6789");
    await A.fill("#c-referencia", "Mitre 1234, 2° B");
    await A.fill("#c-dia", "10");
    await A.selectOption("#c-ajuste", "3");
    await A.fill("#c-desde", "2026-07");
    // A contract that started before today: by default the earlier months were already collected
    expect((await A.inputValue("#c-aldia")) === "2026-09", "al día hasta: " + await A.inputValue("#c-aldia"));
    await A.fill("#c-aldia", "");   // this tenant owes them all
    await A.click("#btn-guardar-contrato");
    await A.waitForSelector("#form-contrato", { state: "hidden" });
    const items = await hoyItems(A);
    expect(items.length === 2, items.join(" | "));
    expect(/^Ana Pérez QLM-002 Debe 4 meses \(julio, agosto y 2 más\) · \$ 1\.200\.000 · el más viejo venció hace 98 días$/.test(items[0]), items[0]);
    expect(/Toca ajustar el alquiler \(cada 3 meses; el último cambio fue en julio\)/.test(items[1]), items[1]);
    expect((await text(A, "#badge-cobros")) === "2", "badge " + await text(A, "#badge-cobros"));
  });

  await t.check("the month shows what is owed, earlier debts and the totals", async () => {
    expect((await text(A, "#cobros-titulo")) === "Octubre 2026", await text(A, "#cobros-titulo"));
    const row = await text(A, "#lista-cobros .cobro");
    expect(/QLM-002 Ana Pérez vence 10\/10 \$ 300\.000 Vencido hace 6 días/.test(row), row);
    expect(/Debe además: julio \(\$ 300\.000\), agosto \(\$ 300\.000\), septiembre \(\$ 300\.000\)/.test(row), row);
    expect(/A cobrar ARS \$ 300\.000 Cobrado ARS \$ 0 Falta ARS \$ 300\.000 Vencidos 1/.test(await text(A, "#cobros-metricas")), await text(A, "#cobros-metricas"));
  });

  await t.check("paying July from today's list clears it and adds an income in Contabilidad", async () => {
    await A.click("#cobros-hoy-lista button[data-periodo='2026-07']");
    expect((await A.inputValue("#p-periodo")) === "2026-07" && (await A.inputValue("#p-monto")) === "300000", "prefilled");
    expect((await A.inputValue("#p-fecha")) === "2026-10-16", "today");
    await A.selectOption("#p-medio", "efectivo");
    await A.click("#btn-guardar-pago");
    await A.waitForSelector("#form-pago", { state: "hidden" });
    expect(/Debe 3 meses \(agosto, septiembre, octubre\)/.test((await hoyItems(A))[0]) && !(await hoyItems(A)).some((x) => /julio \(/.test(x)), (await hoyItems(A))[0]);
    const movs = await local(A, "te_movs");
    const m = movs.find((x) => x.categoria === "alquiler");
    expect(m && m.tipo === "ingreso" && m.monto === 300000 && m.codigo === "QLM-002" && m.descripcion === "Alquiler julio 2026 — Ana Pérez" && m.pago, JSON.stringify(m));
    expect((await local(A, "te_pagos"))[0].mov === m.id, "payment points to its income");
  });

  await t.check("a partial payment shows what is left, with a WhatsApp confirmation", async () => {
    await A.click("#lista-cobros button[data-pago-contrato]");
    await A.fill("#p-monto", "100000");
    await A.click("#btn-guardar-pago");
    await A.waitForSelector("#form-pago", { state: "hidden" });
    const row = await text(A, "#lista-cobros .cobro");
    expect(/Vencido hace 6 días Pagó \$ 100\.000 · falta \$ 200\.000/.test(row), row);
    const href = await A.getAttribute("#lista-cobros .cobro__pagos a", "href");
    const msg = decodeURIComponent(href.split("text=")[1]);
    expect(href.startsWith("https://wa.me/5491123456789?text=") &&
      msg === "Hola Ana, te confirmo que recibimos $ 100.000 por el alquiler de octubre de Mitre 1234, 2° B (pago del 16/10/2026). Queda un saldo de $ 200.000. ¡Gracias!", msg);
  });

  await t.check("one reminder lists every month owed; the month's own reminder says what is left; the list remembers it was sent", async () => {
    const own = decodeURIComponent((await A.getAttribute("#lista-cobros a[data-recordar]", "href")).split("text=")[1]);
    expect(own === "Hola Ana, ¿cómo estás? Te escribo porque el alquiler de octubre de Mitre 1234, 2° B venció el 10 de octubre y todavía no lo tenemos registrado. Falta $ 200.000. Si ya lo pagaste, avisame así lo anoto. ¡Gracias!", own);
    const link = A.locator("#cobros-hoy-lista a[data-recordar]");
    const msg = decodeURIComponent((await link.getAttribute("href")).split("text=")[1]);
    expect(msg === "Hola Ana, ¿cómo estás? Te escribo porque tenemos pendientes los alquileres de agosto, septiembre y octubre de Mitre 1234, 2° B: son $ 800.000 en total. Si ya los pagaste, avisame así lo anoto. ¡Gracias!", msg);
    const [popup] = await Promise.all([A.waitForEvent("popup"), link.click()]);
    await popup.close();
    await A.waitForFunction(() => /avisado el 16\/10/.test(document.getElementById("cobros-hoy-lista").textContent));
  });

  await t.check("an adjustment from October changes October on, not the months before", async () => {
    await A.click("#cobros-hoy-lista button[data-contrato-ajuste]");
    await A.fill("#c-monto", "360000");
    expect(await A.isVisible("#c-rige-campo"), "asks from when");
    expect((await A.inputValue("#c-rige")) === "2026-10", await A.inputValue("#c-rige"));
    await A.click("#btn-guardar-contrato");
    await A.waitForSelector("#form-contrato", { state: "hidden" });
    const row = await text(A, "#lista-cobros .cobro");
    expect(/vence 10\/10 \$ 360\.000/.test(row) && /falta \$ 260\.000/.test(row), row);
    expect(/agosto \(\$ 300\.000\), septiembre \(\$ 300\.000\)/.test(row), "earlier months changed: " + row);
    expect(!(await hoyItems(A)).some((x) => /Toca ajustar/.test(x)), "adjustment still due");
  });

  await t.check("earlier debts link to their month; another month can be browsed", async () => {
    await A.click("#lista-cobros .cobro__deuda button >> text=agosto");
    expect((await text(A, "#cobros-titulo")) === "Agosto 2026", await text(A, "#cobros-titulo"));
    expect(/Vencido hace 67 días/.test(await text(A, "#lista-cobros .cobro")), await text(A, "#lista-cobros .cobro"));
    await A.click("#cobros-ant");
    expect(/Pagado/.test(await text(A, "#lista-cobros .cobro")), "July paid");
    await A.click("#cobros-ant");
    expect(/Ningún contrato cobra alquiler en junio 2026/.test(await text(A, "#cobros-vacio")), await text(A, "#cobros-vacio"));
    await A.click("#cobros-este-mes");
  });

  await t.check("editing a payment updates its income; deleting it removes the income", async () => {
    await A.click("#lista-cobros button[data-editar-pago]");
    expect(await A.isHidden("#p-conta-campo"), "no second income on edit");
    await A.fill("#p-monto", "150000");
    await A.click("#btn-guardar-pago");
    await A.waitForSelector("#form-pago", { state: "hidden" });
    let movs = await local(A, "te_movs");
    expect(movs.some((m) => m.monto === 150000 && /octubre/.test(m.descripcion)), JSON.stringify(movs));
    await A.click("#lista-cobros button[data-editar-pago]");
    await A.click("#btn-eliminar-pago");
    await A.waitForSelector("#form-pago", { state: "hidden" });
    movs = await local(A, "te_movs");
    expect(movs.length === 1 && /julio/.test(movs[0].descripcion), JSON.stringify(movs.map((m) => m.descripcion)));
    expect(/También se borra el ingreso/.test(A.dialogs[A.dialogs.length - 1]), "confirm text");
  });

  await t.check("Contabilidad shows the rent as income for the property", async () => {
    await A.click("#tab-conta");
    expect(/Alquiler julio 2026 — Ana Pérez/.test(await text(A, "#lista-movs")), await text(A, "#lista-movs"));
    await A.click("#tab-cobros");
  });

  await t.check("another phone sees the contract and payments, and who made them", async () => {
    await A.waitForTimeout(1800);
    await A.evaluate(() => TE_DATOS.sincronizar());
    const B = await phone(browser, site, { name: "B", email: "mauro@example.com", clock: HOY });
    await B.evaluate(() => TE_DATOS.sincronizar());
    await B.click("#tab-cobros");
    expect((await text(B, "#badge-cobros")) === "1", "badge on B " + await text(B, "#badge-cobros"));
    const row = await text(B, "#lista-cobros .cobro");
    expect(/Ana Pérez/.test(row) && /\$ 360\.000/.test(row), row);
    await B.click("#cobros-ant"); await B.click("#cobros-ant"); await B.click("#cobros-ant");
    expect(/Último cambio: gerardo · /.test(await text(B, "#lista-cobros .cobro__pagos")), await text(B, "#lista-cobros .cobro__pagos"));
    expect(!B.errors.length, B.errors.join(" | "));
    await B.ctx.close();
  });

  await t.check("a finished contract leaves today's list and moves to the finished ones", async () => {
    await A.click("#lista-cobros button[data-editar-contrato]");
    await A.selectOption("#c-estado", "terminado");
    await A.click("#btn-guardar-contrato");
    await A.waitForSelector("#form-contrato", { state: "hidden" });
    const c = (await local(A, "te_contratos"))[0];
    expect(c.estado === "terminado" && c.hasta === "2026-10", JSON.stringify(c));
    expect(await A.isHidden("#badge-cobros"), "badge still shown");
    expect(/Contratos terminados \(1 ?\)/.test(await text(A, "#cobros-terminados summary")), "finished list: " + await text(A, "#cobros-terminados summary"));
    expect(/debe \$\s960\.000/.test(await A.textContent("#lista-terminados")), await text(A, "#lista-terminados"));
  });

  await t.check("payments export to Excel and are in the full backup", async () => {
    const [dl] = await Promise.all([A.waitForEvent("download"), A.click("#btn-cobros-csv")]);
    const csv = fs.readFileSync(await dl.path(), "utf8");
    expect(/"Fecha de pago";"Mes";"Propiedad";"Inquilino"/.test(csv) && /"2026-10-16";"2026-07";"QLM-002";"Ana Pérez";"ARS";"300000";"Efectivo"/.test(csv), csv.slice(0, 300));
    const [bk] = await Promise.all([A.waitForEvent("download"), A.click("#btn-respaldo-todo")]);
    const backup = JSON.parse(fs.readFileSync(await bk.path(), "utf8"));
    expect(backup.datos.contratos.length === 1 && backup.datos.pagos.length === 1, JSON.stringify(Object.keys(backup.datos)));
  });

  await t.check("no JavaScript errors, and the server accepted every save", async () => {
    expect(!A.errors.length, A.errors.join(" | "));
    const bad = site.calls.filter((c) => c.startsWith("datos:") && !/:200$/.test(c));
    expect(!bad.length, bad.join(" "));
  });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
