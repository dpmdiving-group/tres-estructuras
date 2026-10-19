/* Tests for admin/te-cobros.js. Run: node --test tests/ */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../admin/te-cobros.js");

const contrato = (extra) => Object.assign({
  id: "C1", codigo: "QLM-002", inquilino: "Ana Pérez", telefono: "11 2345-6789", moneda: "ARS",
  dia: 10, desde: "2026-07", montos: [{ desde: "2026-07", monto: 300000 }], estado: "activo"
}, extra || {});
const pago = (periodo, monto, extra) => Object.assign({ id: "P" + periodo + monto, contrato: "C1", periodo, monto, fecha: periodo + "-08" }, extra || {});

test("months and due dates", function () {
  assert.equal(C.sumarMeses("2026-11", 3), "2027-02");
  assert.equal(C.sumarMeses("2026-01", -1), "2025-12");
  assert.equal(C.mesesEntre("2026-10", "2027-01"), 3);
  assert.equal(C.vencimiento(contrato(), "2026-10"), "2026-10-10");
  assert.equal(C.vencimiento(contrato({ dia: 31 }), "2027-02"), "2027-02-28", "day 31 falls on the last day");
  assert.equal(C.vencimiento(contrato({ dia: "" }), "2026-10"), "2026-10-10", "default due day 10");
});

test("a month is pending, due today, overdue or paid; partial payments add up", function () {
  const c = contrato();
  assert.equal(C.estadoPeriodo(c, [], "2026-10", "2026-10-05").estado, "pendiente");
  assert.equal(C.estadoPeriodo(c, [], "2026-10", "2026-10-10").estado, "vence_hoy");
  const late = C.estadoPeriodo(c, [pago("2026-10", 100000)], "2026-10", "2026-10-16");
  assert.equal(late.estado, "vencido");
  assert.equal(late.diasAtraso, 6);
  assert.equal(late.saldo, 200000);
  assert.equal(late.parcial, true);
  const paid = C.estadoPeriodo(c, [pago("2026-10", 100000), pago("2026-10", 200000)], "2026-10", "2026-10-16");
  assert.equal(paid.estado, "pagado");
  assert.equal(paid.saldo, 0);
  assert.equal(C.estadoPeriodo(c, [pago("2026-10", "300000")], "2026-10", "2026-10-20").estado, "pagado", "a text amount still counts");
  assert.equal(C.estadoPeriodo(c, [pago("2026-10", 300000, { contrato: "C2" })], "2026-10", "2026-10-20").estado, "vencido", "another contract's payment doesn't count");
});

test("an adjustment never changes what earlier months owed", function () {
  const c = contrato();
  c.montos = C.cambiarMonto(c, 360000, "2026-10");
  assert.equal(C.montoEn(c, "2026-09"), 300000);
  assert.equal(C.montoEn(c, "2026-10"), 360000);
  assert.equal(C.montoEn(c, "2027-03"), 360000);
  // Setting it again from an earlier month replaces the later entry
  c.montos = C.cambiarMonto(c, 350000, "2026-09");
  assert.deepEqual(c.montos, [{ desde: "2026-07", monto: 300000 }, { desde: "2026-09", monto: 350000 }]);
  // The same amount adds nothing
  assert.equal(C.cambiarMonto(c, 350000, "2026-11").length, 2);
});

test("debts: every overdue month since the start, not after the end", function () {
  const c = contrato();
  const pagos = [pago("2026-07", 300000), pago("2026-09", 300000)];
  assert.deepEqual(C.deudas(c, pagos, "2026-10", "2026-10-16").map((e) => e.periodo), ["2026-08", "2026-10"]);
  assert.deepEqual(C.deudas(contrato({ hasta: "2026-08" }), pagos, "2026-10", "2026-10-16").map((e) => e.periodo), ["2026-08"]);
  assert.deepEqual(C.deudas(contrato({ desde: "" }), [], "2026-10", "2026-10-16"), []);
});

test("an adjustment is due every N months after the last change of rent", function () {
  const c = contrato({ ajusteCada: 3 });
  assert.equal(C.ajustePendiente(c, "2026-09"), null);
  assert.deepEqual(C.ajustePendiente(c, "2026-10"), { toca: "2026-10", ultimo: "2026-07", cada: 3 });
  c.montos = C.cambiarMonto(c, 360000, "2026-10");
  assert.equal(C.ajustePendiente(c, "2026-10"), null);
  assert.equal(C.ajustePendiente(c, "2027-01").toca, "2027-01");
  assert.equal(C.ajustePendiente(contrato(), "2027-01"), null, "no adjustment set");
});

test("today's list: overdue first, then due today and soon, adjustments and endings; ended contracts are left out", function () {
  const a = contrato({ id: "A", inquilino: "Ana", dia: 5 });
  const b = contrato({ id: "B", inquilino: "Beto", dia: 16 });
  const d = contrato({ id: "D", inquilino: "Dani", dia: 19, ajusteCada: 3, hasta: "2026-12" });
  const e = contrato({ id: "E", inquilino: "Eva", dia: 1 });
  const f = contrato({ id: "F", inquilino: "Fede", estado: "terminado" });
  const pagos = ["A", "B", "D", "E", "F"].flatMap((id) => ["2026-07", "2026-08", "2026-09"].map((p) => pago(p, 300000, { id: id + p, contrato: id })))
    .concat([pago("2026-10", 300000, { id: "E10", contrato: "E" })]);
  const items = C.pendientesHoy([a, b, d, e, f], pagos, "2026-10-16", { dias: 5 });
  assert.deepEqual(items.map((x) => x.tipo + ":" + x.contrato.id), ["vencido:A", "vence_hoy:B", "por_vencer:D", "ajuste:D", "fin:D"]);
  assert.equal(items[2].faltan, 3);
  // Eva's November rent (due on the 1st) shows up at the end of October
  const late = C.pendientesHoy([e], pagos, "2026-10-28", { dias: 5 });
  assert.ok(late.some((x) => x.tipo === "por_vencer" && x.periodo === "2026-11"), JSON.stringify(late.map((x) => x.tipo + x.periodo)));
});

test("the badge counts money owed and reminders not yet sent", function () {
  const c = contrato({ avisos: { "2026-10": "2026-10-07" } });
  const soon = { tipo: "por_vencer", contrato: c, periodo: "2026-10" };
  assert.equal(C.necesitaAccion(soon), false, "already reminded");
  assert.equal(C.necesitaAccion(Object.assign({}, soon, { periodo: "2026-11" })), true);
  assert.equal(C.necesitaAccion({ tipo: "vencido", contrato: c, periodo: "2026-10" }), true, "owed money stays even after a reminder");
  assert.equal(C.necesitaAccion({ tipo: "fin", contrato: c }), false);
});

test("WhatsApp messages read naturally", function () {
  const c = contrato({ referencia: "Mitre 1234, 2° B" });
  const soon = C.estadoPeriodo(c, [], "2026-10", "2026-10-07");
  assert.equal(C.mensajeRecordatorio(c, soon), "Hola Ana, ¿cómo estás? Te recuerdo que el alquiler de octubre de Mitre 1234, 2° B vence el 10 de octubre: $ 300.000. ¡Gracias!");
  const late = C.estadoPeriodo(c, [pago("2026-10", 100000)], "2026-10", "2026-10-16");
  assert.equal(C.mensajeRecordatorio(c, late), "Hola Ana, ¿cómo estás? Te escribo porque el alquiler de octubre de Mitre 1234, 2° B venció el 10 de octubre y todavía no lo tenemos registrado. Falta $ 200.000. Si ya lo pagaste, avisame así lo anoto. ¡Gracias!");
  const p = pago("2026-10", 100000);
  assert.equal(C.mensajeConstancia(contrato({ moneda: "USD" }), p, { saldo: 200000 }), "Hola Ana, te confirmo que recibimos USD 100.000 por el alquiler de octubre (pago del 8/10/2026). Queda un saldo de USD 200.000. ¡Gracias!");
  assert.equal(C.estadoPeriodo(c, [], "2026-10", "2026-10-10").estado, "vence_hoy");
  assert.match(C.mensajeRecordatorio(c, C.estadoPeriodo(c, [], "2026-10", "2026-10-10")), /hoy vence el alquiler de octubre/);
});

test("WhatsApp links accept phones typed any way", function () {
  assert.equal(C.waLink("11 2345-6789"), "https://wa.me/5491123456789");
  assert.equal(C.waLink("+54 11 2345 6789"), "https://wa.me/5491123456789");
  assert.equal(C.waLink("+54 9 11 2345-6789", "Hola"), "https://wa.me/5491123456789?text=Hola");
  assert.equal(C.waLink(""), null);
});

test("a contract entered late: months up to 'al día hasta' are not debt, unless a payment was recorded for them", function () {
  const c = contrato({ desde: "2026-01", alDiaHasta: "2026-08" });
  assert.deepEqual(C.deudas(c, [], "2026-10", "2026-10-16").map((e) => e.periodo), ["2026-09", "2026-10"]);
  const e = C.estadoPeriodo(c, [], "2026-05", "2026-10-16");
  assert.equal(e.estado, "pagado");
  assert.equal(e.previo, true);
  const partial = C.estadoPeriodo(c, [pago("2026-05", 100000)], "2026-05", "2026-10-16");
  assert.equal(partial.saldo, 200000, "a recorded payment wins over 'al día'");
});

test("today's list groups every overdue month of a tenant in one line, and one reminder lists them", function () {
  const c = contrato({ referencia: "Mitre 1234" });
  const items = C.pendientesHoy([c], [pago("2026-08", 300000)], "2026-10-16");
  const debt = items.filter((x) => x.tipo === "vencido");
  assert.equal(debt.length, 1);
  assert.deepEqual(debt[0].meses.map((m) => m.periodo), ["2026-07", "2026-09", "2026-10"]);
  assert.equal(debt[0].saldo, 900000);
  assert.equal(debt[0].periodo, "2026-07");
  assert.equal(debt[0].diasAtraso, 98);
  assert.equal(C.mensajeRecordatorio(c, debt[0]), "Hola Ana, ¿cómo estás? Te escribo porque tenemos pendientes los alquileres de julio, septiembre y octubre de Mitre 1234: son $ 900.000 en total. Si ya los pagaste, avisame así lo anoto. ¡Gracias!");
  assert.equal(C.listaMeses(["2025-12", "2026-01"]), "diciembre 2025 y enero 2026");
  assert.equal(C.ultimoAviso(contrato({ avisos: { "2026-07": "2026-10-01", "2026-09": "2026-10-12" } }), ["2026-07", "2026-09", "2026-10"]), "2026-10-12");
});

test("months marked collected from this month on, without a payment, are listed to be registered", function () {
  const a = contrato({ id: "A", desde: "2026-07", alDiaHasta: "2026-10" });
  const b = contrato({ id: "B", desde: "2026-10", alDiaHasta: "2026-11", dia: 25 });
  const c = contrato({ id: "C", desde: "2026-01", alDiaHasta: "2026-09" });   // only history: nothing to register
  const items = C.sinRegistrar([a, b, c], [pago("2026-11", 300000, { contrato: "B" })], "2026-10-19");
  assert.deepEqual(items.map((x) => x.contrato.id + ":" + x.periodo + ":" + x.fecha), ["A:2026-10:2026-10-10", "B:2026-10:2026-10-19"]);
  assert.equal(items[0].monto, 300000);
  assert.equal(C.alDiaSinActual(a, "2026-10-19"), "2026-09");
  assert.equal(C.alDiaSinActual(b, "2026-10-19"), "", "started this month: no history left");
});

test("a third-party rental puts only the commission in Contabilidad; the rest is the owner's", function () {
  const propia = contrato();
  const tercero = contrato({ comision: 10, inquilino: "Ana Pérez" });
  assert.deepEqual(C.reparto(propia, 730000), { ingreso: 730000, propietario: 0 });
  assert.deepEqual(C.reparto(tercero, 730000), { ingreso: 73000, propietario: 657000 });
  assert.deepEqual(C.reparto(contrato({ comision: 8.5 }), 333333), { ingreso: 28333.31, propietario: 304999.69 });
  const m = C.movimientoDe(tercero, { periodo: "2026-10", fecha: "2026-10-10", monto: 730000 });
  assert.equal(m.monto, 73000);
  assert.equal(m.categoria, "comision");
  assert.equal(m.descripcion, "Comisión 10% del alquiler octubre 2026 — Ana Pérez");
  assert.equal(C.movimientoDe(propia, { periodo: "2026-10", fecha: "2026-10-10", monto: 730000 }).categoria, "alquiler");
  assert.equal(C.comision(contrato({ comision: "abc" })), 0);
  assert.equal(C.comision(contrato({ comision: 150 })), 0);
});
