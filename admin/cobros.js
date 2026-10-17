/* ============================================================
   TRES ESTRUCTURAS — Panel tab "Cobros": rent collection

   Rental contracts and each month's payments: what is paid, what
   is overdue (this month and earlier ones), reminders and payment
   confirmations by WhatsApp (one tap, sent from the owner's own
   WhatsApp), rent adjustments that are due and contracts about to
   end. The calculations live in te-cobros.js.

   Contracts and payments are shared between phones like the rest
   of the panel data (te-datos.js). A payment can also be recorded
   as an income in Contabilidad (TE_CONTA), and editing or deleting
   the payment keeps that income in step.
   ============================================================ */

(function () {
  "use strict";

  var K = window.TE_COBROS;
  var $ = function (id) { return document.getElementById(id); };
  if (!K || !window.TE_DATOS || !$("seccion-cobros")) return;

  var MEDIOS = { transferencia: "Transferencia", efectivo: "Efectivo", deposito: "Depósito", otro: "Otro" };
  var PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

  var colContratos = TE_DATOS.coleccion("contratos", { local: "te_contratos" });
  var colPagos = TE_DATOS.coleccion("pagos", { local: "te_pagos" });
  var contratos = colContratos.leer() || [];
  var pagos = colPagos.leer() || [];
  var hoy = TE_HOY();
  var vista = K.periodoDe(hoy);
  var editandoContrato = null;
  var editandoPago = null;
  var contratoDelPago = null;

  colContratos.alCambiar(function (lista) { contratos = lista; refrescar(); });
  colPagos.alCambiar(function (lista) { pagos = lista; refrescar(); });

  function guardarContratos() { colContratos.guardar(contratos); }
  function guardarPagos() { colPagos.guardar(pagos); }

  function avisar(msg, esError) {
    if (window.TE_ADMIN && TE_ADMIN.notify) TE_ADMIN.notify(msg, esError);
  }

  function nuevoId(prefijo) { return prefijo + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function contrato(id) { return contratos.find(function (c) { return c.id === id; }); }
  function props() { return window.TE_ADMIN ? TE_ADMIN.obtenerProps() || [] : []; }
  function mesLargo(periodo) {
    var n = K.nombreMes(periodo);
    return n.charAt(0).toUpperCase() + n.slice(1) + " " + periodo.slice(0, 4);
  }
  // "septiembre", or "septiembre 2025" when it isn't the year on screen
  function mesCorto(periodo) {
    return K.nombreMes(periodo) + (periodo.slice(0, 4) !== vista.slice(0, 4) ? " " + periodo.slice(0, 4) : "");
  }
  // On screen the symbol never wraps away from the number
  function plata(n, moneda) { return K.formato(n, moneda).replace(" ", "\u00a0"); }
  function dinero(n, c) { return TE_ESC(plata(n, c.moneda)); }
  function dias(n) { return n + (n === 1 ? " día" : " días"); }
  function porInquilino(a, b) {
    return String(a.inquilino || "").localeCompare(String(b.inquilino || ""), "es") || String(a.codigo || "").localeCompare(String(b.codigo || ""));
  }

  /* ---------- Pieces ---------- */

  function etiqueta(e) {
    if (e.estado === "pagado") return '<span class="tag tag--pagado">Pagado</span>';
    if (e.estado === "vencido") return '<span class="tag tag--vencido">Vencido hace ' + dias(e.diasAtraso) + "</span>";
    if (e.estado === "vence_hoy") return '<span class="tag tag--hoy">Vence hoy</span>';
    return '<span class="tag tag--pendiente">Pendiente</span>';
  }

  function botonRecordar(c, e) {
    var link = K.waLink(c.telefono, K.mensajeRecordatorio(c, e));
    if (!link) return '<span class="op">Sin WhatsApp cargado</span>';
    var periodos = e.meses ? e.meses.map(function (m) { return m.periodo; }) : [e.periodo];
    return '<a class="lead__wa" href="' + TE_ESC(link) + '" target="_blank" rel="noopener" data-recordar="' + TE_ESC(c.id) +
      '" data-periodo="' + TE_ESC(periodos.join(",")) + '">Recordar por WhatsApp</a>';
  }

  function botonPago(c, periodo, saldo) {
    return '<button class="btn-chico" data-pago-contrato="' + TE_ESC(c.id) + '" data-periodo="' + TE_ESC(periodo) +
      '" data-monto="' + TE_ESC(saldo) + '">Registrar pago' + (periodo !== vista ? " de " + TE_ESC(mesCorto(periodo)) : "") + "</button>";
  }

  function quien(c) {
    return "<strong>" + TE_ESC(c.inquilino || "Sin nombre") + "</strong>" +
      (c.codigo ? ' <span class="item__codigo">' + TE_ESC(c.codigo) + "</span>" : "");
  }

  /* ---------- "Para hacer hoy" ---------- */

  function itemHoy(x) {
    var c = x.contrato;
    var texto = "";
    var botones = "";
    if (x.tipo === "vencido" || x.tipo === "vence_hoy" || x.tipo === "por_vencer") {
      var mes = mesCorto(x.periodo);
      var periodos = x.meses ? x.meses.map(function (m) { return m.periodo; }) : [x.periodo];
      if (x.tipo === "vencido" && periodos.length > 1) {
        var nombres = periodos.map(mesCorto);
        texto = "Debe " + periodos.length + " meses (" + (nombres.length > 3 ? nombres.slice(0, 2).join(", ") + " y " + (nombres.length - 2) + " más" : nombres.join(", ")) +
          ") · " + plata(x.saldo, c.moneda) + " · el más viejo venció hace " + dias(x.diasAtraso);
      } else if (x.tipo === "vencido") {
        texto = "Alquiler de " + mes + " vencido hace " + dias(x.diasAtraso) + " · " + (x.parcial ? "falta " : "") + plata(x.saldo, c.moneda);
      } else if (x.tipo === "vence_hoy") {
        texto = "Hoy vence el alquiler de " + mes + " · " + plata(x.saldo, c.moneda);
      } else {
        texto = "El alquiler de " + mes + " vence el " + K.fechaCorta(x.vence) + " (en " + dias(x.faltan) + ") · " + plata(x.saldo, c.moneda);
      }
      var avisadoEl = K.ultimoAviso(c, periodos);
      if (avisadoEl) texto += " · avisado el " + K.fechaCorta(avisadoEl);
      // With several months owed, a payment goes to the oldest first
      botones = botonRecordar(c, x) + botonPago(c, x.periodo, x.meses ? x.meses[0].saldo : x.saldo);
    } else if (x.tipo === "ajuste") {
      texto = "Toca ajustar el alquiler (cada " + x.cada + " meses; el último cambio fue en " + mesCorto(x.ultimo) + ")";
      botones = '<button class="btn-chico" data-contrato-ajuste="' + TE_ESC(c.id) + '">Actualizar monto</button>';
    } else {
      texto = x.meses === 0 ? "El contrato termina este mes" : "El contrato termina en " + mesCorto(x.hasta);
      botones = '<button class="btn-chico" data-editar-contrato="' + TE_ESC(c.id) + '">Ver contrato</button>';
    }
    return '<div class="cobro-hoy cobro-hoy--' + x.tipo + '"><p>' + quien(c) + " " + TE_ESC(texto) + "</p>" +
      '<div class="cobro-botones">' + botones + "</div></div>";
  }

  function pintarHoy() {
    var hay = contratos.some(K.activo);
    $("cobros-hoy").hidden = !hay;
    if (!hay) return;
    var items = K.pendientesHoy(contratos, pagos, hoy, { dias: 5 });
    $("cobros-hoy-lista").innerHTML = items.length
      ? items.map(itemHoy).join("")
      : '<p class="cobros-ok">Todo al día: no hay alquileres vencidos ni por vencer en los próximos días.</p>';
  }

  /* ---------- The month ---------- */

  function filaPago(c, p, e) {
    var constancia = K.waLink(c.telefono, K.mensajeConstancia(c, p, e));
    return "<li>" +
      '<span class="lead__fecha">' + TE_ESC(K.fechaCorta(p.fecha || "")) + "</span>" +
      "<span>" + dinero(p.monto, c) + (p.medio ? " · " + TE_ESC(MEDIOS[p.medio] || p.medio) : "") + (p.nota ? " · " + TE_ESC(p.nota) : "") + "</span>" +
      '<button class="btn-chico" data-editar-pago="' + TE_ESC(p.id) + '">Editar</button>' +
      (constancia ? '<a class="lead__wa" href="' + TE_ESC(constancia) + '" target="_blank" rel="noopener">Constancia por WhatsApp</a>' : "") +
      TE_EDITADO(p) +
      "</li>";
  }

  function filaCobro(c, e, previas) {
    return '<div class="cobro">' +
      '<div class="cobro__fila">' +
        (c.codigo ? '<span class="item__codigo">' + TE_ESC(c.codigo) + "</span>" : "") +
        '<span class="cobro__quien">' + TE_ESC(c.inquilino || "Sin nombre") + "</span>" +
        '<span class="lead__fecha">vence ' + TE_ESC(K.fechaCorta(e.vence)) + "</span>" +
        '<span style="flex:1"></span>' +
        '<span class="cobro__monto">' + dinero(e.debe, c) + "</span>" +
      "</div>" +
      '<div class="cobro__fila">' + etiqueta(e) +
        (e.parcial ? '<span class="op">Pagó ' + dinero(e.pagado, c) + " · falta " + dinero(e.saldo, c) + "</span>" : "") +
      "</div>" +
      (e.pagos.length ? '<ul class="cobro__pagos">' + e.pagos.map(function (p) { return filaPago(c, p, e); }).join("") + "</ul>" : "") +
      (previas.length ? '<p class="cobro__deuda">Debe además: ' + previas.slice(0, previas.length > 4 ? 3 : 4).map(function (d) {
        return '<button type="button" data-ir-mes="' + TE_ESC(d.periodo) + '">' + TE_ESC(mesCorto(d.periodo)) + "</button> (" + dinero(d.saldo, c) + ")";
      }).join(", ") + (previas.length > 4 ? " y " + (previas.length - 3) + " meses más" : "") +
      (previas.length > 1 ? " · total " + dinero(previas.reduce(function (t, d) { return t + d.saldo; }, 0), c) : "") + "</p>" : "") +
      '<div class="cobro-botones">' +
        (e.saldo > 0 ? botonPago(c, vista, e.saldo) + botonRecordar(c, e) : "") +
        '<button class="btn-chico" data-editar-contrato="' + TE_ESC(c.id) + '">Contrato</button>' +
      "</div>" +
    "</div>";
  }

  function pintarMes() {
    $("cobros-titulo").textContent = mesLargo(vista);
    var lista = contratos.filter(function (c) { return K.correEn(c, vista); }).sort(porInquilino);
    var tot = {};
    var vencidos = 0;
    $("lista-cobros").innerHTML = lista.map(function (c) {
      var e = K.estadoPeriodo(c, pagos, vista, hoy);
      var mon = c.moneda || "ARS";
      tot[mon] = tot[mon] || { debe: 0, pagado: 0, saldo: 0 };
      tot[mon].debe += e.debe;
      tot[mon].pagado += Math.min(e.pagado, e.debe);
      tot[mon].saldo += e.saldo;
      if (e.estado === "vencido") vencidos++;
      return filaCobro(c, e, K.deudas(c, pagos, K.sumarMeses(vista, -1), hoy));
    }).join("");

    var tarjetas = "";
    Object.keys(tot).sort().forEach(function (mon) {
      var c = { moneda: mon };
      tarjetas +=
        '<div class="metrica"><dt>A cobrar ' + TE_ESC(mon) + "</dt><dd>" + dinero(tot[mon].debe, c) + "</dd></div>" +
        '<div class="metrica"><dt>Cobrado ' + TE_ESC(mon) + '</dt><dd class="num--positivo">' + dinero(tot[mon].pagado, c) + "</dd></div>" +
        '<div class="metrica"><dt>Falta ' + TE_ESC(mon) + '</dt><dd class="' + (tot[mon].saldo ? "num--negativo" : "") + '">' + dinero(tot[mon].saldo, c) + "</dd></div>";
    });
    if (lista.length) tarjetas += '<div class="metrica"><dt>Vencidos</dt><dd class="' + (vencidos ? "num--negativo" : "") + '">' + vencidos + "</dd></div>";
    $("cobros-metricas").innerHTML = tarjetas;
    $("cobros-metricas").hidden = !lista.length;
    $("cobros-resumen").textContent = lista.length ? lista.length + (lista.length === 1 ? " contrato" : " contratos") + " este mes" : "";
    $("cobros-vacio").hidden = lista.length > 0;
    $("cobros-vacio").textContent = contratos.length
      ? "Ningún contrato cobra alquiler en " + mesLargo(vista).toLowerCase() + "."
      : 'Todavía no hay contratos de alquiler. Cargá el primero con "+ Nuevo contrato".';

    var terminados = contratos.filter(function (c) { return !K.activo(c); }).sort(porInquilino);
    $("cobros-terminados").hidden = !terminados.length;
    $("cobros-terminados-n").textContent = terminados.length;
    $("lista-terminados").innerHTML = terminados.map(function (c) {
      var debe = K.deudas(c, pagos, c.hasta || K.periodoDe(hoy), hoy).reduce(function (s, d) { return s + d.saldo; }, 0);
      return '<div class="cobro-hoy"><p>' + quien(c) + " " + TE_ESC((c.desde ? mesCorto(c.desde) : "") + (c.hasta ? " – " + mesCorto(c.hasta) : "")) +
        (debe ? ' <span class="cobro__deuda">· debe ' + dinero(debe, c) + "</span>" : "") + "</p>" +
        '<div class="cobro-botones"><button class="btn-chico" data-editar-contrato="' + TE_ESC(c.id) + '">Contrato</button></div></div>';
    }).join("");
  }

  // Tab badge (and the app icon's, where the phone supports it)
  function pintarBadge() {
    var n = K.pendientesHoy(contratos, pagos, hoy, { dias: 5 }).filter(K.necesitaAccion).length;
    $("badge-cobros").textContent = n;
    $("badge-cobros").hidden = !n;
    try {
      if (navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(function () {});
    } catch (e) {}
  }

  function pintar() {
    hoy = TE_HOY();
    pintarHoy();
    pintarMes();
    pintarBadge();
  }

  function refrescar() {
    hoy = TE_HOY();
    pintarBadge();
    if (!$("seccion-cobros").hidden) pintar();
  }

  /* ---------- Reminders: remember that one was sent ---------- */

  function marcarAvisado(id, periodos) {
    var c = contrato(id);
    if (!c) return;
    var avisos = Object.assign({}, c.avisos);
    String(periodos || "").split(",").filter(Boolean).forEach(function (p) { avisos[p] = hoy; });
    var limite = K.sumarMeses(K.periodoDe(hoy), -12);
    Object.keys(avisos).forEach(function (k) { if (k < limite) delete avisos[k]; });
    contratos = contratos.map(function (x) { return x.id === id ? Object.assign({}, x, { avisos: avisos }) : x; });
    guardarContratos();
    // Repaint after the link has opened WhatsApp
    setTimeout(refrescar, 400);
  }

  /* ---------- Contract form ---------- */

  function opcionesPropiedades(valor) {
    var sel = $("c-codigo");
    sel.innerHTML = '<option value="">— Sin propiedad cargada —</option>';
    var lista = props().slice().sort(function (a, b) {
      return (a.operacion === "alquiler" ? 0 : 1) - (b.operacion === "alquiler" ? 0 : 1) || String(a.codigo).localeCompare(String(b.codigo));
    });
    lista.forEach(function (p) {
      var o = document.createElement("option");
      o.value = p.codigo;
      o.textContent = TE_ADMIN.etiquetaPropiedad ? TE_ADMIN.etiquetaPropiedad(p) : p.codigo + " — " + String(p.titulo || "").slice(0, 34);
      sel.appendChild(o);
    });
    if (valor && !lista.some(function (p) { return p.codigo === valor; })) {
      var o = document.createElement("option");
      o.value = valor;
      o.textContent = valor;
      sel.appendChild(o);
    }
    sel.value = valor || "";
  }

  function historial(c) {
    var montos = (c && Array.isArray(c.montos) ? c.montos : []).slice().sort(function (a, b) { return a.desde < b.desde ? -1 : 1; });
    if (montos.length < 2) return "";
    return "Montos: " + montos.map(function (m) { return "desde " + mesCorto(m.desde) + " " + plata(m.monto, c.moneda); }).join(" · ");
  }

  function abrirContrato(id, opciones) {
    var c = id ? contrato(id) : null;
    editandoContrato = c ? c.id : null;
    $("form-contrato-titulo").textContent = c ? "Contrato de " + (c.inquilino || "") : "Nuevo contrato";
    opcionesPropiedades(c ? c.codigo : "");
    $("c-inquilino").value = c ? c.inquilino || "" : "";
    $("c-telefono").value = c ? c.telefono || "" : "";
    $("c-referencia").value = c ? c.referencia || "" : "";
    $("c-monto").value = c ? K.montoEn(c, K.periodoDe(hoy)) : "";
    $("c-moneda").value = c ? c.moneda || "ARS" : "ARS";
    $("c-dia").value = c ? c.dia || 10 : 10;
    $("c-ajuste").value = c && c.ajusteCada ? String(c.ajusteCada) : "";
    $("c-desde").value = c ? c.desde || "" : K.periodoDe(hoy);
    $("c-hasta").value = c ? c.hasta || "" : "";
    $("c-aldia").value = c ? c.alDiaHasta || "" : "";
    $("c-estado").value = c && c.estado === "terminado" ? "terminado" : "activo";
    $("c-nota").value = c ? c.nota || "" : "";
    $("c-rige").value = K.periodoDe(hoy);
    $("c-rige-campo").hidden = true;
    var h = historial(c);
    $("c-montos-historial").textContent = h;
    $("c-montos-historial").hidden = !h;
    $("btn-eliminar-contrato").hidden = !c;
    $("form-pago").hidden = true;
    $("form-contrato").hidden = false;
    $("form-contrato").scrollIntoView({ behavior: "smooth" });
    if (opciones && opciones.ajuste) $("c-monto").focus({ preventScroll: true });
  }

  // A new rent on an existing contract: ask from which month it applies
  $("c-monto").addEventListener("input", function () {
    var c = editandoContrato ? contrato(editandoContrato) : null;
    $("c-rige-campo").hidden = !c || Number(this.value) === K.montoEn(c, K.periodoDe(hoy));
  });

  // A contract that started before today: by default the months before this one were already collected
  $("c-desde").addEventListener("change", function () {
    var mesPasado = K.sumarMeses(K.periodoDe(hoy), -1);
    if (!editandoContrato && !$("c-aldia").value && PERIODO.test(this.value) && this.value <= mesPasado) $("c-aldia").value = mesPasado;
  });

  // A new contract takes the property's rent and currency as a starting point
  $("c-codigo").addEventListener("change", function () {
    if (editandoContrato) return;
    var p = props().find(function (x) { return x.codigo === $("c-codigo").value; });
    if (!p) return;
    // The name used in messages starts from the property's internal reference
    if (!$("c-referencia").value && TE_ADMIN.referencia) $("c-referencia").value = TE_ADMIN.referencia(p.codigo);
    if (p.operacion !== "alquiler") return;
    if (!$("c-monto").value && p.precio) $("c-monto").value = p.precio;
    if (p.moneda) $("c-moneda").value = p.moneda;
  });

  $("btn-nuevo-contrato").addEventListener("click", function () { abrirContrato(null); });
  $("btn-cancelar-contrato").addEventListener("click", function () { $("form-contrato").hidden = true; editandoContrato = null; });

  $("btn-guardar-contrato").addEventListener("click", function () {
    var c = editandoContrato ? contrato(editandoContrato) : null;
    var inquilino = $("c-inquilino").value.trim();
    var monto = parseFloat($("c-monto").value);
    var dia = parseInt($("c-dia").value, 10);
    var desde = $("c-desde").value.trim();
    var hasta = $("c-hasta").value.trim();
    var alDia = $("c-aldia").value.trim();
    var rige = $("c-rige").value.trim() || K.periodoDe(hoy);
    var estado = $("c-estado").value;
    if (!inquilino) return avisar("Falta el nombre del inquilino.", true);
    if (!(monto > 0)) return avisar("Falta el monto del alquiler.", true);
    if (!(dia >= 1 && dia <= 31)) return avisar("El día de vencimiento tiene que ser del 1 al 31.", true);
    if (!PERIODO.test(desde)) return avisar("Falta desde qué mes corre el contrato (año y mes).", true);
    if (hasta && !PERIODO.test(hasta)) return avisar("El mes de fin no es válido.", true);
    if (hasta && hasta < desde) return avisar("El contrato no puede terminar antes de empezar.", true);
    if (alDia && !PERIODO.test(alDia)) return avisar("El mes de \"al día hasta\" no es válido.", true);
    if (!PERIODO.test(rige)) return avisar("Falta desde qué mes rige el monto nuevo.", true);
    // A finished contract stops charging: without an end month, it ends this month
    if (estado === "terminado" && !hasta) hasta = K.periodoDe(hoy) < desde ? desde : K.periodoDe(hoy);

    var montos;
    if (!c) montos = [{ desde: desde, monto: monto }];
    else if (monto !== K.montoEn(c, K.periodoDe(hoy))) montos = K.cambiarMonto(c, monto, rige);
    else montos = (c.montos || []).slice();
    montos.sort(function (a, b) { return a.desde < b.desde ? -1 : 1; });
    if (!montos.length) montos = [{ desde: desde, monto: monto }];
    // The first rent always covers the first month
    if (montos[0].desde > desde) montos[0] = Object.assign({}, montos[0], { desde: desde });

    var datos = {
      codigo: $("c-codigo").value,
      inquilino: inquilino,
      telefono: $("c-telefono").value.trim(),
      referencia: $("c-referencia").value.trim(),
      moneda: $("c-moneda").value,
      dia: dia,
      desde: desde,
      hasta: hasta,
      alDiaHasta: alDia,
      ajusteCada: parseInt($("c-ajuste").value, 10) || 0,
      estado: estado,
      nota: $("c-nota").value.trim(),
      montos: montos
    };
    if (c) {
      contratos = contratos.map(function (x) { return x.id === c.id ? Object.assign({}, x, datos) : x; });
    } else {
      contratos = contratos.concat([Object.assign({ id: nuevoId("C") }, datos)]);
    }
    guardarContratos();
    editandoContrato = null;
    $("form-contrato").hidden = true;
    pintar();
    avisar("Contrato guardado.");
  });

  $("btn-eliminar-contrato").addEventListener("click", function () {
    var c = editandoContrato ? contrato(editandoContrato) : null;
    if (!c) return;
    var suyos = pagos.filter(function (p) { return p.contrato === c.id; });
    if (!confirm("¿Eliminar el contrato de " + (c.inquilino || "este inquilino") + "?" +
      (suyos.length ? "\n\nTambién se borran sus " + suyos.length + " pagos registrados (los ingresos ya cargados en Contabilidad quedan)." : "") +
      "\n\nSi el contrato terminó, mejor marcalo como Terminado: así queda el historial.")) return;
    contratos = contratos.filter(function (x) { return x.id !== c.id; });
    pagos = pagos.filter(function (p) { return p.contrato !== c.id; });
    guardarContratos();
    guardarPagos();
    editandoContrato = null;
    $("form-contrato").hidden = true;
    pintar();
  });

  /* ---------- Payment form ---------- */

  function descripcion(c, periodo) {
    return "Alquiler " + K.nombreMes(periodo) + " " + periodo.slice(0, 4) + " — " + (c.inquilino || "");
  }

  function abrirPago(contratoId, periodo, monto, pagoId) {
    var p = pagoId ? pagos.find(function (x) { return x.id === pagoId; }) : null;
    var c = contrato(p ? p.contrato : contratoId);
    if (!c) return;
    editandoPago = p ? p.id : null;
    contratoDelPago = c.id;
    var mes = p ? p.periodo : periodo;
    $("form-pago-titulo").textContent = p ? "Editar pago" : "Registrar pago";
    $("p-contexto").textContent = (c.inquilino || "") + (c.codigo ? " · " + c.codigo : "") + " · alquiler de " +
      K.nombreMes(mes) + ": " + K.formato(K.montoEn(c, mes), c.moneda);
    $("p-periodo").value = mes;
    $("p-fecha").value = p ? p.fecha || hoy : hoy;
    $("p-monto").value = p ? p.monto : (Number(monto) > 0 ? monto : K.montoEn(c, mes));
    $("p-medio").value = p && p.medio ? p.medio : "transferencia";
    $("p-nota").value = p ? p.nota || "" : "";
    $("p-conta").checked = true;
    $("p-conta-campo").hidden = !!p || !window.TE_CONTA;
    $("btn-eliminar-pago").hidden = !p;
    $("form-contrato").hidden = true;
    $("form-pago").hidden = false;
    $("form-pago").scrollIntoView({ behavior: "smooth" });
  }

  $("btn-cancelar-pago").addEventListener("click", function () { $("form-pago").hidden = true; editandoPago = null; });

  $("btn-guardar-pago").addEventListener("click", function () {
    var c = contrato(contratoDelPago);
    if (!c) { $("form-pago").hidden = true; return; }
    var periodo = $("p-periodo").value.trim();
    var fecha = $("p-fecha").value;
    var monto = parseFloat($("p-monto").value);
    if (!PERIODO.test(periodo)) return avisar("Falta el mes que paga (año y mes).", true);
    if (!fecha) return avisar("Falta la fecha del pago.", true);
    if (!(monto > 0)) return avisar("Falta el monto.", true);
    var datos = {
      contrato: c.id,
      periodo: periodo,
      fecha: fecha,
      monto: monto,
      medio: $("p-medio").value,
      nota: $("p-nota").value.trim()
    };
    var p = editandoPago ? pagos.find(function (x) { return x.id === editandoPago; }) : null;
    var enConta = { fecha: fecha, monto: monto, moneda: c.moneda || "ARS", codigo: c.codigo || "", descripcion: descripcion(c, periodo) };
    if (p) {
      var actualizado = Object.assign({}, p, datos);
      if (p.mov && window.TE_CONTA) TE_CONTA.actualizarMovimiento(p.mov, enConta);
      pagos = pagos.map(function (x) { return x.id === p.id ? actualizado : x; });
    } else {
      var nuevo = Object.assign({ id: nuevoId("P") }, datos);
      if ($("p-conta").checked && window.TE_CONTA) {
        nuevo.mov = TE_CONTA.agregarMovimiento(Object.assign({ tipo: "ingreso", categoria: "alquiler", pago: nuevo.id }, enConta));
      }
      pagos = pagos.concat([nuevo]);
    }
    guardarPagos();
    editandoPago = null;
    $("form-pago").hidden = true;
    pintar();
    avisar(p ? "Pago actualizado." : "Pago guardado." + (c.telefono ? " Podés mandarle la constancia por WhatsApp desde la lista." : ""));
  });

  $("btn-eliminar-pago").addEventListener("click", function () {
    var p = editandoPago ? pagos.find(function (x) { return x.id === editandoPago; }) : null;
    if (!p) return;
    if (!confirm("¿Eliminar este pago?" + (p.mov ? "\n\nTambién se borra el ingreso que se cargó en Contabilidad." : ""))) return;
    if (p.mov && window.TE_CONTA) TE_CONTA.quitarMovimiento(p.mov);
    pagos = pagos.filter(function (x) { return x.id !== p.id; });
    guardarPagos();
    editandoPago = null;
    $("form-pago").hidden = true;
    pintar();
  });

  /* ---------- Clicks in the tab ---------- */

  $("seccion-cobros").addEventListener("click", function (e) {
    var t;
    if ((t = e.target.closest("[data-recordar]"))) return marcarAvisado(t.dataset.recordar, t.dataset.periodo);   // the link opens WhatsApp
    if ((t = e.target.closest("[data-pago-contrato]"))) return abrirPago(t.dataset.pagoContrato, t.dataset.periodo, t.dataset.monto);
    if ((t = e.target.closest("[data-editar-pago]"))) return abrirPago(null, null, null, t.dataset.editarPago);
    if ((t = e.target.closest("[data-contrato-ajuste]"))) return abrirContrato(t.dataset.contratoAjuste, { ajuste: true });
    if ((t = e.target.closest("[data-editar-contrato]"))) return abrirContrato(t.dataset.editarContrato);
    if ((t = e.target.closest("[data-ir-mes]"))) { vista = t.dataset.irMes; pintarMes(); $("cobros-titulo").scrollIntoView({ behavior: "smooth" }); }
  });

  $("cobros-ant").addEventListener("click", function () { vista = K.sumarMeses(vista, -1); pintarMes(); });
  $("cobros-sig").addEventListener("click", function () { vista = K.sumarMeses(vista, 1); pintarMes(); });
  $("cobros-este-mes").addEventListener("click", function () { vista = K.periodoDe(TE_HOY()); pintarMes(); });

  /* ---------- Export ---------- */

  $("btn-cobros-csv").addEventListener("click", function () {
    if (!pagos.length) return avisar("Todavía no hay pagos registrados.", true);
    var filas = [["Fecha de pago", "Mes", "Propiedad", "Inquilino", "Moneda", "Monto", "Medio", "Nota", "Cargado por"]];
    pagos.slice().sort(function (a, b) { return String(a.fecha) < String(b.fecha) ? -1 : 1; }).forEach(function (p) {
      var c = contrato(p.contrato) || {};
      filas.push([p.fecha, p.periodo, c.codigo || "", c.inquilino || "", c.moneda || "ARS", String(p.monto).replace(".", ","),
        MEDIOS[p.medio] || p.medio || "", p.nota || "", String(p._por || "").split("@")[0]]);
    });
    var csv = "﻿" + filas.map(function (f) {
      return f.map(function (x) { return '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"'; }).join(";");
    }).join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "pagos-alquileres-tres-estructuras.csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  });

  /* ---------- Keep the badge current ---------- */

  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") refrescar(); });
  setInterval(refrescar, 30 * 60 * 1000);

  window.TE_COBROS_UI = { pintar: pintar };
  pintarBadge();
})();
