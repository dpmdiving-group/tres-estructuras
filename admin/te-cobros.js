/* ============================================================
   TRES ESTRUCTURAS — Rent collection: the calculations

   A rental contract ("contrato") has a monthly rent, a due day
   and a start month; optionally an end month and an adjustment
   every N months. Its rent history lives in "montos"
   ([{desde: "2026-01", monto: 300000}, ...]) so an adjustment
   never rewrites what was owed in earlier months.

   A payment ("pago") belongs to one contract and one month
   ("periodo", "YYYY-MM"); a month can be paid in several parts.
   A contract entered after it started says up to which month it
   was already collected ("alDiaHasta"): those months are not debt.

   Everything here is pure (no DOM, no storage) and takes today's
   date as "YYYY-MM-DD", so the Node tests can pin the calendar.
   The panel's Cobros tab (admin/cobros.js) draws it.
   ============================================================ */

(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TE_COBROS = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

  /* ---------- Months and dates ---------- */

  function pad(n) { return String(n).padStart(2, "0"); }

  function periodoDe(fecha) { return String(fecha || "").slice(0, 7); }

  function sumarMeses(periodo, n) {
    var total = parseInt(periodo.slice(0, 4), 10) * 12 + parseInt(periodo.slice(5, 7), 10) - 1 + n;
    return Math.floor(total / 12) + "-" + pad(total % 12 + 1);
  }

  // How many months from a to b (b later = positive)
  function mesesEntre(a, b) {
    return (parseInt(b.slice(0, 4), 10) - parseInt(a.slice(0, 4), 10)) * 12 +
      parseInt(b.slice(5, 7), 10) - parseInt(a.slice(5, 7), 10);
  }

  function diasEntre(a, b) {
    var ua = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
    var ub = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
    return Math.round((ub - ua) / 86400000);
  }

  function nombreMes(periodo) { return MESES[parseInt(periodo.slice(5, 7), 10) - 1] || ""; }

  // "10 de octubre"
  function fechaLarga(fecha) { return parseInt(fecha.slice(8, 10), 10) + " de " + nombreMes(fecha); }

  // "10/10"
  function fechaCorta(fecha) { return parseInt(fecha.slice(8, 10), 10) + "/" + parseInt(fecha.slice(5, 7), 10); }

  /* ---------- One contract ---------- */

  function activo(c) { return !!c && c.estado !== "terminado"; }

  // Does the contract charge rent for this month?
  function correEn(c, periodo) {
    return !!c && PERIODO.test(c.desde || "") && periodo >= c.desde && (!c.hasta || periodo <= c.hasta);
  }

  function montosOrdenados(c) {
    return (Array.isArray(c && c.montos) ? c.montos : [])
      .filter(function (x) { return x && PERIODO.test(x.desde || ""); })
      .slice().sort(function (a, b) { return a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0; });
  }

  // The rent that applied in that month
  function montoEn(c, periodo) {
    var lista = montosOrdenados(c);
    if (!lista.length) return Number(c && c.monto) || 0;
    var monto = Number(lista[0].monto) || 0;
    lista.forEach(function (x) { if (x.desde <= periodo) monto = Number(x.monto) || 0; });
    return monto;
  }

  // New rent from month "desde" on; later entries are replaced by it
  function cambiarMonto(c, monto, desde) {
    var lista = montosOrdenados(c).filter(function (x) { return x.desde < desde; });
    if (lista.length && Number(lista[lista.length - 1].monto) === Number(monto)) return lista;
    return lista.concat([{ desde: desde, monto: Number(monto) }]);
  }

  // Due date of a month; a due day 31 falls on the last day of shorter months
  function vencimiento(c, periodo) {
    var dia = Math.min(Math.max(parseInt(c && c.dia, 10) || 10, 1), 31);
    var ultimo = new Date(Date.UTC(+periodo.slice(0, 4), +periodo.slice(5, 7), 0)).getUTCDate();
    return periodo + "-" + pad(Math.min(dia, ultimo));
  }

  // Collected before the contract was entered in the panel
  function previo(c, periodo) {
    return !!c && PERIODO.test(c.alDiaHasta || "") && periodo <= c.alDiaHasta;
  }

  function pagosDe(c, pagos, periodo) {
    return (pagos || []).filter(function (p) { return p && p.contrato === c.id && p.periodo === periodo; })
      .sort(function (a, b) { return String(a.fecha) < String(b.fecha) ? -1 : 1; });
  }

  /* One month of one contract:
     {periodo, debe, pagado, saldo, vence, estado, diasAtraso, parcial, pagos}
     estado: "pagado" | "pendiente" | "vence_hoy" | "vencido" */
  function estadoPeriodo(c, pagos, periodo, hoy) {
    var debe = montoEn(c, periodo);
    var lista = pagosDe(c, pagos, periodo);
    var pagado = Math.round(lista.reduce(function (s, p) { return s + (Number(p.monto) || 0); }, 0) * 100) / 100;
    var antes = previo(c, periodo) && !lista.length;
    if (antes) pagado = debe;
    var saldo = Math.max(0, Math.round((debe - pagado) * 100) / 100);
    var vence = vencimiento(c, periodo);
    var estado = "pendiente";
    var dias = 0;
    if (saldo <= 0) estado = "pagado";
    else if (hoy > vence) { estado = "vencido"; dias = diasEntre(vence, hoy); }
    else if (hoy === vence) estado = "vence_hoy";
    return {
      periodo: periodo, debe: debe, pagado: pagado, saldo: saldo, vence: vence,
      estado: estado, diasAtraso: dias, parcial: pagado > 0 && saldo > 0, pagos: lista, previo: antes
    };
  }

  // Months already overdue with something still owed, oldest first, up to "hasta"
  function deudas(c, pagos, hasta, hoy) {
    var out = [];
    if (!c || !PERIODO.test(c.desde || "")) return out;
    var fin = c.hasta && c.hasta < hasta ? c.hasta : hasta;
    for (var p = c.desde, n = 0; p <= fin && n < 600; p = sumarMeses(p, 1), n++) {
      var e = estadoPeriodo(c, pagos, p, hoy);
      if (e.estado === "vencido") out.push(e);
    }
    return out;
  }

  // The rent is due for an adjustment from this month on (every "ajusteCada" months)
  function ajustePendiente(c, periodo) {
    var cada = parseInt(c && c.ajusteCada, 10);
    if (!(cada > 0) || !correEn(c, periodo)) return null;
    var desde = c.desde;
    montosOrdenados(c).forEach(function (x) { if (x.desde <= periodo) desde = x.desde; });
    var toca = sumarMeses(desde, cada);
    return periodo >= toca ? { toca: toca, ultimo: desde, cada: cada } : null;
  }

  /* ---------- Everything to do today ----------
     [{tipo, contrato, ...}] tipo: "vencido" (one per contract: every
     overdue month in "meses", total in "saldo", oldest in "periodo"),
     "vence_hoy", "por_vencer" (due within "dias" days), "ajuste",
     "fin" (contract ends within two months). Most urgent first. */
  function pendientesHoy(contratos, pagos, hoy, opciones) {
    var dias = opciones && opciones.dias >= 0 ? opciones.dias : 5;
    var periodoHoy = periodoDe(hoy);
    var out = [];
    (contratos || []).filter(activo).forEach(function (c) {
      var ds = deudas(c, pagos, periodoHoy, hoy);
      if (ds.length) {
        var total = Math.round(ds.reduce(function (s, d) { return s + d.saldo; }, 0) * 100) / 100;
        out.push(Object.assign({}, ds[0], { tipo: "vencido", contrato: c, meses: ds, saldo: total }));
      }
      // This month and next (a rent due on the 1st is close at the end of the month)
      [periodoHoy, sumarMeses(periodoHoy, 1)].forEach(function (p) {
        if (!correEn(c, p)) return;
        var e = estadoPeriodo(c, pagos, p, hoy);
        if (e.estado === "vence_hoy") out.push(Object.assign({ tipo: "vence_hoy", contrato: c }, e));
        else if (e.estado === "pendiente" && diasEntre(hoy, e.vence) <= dias) {
          out.push(Object.assign({ tipo: "por_vencer", contrato: c, faltan: diasEntre(hoy, e.vence) }, e));
        }
      });
      var aj = ajustePendiente(c, periodoHoy);
      if (aj) out.push(Object.assign({ tipo: "ajuste", contrato: c }, aj));
      if (c.hasta && PERIODO.test(c.hasta)) {
        var faltan = mesesEntre(periodoHoy, c.hasta);
        if (faltan >= 0 && faltan <= 2) out.push({ tipo: "fin", contrato: c, hasta: c.hasta, meses: faltan });
      }
    });
    var orden = { vencido: 0, vence_hoy: 1, por_vencer: 2, ajuste: 3, fin: 4 };
    return out.sort(function (a, b) {
      return orden[a.tipo] - orden[b.tipo] || String(a.vence || "").localeCompare(String(b.vence || ""));
    });
  }

  /* Months marked collected with "al día hasta" from the current month on.
     They count as paid but have no payment, so Contabilidad never saw them:
     [{contrato, periodo, monto, fecha}] (fecha: the due date, or today if it
     hasn't come yet), to be registered as payments. Earlier months stay as
     history from before the panel. */
  function sinRegistrar(contratos, pagos, hoy) {
    var actual = periodoDe(hoy);
    var out = [];
    (contratos || []).forEach(function (c) {
      if (!c || !PERIODO.test(c.alDiaHasta || "") || c.alDiaHasta < actual || !PERIODO.test(c.desde || "")) return;
      for (var p = c.desde > actual ? c.desde : actual, n = 0; p <= c.alDiaHasta && n < 60; p = sumarMeses(p, 1), n++) {
        if (!correEn(c, p) || pagosDe(c, pagos, p).length) continue;
        var vence = vencimiento(c, p);
        out.push({ contrato: c, periodo: p, monto: montoEn(c, p), fecha: vence <= hoy ? vence : hoy });
      }
    });
    return out;
  }

  // After registering them, "al día hasta" goes back to history (last month)
  function alDiaSinActual(c, hoy) {
    var pasado = sumarMeses(periodoDe(hoy), -1);
    return c.desde && pasado >= c.desde ? pasado : "";
  }

  /* Third-party rentals: the agency keeps a commission ("comision", % of
     each payment) and passes the rest to the owner. Only the commission is
     the agency's income, so only it goes to Contabilidad. A contract
     without a commission is the agency's own: the whole payment is income. */
  function comision(c) {
    var n = Number(c && c.comision);
    return n > 0 && n <= 100 ? n : 0;
  }

  function dosDecimales(n) { return Math.round(n * 100) / 100; }

  // {ingreso, propietario} of a payment of this contract
  function reparto(c, monto) {
    var total = Number(monto) || 0;
    var pct = comision(c);
    var ingreso = pct ? dosDecimales(total * pct / 100) : total;
    return { ingreso: ingreso, propietario: dosDecimales(total - ingreso) };
  }

  // What a payment puts in Contabilidad
  function movimientoDe(c, pago) {
    var pct = comision(c);
    var mes = nombreMes(pago.periodo) + " " + String(pago.periodo).slice(0, 4);
    return {
      tipo: "ingreso",
      categoria: pct ? "comision" : "alquiler",
      fecha: pago.fecha,
      monto: reparto(c, pago.monto).ingreso,
      moneda: c.moneda || "ARS",
      codigo: c.codigo || "",
      descripcion: (pct ? "Comisión " + String(pct).replace(".", ",") + "% del alquiler " : "Alquiler ") + mes + " — " + (c.inquilino || "")
    };
  }

  // Already reminded about this month? (contract.avisos: {periodo: date})
  function avisado(c, periodo) { return (c && c.avisos && c.avisos[periodo]) || null; }

  // The latest reminder about any of these months, or null
  function ultimoAviso(c, periodos) {
    return periodos.map(function (p) { return avisado(c, p); }).filter(Boolean).sort().pop() || null;
  }

  // What the tab's badge counts: money owed, reminders not yet sent, adjustments due
  function necesitaAccion(item) {
    if (item.tipo === "vencido" || item.tipo === "ajuste") return true;
    if (item.tipo === "vence_hoy" || item.tipo === "por_vencer") return !avisado(item.contrato, item.periodo);
    return false;
  }

  /* ---------- Money and messages ---------- */

  function formato(n, moneda) {
    var simbolo = moneda === "USD" ? "USD " : (!moneda || moneda === "ARS") ? "$ " : moneda + " ";
    return simbolo + new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(Number(n) || 0);
  }

  function primerNombre(nombre) { return String(nombre || "").trim().split(/\s+/)[0] || ""; }

  function saludo(c) {
    var n = primerNombre(c.inquilino);
    return "Hola" + (n ? " " + n : "") + ", ¿cómo estás? ";
  }

  function delAlquiler(c, periodo) {
    return "el alquiler de " + nombreMes(periodo) + (c.referencia ? " de " + String(c.referencia).trim() : "");
  }

  // "julio, agosto y septiembre" (with the year when they span more than one)
  function listaMeses(periodos) {
    var anios = periodos.map(function (p) { return p.slice(0, 4); });
    var conAnio = anios.some(function (a) { return a !== anios[0]; });
    var nombres = periodos.map(function (p) { return nombreMes(p) + (conAnio ? " " + p.slice(0, 4) : ""); });
    return nombres.length > 1 ? nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1] : nombres[0] || "";
  }

  function mensajeRecordatorio(c, e) {
    if (e.meses && e.meses.length > 1) {
      return saludo(c) + "Te escribo porque tenemos pendientes los alquileres de " +
        listaMeses(e.meses.map(function (m) { return m.periodo; })) + (c.referencia ? " de " + String(c.referencia).trim() : "") +
        ": son " + formato(e.saldo, c.moneda) + " en total. Si ya los pagaste, avisame así lo anoto. ¡Gracias!";
    }
    var que = delAlquiler(c, e.periodo);
    var cuanto = formato(e.saldo, c.moneda);
    if (e.estado === "vencido") {
      return saludo(c) + "Te escribo porque " + que + " venció el " + fechaLarga(e.vence) +
        " y todavía no lo tenemos registrado. " + (e.pagado > 0 ? "Falta " : "Son ") + cuanto +
        ". Si ya lo pagaste, avisame así lo anoto. ¡Gracias!";
    }
    if (e.estado === "vence_hoy") return saludo(c) + "Te recuerdo que hoy vence " + que + ": " + cuanto + ". ¡Gracias!";
    return saludo(c) + "Te recuerdo que " + que + " vence el " + fechaLarga(e.vence) + ": " + cuanto + ". ¡Gracias!";
  }

  // A payment confirmation sent by WhatsApp (not a legal or tax receipt)
  function mensajeConstancia(c, pago, e) {
    var f = String(pago.fecha || "");
    return "Hola" + (primerNombre(c.inquilino) ? " " + primerNombre(c.inquilino) : "") + ", te confirmo que recibimos " +
      formato(pago.monto, c.moneda) + " por " + delAlquiler(c, pago.periodo) +
      (f ? " (pago del " + parseInt(f.slice(8, 10), 10) + "/" + parseInt(f.slice(5, 7), 10) + "/" + f.slice(0, 4) + ")" : "") + ". " +
      (e && e.saldo > 0 ? "Queda un saldo de " + formato(e.saldo, c.moneda) + "." : "El mes queda pagado.") + " ¡Gracias!";
  }

  // wa.me link to an Argentine phone typed any way (11 2345-6789, +54 9 11..., 15...)
  function waLink(telefono, texto) {
    var d = String(telefono || "").replace(/\D/g, "");
    if (!d) return null;
    if (d.length === 10) d = "549" + d;
    else if (d.length === 12 && d.slice(0, 2) === "54") d = "549" + d.slice(2);
    return "https://wa.me/" + d + (texto ? "?text=" + encodeURIComponent(texto) : "");
  }

  return {
    MESES: MESES,
    periodoDe: periodoDe,
    sumarMeses: sumarMeses,
    mesesEntre: mesesEntre,
    diasEntre: diasEntre,
    nombreMes: nombreMes,
    fechaCorta: fechaCorta,
    activo: activo,
    correEn: correEn,
    montoEn: montoEn,
    cambiarMonto: cambiarMonto,
    vencimiento: vencimiento,
    estadoPeriodo: estadoPeriodo,
    deudas: deudas,
    ajustePendiente: ajustePendiente,
    pendientesHoy: pendientesHoy,
    avisado: avisado,
    comision: comision,
    reparto: reparto,
    movimientoDe: movimientoDe,
    sinRegistrar: sinRegistrar,
    alDiaSinActual: alDiaSinActual,
    ultimoAviso: ultimoAviso,
    listaMeses: listaMeses,
    necesitaAccion: necesitaAccion,
    formato: formato,
    mensajeRecordatorio: mensajeRecordatorio,
    mensajeConstancia: mensajeConstancia,
    waLink: waLink
  };
});
