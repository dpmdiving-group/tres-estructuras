/* ============================================================
   TRES ESTRUCTURAS — Workers' pay (Trabajos tab, "Sueldos")

   Each worker's pay setting (how often, the usual amount, the pay day)
   and the payments made, shared between phones in the collection
   "sueldos" ({tipo: "modalidad"} one per worker, {tipo: "pago"} each
   payment). A payment also goes to Contabilidad as an expense
   ("Sueldos"), and follows it when edited or deleted. Kept apart from
   the workers' own data, which the worker's page reads: pay never
   reaches it.
   ============================================================ */

(function () {
  "use strict";

  var S = window.TE_SUELDOS;
  var $ = function (id) { return document.getElementById(id); };
  var col = TE_DATOS.coleccion("sueldos", { local: "te_sueldos" });
  var items = col.leer() || [];
  var abiertos = {};          // worker id -> payment history shown
  var editandoPago = null;    // payment id
  var paraTrabajador = null;  // worker id of the open form

  col.alCambiar(function (lista) { items = lista; pintar(); });
  function guardar() { col.guardar(items); }

  function avisar(msg, esError) {
    var n = document.querySelector(".aviso-flotante");
    if (!n) { n = document.createElement("div"); n.className = "aviso-flotante"; n.setAttribute("role", "status"); document.body.appendChild(n); }
    n.classList.toggle("aviso-flotante--error", !!esError);
    n.textContent = msg;
    clearTimeout(n._t);
    n._t = setTimeout(function () { n.remove(); }, 3500);
  }

  function trabajadores() { return window.TE_TRABAJOS && TE_TRABAJOS.trabajadores ? TE_TRABAJOS.trabajadores() : []; }
  function nombre(id) { var t = trabajadores().find(function (x) { return x.id === id; }); return t ? t.nombre : ""; }
  function modalidad(id) { return items.find(function (x) { return x.tipo === "modalidad" && x.trabajador === id; }) || null; }
  function pagos(id) {
    return items.filter(function (x) { return x.tipo === "pago" && (!id || x.trabajador === id); })
      .sort(function (a, b) { return String(b.fecha) < String(a.fecha) ? -1 : String(b.fecha) > String(a.fecha) ? 1 : 0; });
  }
  function fechaCorta(iso) { return parseInt(iso.slice(8, 10), 10) + "/" + parseInt(iso.slice(5, 7), 10); }

  /* ---------- The list ---------- */
  function pintar() {
    var cont = $("lista-sueldos");
    if (!cont || !S) return;
    var hoy = TE_HOY();
    var totales = S.totalesMes(pagos(), hoy.slice(0, 7));
    $("sueldos-mes").textContent = Object.keys(totales).length
      ? "· Este mes: " + Object.keys(totales).map(function (m) { return S.formato(totales[m], m); }).join(" y ")
      : "";
    var lista = trabajadores();
    if (!lista.length) {
      cont.innerHTML = '<p class="vacio-lista">Primero agregá los trabajadores con el botón "Trabajadores".</p>';
      return;
    }
    cont.innerHTML = lista.map(function (t) {
      var m = modalidad(t.id);
      var suyos = pagos(t.id);
      var ultimo = suyos[0];
      var proximo = S.proximoPago(m, ultimo ? ultimo.fecha : "", hoy);
      var av = S.aviso(proximo, hoy);
      return '<div class="sueldo" data-trabajador="' + TE_ESC(t.id) + '">' +
        '<div class="sueldo__cabeza"><strong>' + TE_ESC(t.nombre) + "</strong>" +
          '<span class="op">' + (m ? TE_ESC(S.textoModalidad(m)) : "Sin modalidad: cargala con «Modalidad de pago»") + "</span></div>" +
        (av.texto ? '<p class="sueldo__aviso sueldo__aviso--' + (av.tipo || "nada") + '">' + TE_ESC(av.texto) + "</p>" : "") +
        '<p class="op" style="margin:4px 0 0">' + (ultimo ? "Último pago: " + TE_ESC(fechaCorta(ultimo.fecha)) + " · " + TE_ESC(S.formato(ultimo.monto, ultimo.moneda)) : "Todavía sin pagos registrados") + "</p>" +
        '<div class="sueldo__acciones">' +
          '<button type="button" class="btn-chico btn-primario" data-pagar="' + TE_ESC(t.id) + '">Registrar pago</button>' +
          '<button type="button" class="btn-chico" data-modalidad="' + TE_ESC(t.id) + '">Modalidad de pago</button>' +
          (suyos.length ? '<button type="button" class="btn-chico" data-ver-pagos="' + TE_ESC(t.id) + '">' + (abiertos[t.id] ? "Ocultar pagos" : "Ver pagos (" + suyos.length + ")") + "</button>" : "") +
        "</div>" +
        (abiertos[t.id] && suyos.length
          ? '<ul class="sueldo__pagos">' + suyos.map(function (p) {
              return "<li><span class=\"mono\">" + TE_ESC(fechaCorta(p.fecha)) + "</span><strong>" + TE_ESC(S.formato(p.monto, p.moneda)) + "</strong>" +
                (p.nota ? '<span class="op">' + TE_ESC(p.nota) + "</span>" : "") +
                (p.mov ? "" : '<span class="op">(no está en Contabilidad)</span>') +
                '<button type="button" class="btn-chico" data-editar-pago="' + TE_ESC(p.id) + '">Editar</button>' + TE_EDITADO(p) + "</li>";
            }).join("") + "</ul>"
          : "") +
      "</div>";
    }).join("");
  }

  /* ---------- Pay setting ---------- */
  function pintarDia() {
    var mensual = $("sm-frecuencia").value === "mensual";
    $("sm-dia-mes-campo").hidden = !mensual;
    $("sm-dia-semana-campo").hidden = mensual;
  }
  $("sm-frecuencia").addEventListener("change", pintarDia);

  function abrirModalidad(id) {
    var m = modalidad(id);
    paraTrabajador = id;
    $("form-sueldo-pago").hidden = true;
    $("sm-titulo").textContent = "Modalidad de pago de " + nombre(id);
    $("sm-frecuencia").value = m ? m.frecuencia : "semanal";
    $("sm-dia-semana").value = m && m.frecuencia !== "mensual" ? String(m.dia) : "5";
    $("sm-dia-mes").value = m && m.frecuencia === "mensual" ? m.dia : 5;
    $("sm-monto").value = m && Number(m.monto) > 0 ? m.monto : "";
    $("sm-moneda").value = m ? m.moneda || "ARS" : "ARS";
    pintarDia();
    $("form-sueldo-modalidad").hidden = false;
    $("form-sueldo-modalidad").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  $("btn-guardar-modalidad").addEventListener("click", function () {
    var frecuencia = $("sm-frecuencia").value;
    var dia = frecuencia === "mensual" ? parseInt($("sm-dia-mes").value, 10) : parseInt($("sm-dia-semana").value, 10);
    if (frecuencia === "mensual" && !(dia >= 1 && dia <= 31)) { avisar("El día del mes tiene que ser del 1 al 31.", true); return; }
    var datos = { id: "M-" + paraTrabajador, tipo: "modalidad", trabajador: paraTrabajador, frecuencia: frecuencia, dia: dia,
      monto: Math.max(0, parseFloat($("sm-monto").value) || 0), moneda: $("sm-moneda").value };
    items = items.filter(function (x) { return x.id !== datos.id; }).concat([datos]);
    guardar();
    $("form-sueldo-modalidad").hidden = true;
    pintar();
    avisar("Modalidad de " + nombre(paraTrabajador) + " guardada: " + S.textoModalidad(datos) + ".");
  });
  $("btn-cancelar-modalidad").addEventListener("click", function () { $("form-sueldo-modalidad").hidden = true; });

  /* ---------- Payments ---------- */
  function abrirPago(idTrabajador, idPago) {
    var p = idPago ? items.find(function (x) { return x.id === idPago; }) : null;
    var m = modalidad(idTrabajador);
    paraTrabajador = idTrabajador;
    editandoPago = p ? p.id : null;
    $("form-sueldo-modalidad").hidden = true;
    $("sp-titulo").textContent = (p ? "Pago a " : "Registrar pago a ") + nombre(idTrabajador);
    $("sp-fecha").value = p ? p.fecha : TE_HOY();
    $("sp-monto").value = p ? p.monto : m && Number(m.monto) > 0 ? m.monto : "";
    $("sp-moneda").value = p ? p.moneda || "ARS" : m ? m.moneda || "ARS" : "ARS";
    $("sp-nota").value = p ? p.nota || "" : "";
    $("sp-conta").checked = p ? !!p.mov : true;
    $("btn-eliminar-sueldo").hidden = !p;
    $("form-sueldo-pago").hidden = false;
    $("form-sueldo-pago").scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("sp-monto").focus({ preventScroll: true });
  }

  $("btn-guardar-sueldo").addEventListener("click", function () {
    var monto = parseFloat($("sp-monto").value);
    if (!$("sp-fecha").value) { avisar("Falta la fecha.", true); return; }
    if (!(monto > 0)) { avisar("Falta el monto.", true); return; }
    var previo = editandoPago ? items.find(function (x) { return x.id === editandoPago; }) : null;
    var p = Object.assign({}, previo, {
      id: previo ? previo.id : "S" + Date.now() + Math.random().toString(36).slice(2, 5),
      tipo: "pago", trabajador: paraTrabajador, fecha: $("sp-fecha").value, monto: monto,
      moneda: $("sp-moneda").value, nota: $("sp-nota").value.trim()
    });
    // Contabilidad follows: added, updated, or taken out
    var mov = S.movimientoDe(p, nombre(paraTrabajador));
    if ($("sp-conta").checked && window.TE_CONTA) {
      if (p.mov && TE_CONTA.movimiento(p.mov)) TE_CONTA.actualizarMovimiento(p.mov, mov);
      else p.mov = TE_CONTA.agregarMovimiento(mov);
    } else if (p.mov && window.TE_CONTA) {
      TE_CONTA.quitarMovimiento(p.mov);
      delete p.mov;
    }
    items = items.filter(function (x) { return x.id !== p.id; }).concat([p]);
    guardar();
    $("form-sueldo-pago").hidden = true;
    editandoPago = null;
    pintar();
    avisar("Pago a " + nombre(p.trabajador) + " guardado" + (p.mov ? " y cargado en Contabilidad." : "."));
  });

  $("btn-eliminar-sueldo").addEventListener("click", function () {
    var p = editandoPago ? items.find(function (x) { return x.id === editandoPago; }) : null;
    if (!p || !confirm("¿Eliminar el pago de " + S.formato(p.monto, p.moneda) + " a " + nombre(p.trabajador) + "?" + (p.mov ? "\n\nTambién se borra el gasto en Contabilidad." : ""))) return;
    if (p.mov && window.TE_CONTA) TE_CONTA.quitarMovimiento(p.mov);
    items = items.filter(function (x) { return x.id !== p.id; });
    guardar();
    $("form-sueldo-pago").hidden = true;
    editandoPago = null;
    pintar();
  });
  $("btn-cancelar-sueldo").addEventListener("click", function () { $("form-sueldo-pago").hidden = true; editandoPago = null; });

  /* ---------- Events ---------- */
  $("btn-sueldos").addEventListener("click", function () {
    var caja = $("caja-sueldos");
    var abrir = caja.hidden;
    caja.hidden = !abrir;
    this.setAttribute("aria-expanded", String(abrir));
    if (abrir) { pintar(); caja.scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
  $("lista-sueldos").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.pagar) abrirPago(b.dataset.pagar, null);
    else if (b.dataset.modalidad) abrirModalidad(b.dataset.modalidad);
    else if (b.dataset.verPagos) { abiertos[b.dataset.verPagos] = !abiertos[b.dataset.verPagos]; pintar(); }
    else if (b.dataset.editarPago) {
      var p = items.find(function (x) { return x.id === b.dataset.editarPago; });
      if (p) abrirPago(p.trabajador, p.id);
    }
  });

  window.TE_SUELDOS_UI = { pintar: pintar };
  pintar();
})();
