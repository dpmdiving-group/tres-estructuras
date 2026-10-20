/* Owners of third-party rentals: their details, chosen in the contract, and
   the statement of the month (rent, commission, the property's expenses)
   sent by WhatsApp. Today is pinned to 2026-10-20.
   Run: node tests/e2e/owner-statements.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Owner statements");
const expect = t.expect;

const contrato = (id, extra) => Object.assign({ id: id, telefono: "", moneda: "ARS", dia: 10, desde: "2026-10", estado: "activo" }, extra);

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A", login: null, clock: "2026-10-20T10:00:00", promptAnswer: "María Gómez", seed: {
    te_contratos: [
      contrato("C1", { codigo: "QLM-002", inquilino: "Fabián Belizán", comision: 10, montos: [{ desde: "2026-10", monto: 730000 }] }),
      contrato("C2", { codigo: "", referencia: "Mitre 1234", inquilino: "Ana", montos: [{ desde: "2026-10", monto: 500000 }] })
    ],
    te_pagos: [
      { id: "P1", contrato: "C1", periodo: "2026-10", fecha: "2026-10-10", monto: 730000, medio: "transferencia", mov: "M1" },
      { id: "P2", contrato: "C2", periodo: "2026-10", fecha: "2026-10-05", monto: 500000, medio: "efectivo", mov: "M2" }
    ],
    te_movs: [
      { id: "M1", pago: "P1", tipo: "ingreso", categoria: "comision", fecha: "2026-10-10", monto: 73000, moneda: "ARS", codigo: "QLM-002", descripcion: "Comisión 10% del alquiler octubre 2026 — Fabián Belizán" },
      { id: "M2", pago: "P2", tipo: "ingreso", categoria: "alquiler", fecha: "2026-10-05", monto: 500000, moneda: "ARS", codigo: "", etiqueta: "Mitre 1234", descripcion: "Alquiler octubre 2026 — Ana" },
      { id: "M3", tipo: "gasto", categoria: "mano_obra", fecha: "2026-10-12", monto: 25000, moneda: "ARS", codigo: "QLM-002", descripcion: "Arreglo de canilla" },
      { id: "M4", tipo: "gasto", categoria: "materiales", fecha: "2026-10-15", monto: 9000, moneda: "ARS", codigo: "QLM-002", descripcion: "Pintura" }
    ]
  } });
  const tarjeta = (nombre) => A.$eval(".propietario:has(.propietario__nombre:text-is('" + nombre + "'))", (e) => e.innerText.replace(/\s+/g, " "));
  const local = (k) => A.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), k);

  await t.check("an owner is added with their WhatsApp and a private note", async () => {
    await A.click("#tab-conta");
    expect(/Todavía no hay propietarios/.test(await A.textContent("#lista-propietarios")), "empty hint");
    await A.click("#btn-nuevo-propietario");
    await A.fill("#o-nombre", "Juan Pérez");
    await A.fill("#o-telefono", "11 5555-1234");
    await A.fill("#o-nota", "CBU 0000003100012345678901");
    await A.click("#btn-guardar-propietario");
    await A.waitForSelector("#form-propietario", { state: "hidden" });
    expect(/Sin contratos: elegilo en su contrato, en Cobros/.test(await tarjeta("Juan Pérez")), await tarjeta("Juan Pérez"));
  });

  await t.check("Cobros: the owner is chosen in the contract, and a new one can be added from there", async () => {
    await A.click("#tab-cobros");
    await A.click("#lista-cobros .cobro:has-text('Fabián') button[data-editar-contrato]");
    const id = await A.evaluate(() => JSON.parse(localStorage.getItem("te_propietarios"))[0].id);
    await A.selectOption("#c-propietario", id);
    await A.click("#btn-guardar-contrato");
    await A.waitForSelector("#form-contrato", { state: "hidden" });
    await A.click("#lista-cobros .cobro:has-text('Ana') button[data-editar-contrato]");
    expect(/todo el alquiler va a Contabilidad/.test(await A.textContent("#c-comision-ayuda")), "own property hint");
    await A.selectOption("#c-propietario", "__nuevo");
    expect((await A.$eval("#c-propietario", (s) => s.options[s.selectedIndex].text)) === "María Gómez", "new owner not selected");
    expect(/figura completo como ingreso/.test(await A.textContent("#c-comision-ayuda")), "owner without commission hint");
    await A.click("#btn-guardar-contrato");
    await A.waitForSelector("#form-contrato", { state: "hidden" });
    const cs = await local("te_contratos");
    expect(cs.find((c) => c.id === "C1").propietario === id && cs.find((c) => c.id === "C2").propietario, JSON.stringify(cs.map((c) => c.propietario)));
    expect(/para Juan Pérez \$\s657\.000/.test((await A.textContent("#lista-cobros")).replace(/\s+/g, " ")), "owner's share on the payment");
  });

  await t.check("the statement: rent, minus the commission and the property's expenses", async () => {
    await A.click("#tab-conta");
    const j = await tarjeta("Juan Pérez");
    expect(/1 contrato/.test(j) && /A transferir \$\s623\.000/.test(j), j);
    expect(/A transferir \$\s500\.000/.test(await tarjeta("María Gómez")), await tarjeta("María Gómez"));
  });

  await t.check("an expense the agency pays can be left out of the owner's statement", async () => {
    await A.click("#lista-movs button[data-editar-mov='M4']");
    expect(await A.isVisible("#m-no-propietario"), "no checkbox for an expense on a property");
    await A.check("#m-no-propietario");
    await A.click("#btn-guardar-mov");
    await A.waitForSelector("#form-mov", { state: "hidden" });
    expect(/A transferir \$\s632\.000/.test(await tarjeta("Juan Pérez")), await tarjeta("Juan Pérez"));
    expect(/no se le descuenta al propietario/.test(await A.textContent("#lista-movs")), "the movement doesn't say so");
    await A.click("#btn-nuevo-mov");
    await A.selectOption("#m-tipo", "ingreso");
    expect(await A.isHidden("#m-no-propietario-campo"), "checkbox on an income");
    await A.click("#btn-cancelar-mov");
  });

  await t.check("'Ver detalle' lists each line", async () => {
    await A.click(".propietario:has-text('Juan Pérez') [data-ver-cierre]");
    const d = (await A.textContent(".propietario:has-text('Juan Pérez') .propietario__detalle")).replace(/\s+/g, " ");
    expect(/QLM-002 · Quilmes Centro/.test(d) && /Alquiler octubre — Fabián Belizán\+ \$\s730\.000/.test(d) && /Comisión 10%− \$\s73\.000/.test(d) && /Arreglo de canilla− \$\s25\.000/.test(d) && !/Pintura/.test(d), d);
  });

  await t.check("one tap sends it by WhatsApp with the message written, and the panel remembers it was sent", async () => {
    const href = await A.getAttribute(".propietario:has-text('Juan Pérez') [data-enviar-cierre]", "href");
    expect(href.startsWith("https://wa.me/5491155551234?text="), href.slice(0, 60));
    const msj = decodeURIComponent(href.split("?text=")[1]).replace(/ /g, " ");
    expect(msj === ["Hola Juan, te paso el cierre de octubre 2026 de Tres Estructuras.", "", "QLM-002 · Quilmes Centro",
      "+ Alquiler octubre — Fabián Belizán: $ 730.000", "− Comisión 10%: $ 73.000", "− Arreglo de canilla: $ 25.000", "",
      "Total a transferirte: $ 632.000", "Cualquier consulta, avisame."].join("\n"), msj);
    const [popup] = await Promise.all([A.ctx.waitForEvent("page"), A.click(".propietario:has-text('Juan Pérez') [data-enviar-cierre]")]);
    await popup.close();
    await A.waitForFunction(() => /Cierre enviado el 20\/10/.test(document.getElementById("lista-propietarios").textContent));
    const o = (await local("te_propietarios")).find((x) => x.nombre === "Juan Pérez");
    expect(o.enviados && o.enviados["2026-10"] === "2026-10-20" && o.nota === "CBU 0000003100012345678901", JSON.stringify(o));
  });

  await t.check("an owner without WhatsApp: the link lets you pick the contact", async () => {
    const href = await A.getAttribute(".propietario:has-text('María Gómez') [data-enviar-cierre]", "href");
    expect(href.startsWith("https://wa.me/?text="), href.slice(0, 40));
    expect(/Sin WhatsApp cargado/.test(await tarjeta("María Gómez")), "no hint");
  });

  await t.check("an expense on a property not on the site reaches its owner's statement", async () => {
    await A.click("#btn-nuevo-mov");
    await A.selectOption("#m-codigo", "et:Mitre 1234");
    await A.fill("#m-monto", "20000");
    await A.fill("#m-desc", "Plomero");
    await A.click("#btn-guardar-mov");
    await A.waitForSelector("#form-mov", { state: "hidden" });
    const m = (await local("te_movs")).find((x) => x.descripcion === "Plomero");
    expect(m.codigo === "" && m.etiqueta === "Mitre 1234", JSON.stringify(m));
    expect(/A transferir \$\s480\.000/.test(await tarjeta("María Gómez")), await tarjeta("María Gómez"));
    // Editing it keeps the property
    await A.click("#lista-movs .mov:has-text('Plomero') button[data-editar-mov]");
    expect((await A.inputValue("#m-codigo")) === "et:Mitre 1234", await A.inputValue("#m-codigo"));
    await A.click("#btn-cancelar-mov");
  });

  await t.check("another month has its own statement", async () => {
    await A.click("#conta-sig");
    expect(/Sin cobros ni gastos este mes/.test(await tarjeta("Juan Pérez")) && !/Cierre enviado/.test(await tarjeta("Juan Pérez")), await tarjeta("Juan Pérez"));
    await A.click("#conta-ant");
  });

  await t.check("an owner with contracts can't be deleted by mistake; the backup includes owners", async () => {
    await A.click(".propietario:has-text('María Gómez') [data-editar-propietario]");
    expect(/Contratos: Mitre 1234 \(Ana\)/.test(await A.textContent("#o-contratos")), await A.textContent("#o-contratos"));
    await A.click("#btn-eliminar-propietario");
    await A.waitForFunction(() => /Primero sacalo de su contrato/.test((document.querySelector(".aviso-flotante") || {}).textContent || ""));
    await A.click("#btn-cancelar-propietario");
    expect((await A.evaluate(() => TE_DATOS.respaldo().propietarios.length)) === 2, "backup");
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
