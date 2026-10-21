/* Tests for admin/te-sueldos.js: when each worker's next pay is due.
   Run: node --test tests/ */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../admin/te-sueldos.js");

const HOY = "2026-10-21";   // a Wednesday
const semanal = { frecuencia: "semanal", dia: 5, monto: 150000, moneda: "ARS" };   // Fridays

test("weekly: the next Friday; a payment a few days early or late counts for that Friday", () => {
  assert.equal(S.proximoPago(semanal, "", HOY), "2026-10-23");
  assert.equal(S.proximoPago(semanal, "2026-10-16", HOY), "2026-10-23");
  assert.equal(S.proximoPago(semanal, "2026-10-21", HOY), "2026-10-30", "paid on Wednesday for this Friday");
  assert.equal(S.proximoPago(semanal, "2026-10-18", HOY), "2026-10-23", "paid on Saturday for last Friday");
  assert.equal(S.proximoPago(semanal, "2026-10-09", HOY), "2026-10-16", "missed a week: still due");
});

test("fortnightly and monthly", () => {
  const quincenal = { frecuencia: "quincenal", dia: 5 };
  assert.equal(S.proximoPago(quincenal, "2026-10-16", HOY), "2026-10-30");
  assert.equal(S.proximoPago(quincenal, "", HOY), "2026-10-23");
  const mensual = { frecuencia: "mensual", dia: 5 };
  assert.equal(S.proximoPago(mensual, "", HOY), "2026-11-05");
  assert.equal(S.proximoPago(mensual, "2026-10-03", HOY), "2026-11-05", "paid two days early");
  assert.equal(S.proximoPago(mensual, "2026-10-12", HOY), "2026-11-05", "paid a week late");
  assert.equal(S.proximoPago({ frecuencia: "mensual", dia: 25 }, "", HOY), "2026-10-25");
  assert.equal(S.proximoPago({ frecuencia: "mensual", dia: 31 }, "2026-10-31", "2026-11-02"), "2026-11-30", "the 31st of November is the 30th");
  assert.equal(S.proximoPago(null, "", HOY), "");
});

test("what the panel says", () => {
  assert.deepEqual(S.aviso("2026-10-16", HOY), { tipo: "atrasado", texto: "Atrasado: le tocaba el viernes 16/10" });
  assert.deepEqual(S.aviso(HOY, HOY), { tipo: "hoy", texto: "Le toca hoy" });
  assert.deepEqual(S.aviso("2026-10-23", HOY), { tipo: "pronto", texto: "Le toca el viernes 23/10" });
  assert.equal(S.aviso("2026-11-05", HOY).tipo, "");
  const n = (s) => s.replace(/ /g, " ");
  assert.equal(n(S.textoModalidad(semanal)), "Semanal · $ 150.000 · los viernes");
  assert.equal(n(S.textoModalidad({ frecuencia: "quincenal", dia: 6, monto: 300, moneda: "USD" })), "Cada dos semanas · USD 300 · los sábados");
  assert.equal(S.textoModalidad({ frecuencia: "mensual", dia: 5 }), "Mensual · el día 5");
});

test("month totals per currency, and what a payment puts in Contabilidad", () => {
  const pagos = [{ fecha: "2026-10-03", monto: 150000, moneda: "ARS" }, { fecha: "2026-10-10", monto: 150000 }, { fecha: "2026-09-26", monto: 1 }, { fecha: "2026-10-31", monto: 200, moneda: "USD" }];
  assert.deepEqual(S.totalesMes(pagos, "2026-10"), { ARS: 300000, USD: 200 });
  assert.deepEqual(S.movimientoDe({ id: "S1", fecha: "2026-10-23", monto: "150000", nota: "con horas extra" }, "Pancho"),
    { tipo: "gasto", categoria: "sueldos", fecha: "2026-10-23", monto: 150000, moneda: "ARS", codigo: "", descripcion: "Sueldo — Pancho (con horas extra)", sueldo: "S1" });
});
