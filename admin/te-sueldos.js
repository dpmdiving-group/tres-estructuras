/* ============================================================
   TRES ESTRUCTURAS — Workers' pay: pure logic (no DOM)

   Used by the panel (sueldos.js) and by the Node tests. A worker's pay
   setting ("modalidad"): frecuencia (semanal, quincenal or mensual), the
   usual monto and moneda, and the pay day: a weekday (0 = domingo) for
   weekly and fortnightly pay, a day of the month for monthly pay. Dates
   are "YYYY-MM-DD", the panel's local day.
   ============================================================ */

(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TE_SUELDOS = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var FRECUENCIAS = { semanal: "Semanal", quincenal: "Cada dos semanas", mensual: "Mensual" };

  function aFecha(iso) { return new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))); }
  function aISO(d) { return d.toISOString().slice(0, 10); }
  function sumarDias(iso, n) { var d = aFecha(iso); d.setUTCDate(d.getUTCDate() + n); return aISO(d); }
  function diaSemana(iso) { return aFecha(iso).getUTCDay(); }
  function diasEntre(a, b) { return Math.round((aFecha(b) - aFecha(a)) / 86400000); }

  // The first date on that weekday from "desde" on (desde included)
  function proximoDiaSemana(desde, dia) {
    var d = desde;
    for (var i = 0; i < 7; i++) {
      if (diaSemana(d) === dia) return d;
      d = sumarDias(d, 1);
    }
    return desde;
  }
  // That day of a month, or its last day (the 31st of a 30-day month is the 30th)
  function diaDelMes(anio, mes0, dia) {
    var ultimo = new Date(Date.UTC(anio, mes0 + 1, 0)).getUTCDate();
    return aISO(new Date(Date.UTC(anio, mes0, Math.min(dia, ultimo))));
  }

  function valida(m) { return !!(m && FRECUENCIAS[m.frecuencia]); }

  /* When the next payment is due, given the date of the last one ("" if
     none yet). A payment a few days early or late still counts for that
     pay day, so the next one is the following period's. */
  function proximoPago(m, ultimo, hoy) {
    if (!valida(m)) return "";
    var dia = Number(m.dia);
    if (m.frecuencia === "mensual") {
      dia = dia >= 1 && dia <= 31 ? dia : 1;
      var base = ultimo ? sumarDias(ultimo, 10) : sumarDias(hoy, -1);
      var b = aFecha(base);
      var candidato = diaDelMes(b.getUTCFullYear(), b.getUTCMonth(), dia);
      if (candidato <= base) candidato = diaDelMes(b.getUTCFullYear(), b.getUTCMonth() + 1, dia);
      return candidato;
    }
    dia = dia >= 0 && dia <= 6 ? dia : 5;
    if (!ultimo) return proximoDiaSemana(hoy, dia);
    var paso = m.frecuencia === "quincenal" ? 14 : 7;
    return proximoDiaSemana(sumarDias(ultimo, paso - 3), dia);
  }

  // "viernes 24/10"
  function fechaConDia(iso) {
    return DIAS[diaSemana(iso)] + " " + parseInt(iso.slice(8, 10), 10) + "/" + parseInt(iso.slice(5, 7), 10);
  }

  /* What the panel says about the next payment: {tipo, texto}, tipo one of
     "atrasado", "hoy", "pronto" (within 3 days), "" */
  function aviso(proximo, hoy) {
    if (!proximo) return { tipo: "", texto: "" };
    var d = diasEntre(hoy, proximo);
    if (d < 0) return { tipo: "atrasado", texto: "Atrasado: le tocaba el " + fechaConDia(proximo) };
    if (d === 0) return { tipo: "hoy", texto: "Le toca hoy" };
    return { tipo: d <= 3 ? "pronto" : "", texto: "Le toca el " + fechaConDia(proximo) };
  }

  function formato(n, moneda) {
    return (moneda === "USD" ? "USD " : "$ ") + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(Number(n) || 0);
  }

  // "Semanal · $ 150.000 · los viernes"
  function textoModalidad(m) {
    if (!valida(m)) return "";
    var partes = [FRECUENCIAS[m.frecuencia]];
    if (Number(m.monto) > 0) partes.push(formato(m.monto, m.moneda));
    if (m.frecuencia === "mensual") partes.push("el día " + (Number(m.dia) >= 1 && Number(m.dia) <= 31 ? Number(m.dia) : 1));
    else {
      var d = Number(m.dia) >= 0 && Number(m.dia) <= 6 ? Number(m.dia) : 5;
      partes.push("los " + DIAS[d] + (d === 0 || d === 6 ? "s" : ""));   // los viernes, los sábados
    }
    return partes.join(" · ");
  }

  // Paid in a month ("2026-10"), each currency apart
  function totalesMes(pagos, mes) {
    var t = {};
    (pagos || []).forEach(function (p) {
      if (String(p.fecha || "").slice(0, 7) !== mes) return;
      var mon = p.moneda || "ARS";
      t[mon] = Math.round(((t[mon] || 0) + (Number(p.monto) || 0)) * 100) / 100;
    });
    return t;
  }

  // What a payment puts in Contabilidad
  function movimientoDe(pago, nombre) {
    return {
      tipo: "gasto",
      categoria: "sueldos",
      fecha: pago.fecha,
      monto: Number(pago.monto) || 0,
      moneda: pago.moneda || "ARS",
      codigo: "",
      descripcion: "Sueldo — " + (String(nombre || "").trim() || "trabajador") + (pago.nota ? " (" + String(pago.nota).trim() + ")" : ""),
      sueldo: pago.id
    };
  }

  return {
    DIAS: DIAS,
    FRECUENCIAS: FRECUENCIAS,
    sumarDias: sumarDias,
    proximoPago: proximoPago,
    fechaConDia: fechaConDia,
    aviso: aviso,
    formato: formato,
    textoModalidad: textoModalidad,
    totalesMes: totalesMes,
    movimientoDe: movimientoDe
  };
});
