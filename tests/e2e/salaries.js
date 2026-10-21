/* Workers' pay ("Sueldos" in Trabajos): each worker's pay setting, when the
   next payment is due, and payments that also go to Contabilidad and
   follow it when edited or deleted. Today is pinned to Wednesday
   2026-10-21. Run: node tests/e2e/salaries.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Workers' pay");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A", login: null, clock: "2026-10-21T10:00:00", seed: {
    te_trabajadores: [{ id: "T1", nombre: "Pancho", telefono: "1111" }, { id: "T2", nombre: "Rosa", telefono: "2222" }],
    // Rosa: weekly on Fridays, last paid on the 9th, so last Friday's pay is missing
    te_sueldos: [
      { id: "M-T2", tipo: "modalidad", trabajador: "T2", frecuencia: "semanal", dia: 5, monto: 120000, moneda: "ARS" },
      { id: "S0", tipo: "pago", trabajador: "T2", fecha: "2026-10-09", monto: 120000, moneda: "ARS" }
    ]
  } });
  const fila = (nombre) => A.$eval(".sueldo:has(strong:text-is('" + nombre + "'))", (e) => e.innerText.replace(/\s+/g, " "));
  const local = (k) => A.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), k);

  await t.check("'Sueldos' lists each worker: without a pay setting yet, or overdue", async () => {
    await A.click("#tab-trabajos");
    await A.click("#btn-sueldos");
    expect(/Sin modalidad/.test(await fila("Pancho")), await fila("Pancho"));
    const r = await fila("Rosa");
    expect(/Semanal · \$\s120\.000 · los viernes/.test(r) && /Atrasado: le tocaba el viernes 16\/10/.test(r) && /Último pago: 9\/10/.test(r), r);
    expect(await A.$eval(".sueldo:has(strong:text-is('Rosa')) .sueldo__aviso", (e) => e.classList.contains("sueldo__aviso--atrasado")), "not marked as overdue");
  });

  await t.check("a pay setting is chosen per worker, and can change", async () => {
    await A.click(".sueldo:has(strong:text-is('Pancho')) [data-modalidad]");
    await A.selectOption("#sm-frecuencia", "semanal");
    await A.selectOption("#sm-dia-semana", "5");
    await A.fill("#sm-monto", "150000");
    await A.click("#btn-guardar-modalidad");
    await A.waitForSelector("#form-sueldo-modalidad", { state: "hidden" });
    let p = await fila("Pancho");
    expect(/Semanal · \$\s150\.000 · los viernes/.test(p) && /Le toca el viernes 23\/10/.test(p), p);
    // Monthly instead: the day of the month
    await A.click(".sueldo:has(strong:text-is('Pancho')) [data-modalidad]");
    await A.selectOption("#sm-frecuencia", "mensual");
    expect(await A.isVisible("#sm-dia-mes") && await A.isHidden("#sm-dia-semana"), "day of the month field");
    await A.fill("#sm-dia-mes", "5");
    await A.click("#btn-guardar-modalidad");
    p = await fila("Pancho");
    expect(/Mensual · \$\s150\.000 · el día 5/.test(p) && /Le toca el jueves 5\/11/.test(p), p);
    // Back to weekly
    await A.click(".sueldo:has(strong:text-is('Pancho')) [data-modalidad]");
    await A.selectOption("#sm-frecuencia", "semanal");
    await A.click("#btn-guardar-modalidad");
  });

  await t.check("a payment comes with the usual amount, goes to Contabilidad, and moves the next due date", async () => {
    await A.click(".sueldo:has(strong:text-is('Pancho')) [data-pagar]");
    expect((await A.inputValue("#sp-monto")) === "150000" && (await A.inputValue("#sp-fecha")) === "2026-10-21" && await A.isChecked("#sp-conta"), "prefill");
    await A.fill("#sp-nota", "con horas extra");
    await A.fill("#sp-monto", "165000");
    await A.click("#btn-guardar-sueldo");
    await A.waitForSelector("#form-sueldo-pago", { state: "hidden" });
    const p = await fila("Pancho");
    expect(/Último pago: 21\/10 · \$\s165\.000/.test(p) && /Le toca el viernes 30\/10/.test(p), p);
    const mov = (await local("te_movs")).find((m) => m.categoria === "sueldos");
    expect(mov && mov.tipo === "gasto" && mov.monto === 165000 && mov.descripcion === "Sueldo — Pancho (con horas extra)" && mov.fecha === "2026-10-21", JSON.stringify(mov));
    // Rosa's payment on the 9th counts too
    expect(/Este mes: \$\s285\.000/.test(await A.textContent("#sueldos-mes")), await A.textContent("#sueldos-mes"));
  });

  await t.check("Contabilidad shows it under 'Sueldos'", async () => {
    await A.click("#tab-conta");
    const l = (await A.textContent("#lista-movs")).replace(/\s+/g, " ");
    expect(/Sueldos/.test(l) && /Sueldo — Pancho \(con horas extra\)/.test(l), l.slice(0, 300));
    await A.click("#tab-trabajos");
  });

  await t.check("editing a payment updates Contabilidad; deleting it takes it out too", async () => {
    await A.click(".sueldo:has(strong:text-is('Pancho')) [data-ver-pagos]");
    await A.click(".sueldo:has(strong:text-is('Pancho')) [data-editar-pago]");
    await A.fill("#sp-monto", "160000");
    await A.click("#btn-guardar-sueldo");
    await A.waitForSelector("#form-sueldo-pago", { state: "hidden" });
    let movs = (await local("te_movs")).filter((m) => m.categoria === "sueldos");
    expect(movs.length === 1 && movs[0].monto === 160000, JSON.stringify(movs));
    await A.click(".sueldo:has(strong:text-is('Pancho')) [data-editar-pago]");
    await A.click("#btn-eliminar-sueldo");
    await A.waitForSelector("#form-sueldo-pago", { state: "hidden" });
    movs = (await local("te_movs")).filter((m) => m.categoria === "sueldos");
    expect(!movs.length && /Todavía sin pagos/.test(await fila("Pancho")), JSON.stringify(movs));
    expect(/Confirm|Eliminar el pago/.test(A.dialogs.join(" ")) && /se borra el gasto en Contabilidad/.test(A.dialogs.join(" ")), A.dialogs.join(" | "));
  });

  await t.check("a payment left out of Contabilidad says so", async () => {
    await A.click(".sueldo:has(strong:text-is('Rosa')) [data-pagar]");
    await A.uncheck("#sp-conta");
    await A.click("#btn-guardar-sueldo");
    await A.click(".sueldo:has(strong:text-is('Rosa')) [data-ver-pagos]");
    expect(/no está en Contabilidad/.test(await fila("Rosa")), await fila("Rosa"));
    expect(!(await local("te_movs")).some((m) => m.categoria === "sueldos"), "it went to Contabilidad");
    expect(!/Atrasado/.test(await fila("Rosa")), "still overdue after paying");
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
