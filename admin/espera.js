/* ============================================================
   TRES ESTRUCTURAS — Waiting list in the panel

   Visitors sign up from a reserved or coming-soon property's page
   (netlify/functions/espera.mjs adds them to the shared collection
   "espera"). Here the owners see them by property (Consultas tab and a
   button on each property), contact them, and when a property is set
   to "Disponible" the panel offers to tell everyone waiting: one tap per
   person on WhatsApp (wa.me can't send to many at once) or one email to
   all. The message is prewritten and editable. Never published.
   ============================================================ */

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var col = TE_DATOS.coleccion("espera", { local: "te_lista_espera" });
  var lista = col.leer() || [];
  var abierto = null;      // property code shown in the window
  var porDisponible = false;

  var CUANDO = { ya: "Lo antes posible", "1mes": "En un mes", "3meses": "En 2 o 3 meses", mas: "Más adelante" };
  var GARANTIA = { propietaria: "Garantía propietaria", caucion: "Seguro de caución", recibo: "Recibo de sueldo", otra: "Otra / todavía no sabe" };
  var PAGO = { contado: "Contado", credito: "Crédito hipotecario", permuta: "Permuta", otra: "Otra" };
  var ESTADO = { esperando: "Esperando", avisado: "Avisado", contactado: "Contactado" };
  var MENSAJE = "Hola {nombre}, te escribimos de Tres Estructuras: {titulo} ({codigo}), la propiedad por la que te anotaste en la lista de espera, ya está disponible. Mirala acá: {link}\n¿Querés coordinar una visita?";

  col.alCambiar(function (l) { lista = l; pintar(); });
  function guardar() { col.guardar(lista); }

  function prop(codigo) { return window.TE_ADMIN ? TE_ADMIN.obtenerProps().find(function (p) { return p.codigo === codigo; }) : null; }
  function nombreProp(codigo) {
    var ref = window.TE_ADMIN && TE_ADMIN.referencia ? TE_ADMIN.referencia(codigo) : "";
    var p = prop(codigo);
    return codigo + (ref ? " · " + ref : p ? " · " + p.titulo : "");
  }
  function deCodigo(codigo) {
    return lista.filter(function (e) { return e.codigo === codigo; })
      .sort(function (a, b) { return String(b.fecha) < String(a.fecha) ? -1 : 1; });
  }
  function esperando(codigo) { return deCodigo(codigo).filter(function (e) { return (e.estado || "esperando") === "esperando"; }); }
  function fecha(iso) { var d = String(iso || "").slice(0, 10); return d ? parseInt(d.slice(8, 10), 10) + "/" + parseInt(d.slice(5, 7), 10) : ""; }
  function primerNombre(n) { return String(n || "").trim().split(/\s+/)[0] || ""; }

  /* ---------- The message ---------- */
  function plantilla() {
    var t = "";
    try { t = localStorage.getItem("te_espera_mensaje") || ""; } catch (e) {}
    return t || MENSAJE;
  }
  // {nombre} disappears with its space when the message goes to everyone at once
  function mensajePara(e, codigo) {
    var p = prop(codigo);
    var dominio = typeof CONFIG !== "undefined" ? CONFIG.dominio : "";
    return ($("espera-mensaje") ? $("espera-mensaje").value : plantilla())
      .replace(/\s*\{nombre\}/g, e && primerNombre(e.nombre) ? " " + primerNombre(e.nombre) : "")
      .replace(/\{codigo\}/g, codigo)
      .replace(/\{titulo\}/g, p ? p.titulo : codigo)
      .replace(/\{link\}/g, dominio + "/p/" + codigo);
  }
  function asunto(codigo) { return "Ya está disponible " + codigo + " — Tres Estructuras"; }

  /* ---------- Consultas tab and the property list ---------- */
  function etiqueta(codigo) {
    var total = deCodigo(codigo).length;
    if (!total) return "";
    var n = esperando(codigo).length;
    return '<button type="button" class="btn-chico" data-ver-espera="' + TE_ESC(codigo) + '">' +
      (n ? n + " en lista de espera" : "Lista de espera (" + total + ")") + "</button>";
  }

  function pintar() {
    var codigos = [];
    lista.forEach(function (e) { if (codigos.indexOf(e.codigo) < 0) codigos.push(e.codigo); });
    codigos.sort();
    var total = lista.filter(function (e) { return (e.estado || "esperando") === "esperando"; }).length;
    if ($("espera-total")) $("espera-total").textContent = total ? "· " + total + (total === 1 ? " esperando" : " esperando") : "";
    if ($("espera-resumen")) {
      $("espera-resumen").innerHTML = codigos.length
        ? codigos.map(function (c) {
            var n = esperando(c).length, todos = deCodigo(c).length;
            return '<div class="espera-fila"><span class="item__codigo">' + TE_ESC(nombreProp(c)) + "</span>" +
              '<span class="op">' + (n ? n + " esperando" : "nadie esperando") + (todos - n ? " · " + (todos - n) + " avisados o contactados" : "") + "</span>" +
              '<button type="button" class="btn-chico" data-ver-espera="' + TE_ESC(c) + '">Ver</button></div>';
          }).join("")
        : '<p class="vacio-lista">Todavía nadie se anotó. El botón "Lista de espera" aparece en la ficha de las propiedades reservadas y en próximamente.</p>';
    }
    if (window.TE_ADMIN && TE_ADMIN.repintar) TE_ADMIN.repintar();
    if (abierto) pintarVentana();
  }

  /* ---------- The window with the people of one property ---------- */
  function abrir(codigo, disponible) {
    abierto = codigo;
    porDisponible = !!disponible;
    $("espera-mensaje").value = plantilla();
    $("espera-modal").hidden = false;
    pintarVentana();
    $("espera-cerrar").focus({ preventScroll: true });
  }

  function pintarVentana() {
    var codigo = abierto;
    var gente = deCodigo(codigo);
    var n = esperando(codigo).length;
    $("espera-modal-titulo").textContent = "Lista de espera · " + nombreProp(codigo);
    $("espera-modal-sub").textContent = porDisponible
      ? codigo + " pasó a Disponible: " + (n === 1 ? "hay 1 persona esperando." : "hay " + n + " personas esperando.") + " Publicá primero, así el link la muestra disponible."
      : n + " esperando · " + (gente.length - n) + " avisados o contactados.";
    var mails = esperando(codigo).map(function (e) { return e.email; }).filter(Boolean);
    var todos = $("espera-mail-todos");
    todos.hidden = !mails.length;
    todos.textContent = "Mandar email a los que esperan (" + mails.length + ")";
    todos.href = "mailto:?bcc=" + encodeURIComponent(mails.join(",")) + "&subject=" + encodeURIComponent(asunto(codigo)) + "&body=" + encodeURIComponent(mensajePara(null, codigo));
    $("espera-personas").innerHTML = gente.length ? gente.map(function (e) {
      var msj = mensajePara(e, codigo);
      var wa = window.TE_COBROS ? TE_COBROS.waLink(e.telefono, msj) : null;
      var datos = [
        e.cuando ? CUANDO[e.cuando] || e.cuando : "",
        e.personas ? e.personas + (Number(e.personas) === 1 ? " persona" : " personas") : "",
        e.mascotas === "si" ? "Con mascotas" : e.mascotas === "no" ? "Sin mascotas" : "",
        e.operacion === "venta" ? (e.pago ? "Pago: " + (PAGO[e.pago] || e.pago) : "") : (e.garantia ? GARANTIA[e.garantia] || e.garantia : "")
      ].filter(Boolean).join(" · ");
      var estado = e.estado || "esperando";
      return '<div class="espera-persona espera-persona--' + TE_ESC(estado) + '">' +
        '<div class="espera-persona__cabeza"><strong>' + TE_ESC(e.nombre) + "</strong>" +
          '<span class="tag tag--fuente">' + TE_ESC(ESTADO[estado] || estado) + (e.avisado && estado === "avisado" ? " el " + TE_ESC(fecha(e.avisado)) : "") + "</span>" +
          '<span class="op">Se anotó el ' + TE_ESC(fecha(e.fecha)) + (e.operacion === "venta" ? " · para comprar" : " · para alquilar") + "</span></div>" +
        '<p class="espera-persona__datos"><span class="mono">' + TE_ESC(e.telefono) + "</span> · " + TE_ESC(e.email) + (datos ? "<br>" + TE_ESC(datos) : "") + "</p>" +
        (e.comentario ? '<p class="espera-persona__nota">«' + TE_ESC(e.comentario) + "»</p>" : "") +
        '<div class="espera-persona__acciones">' +
          (wa ? '<a class="lead__wa" data-avisar="' + TE_ESC(e.id) + '" href="' + TE_ESC(wa) + '" target="_blank" rel="noopener">WhatsApp</a>' : "") +
          (e.email ? '<a class="btn btn-chico" data-avisar="' + TE_ESC(e.id) + '" href="mailto:' + TE_ESC(e.email) + "?subject=" + encodeURIComponent(asunto(codigo)) + "&body=" + encodeURIComponent(msj) + '">Email</a>' : "") +
          '<button type="button" class="btn-chico" data-contactado="' + TE_ESC(e.id) + '">' + (estado === "contactado" ? "Volver a esperando" : "Marcar contactado") + "</button>" +
          '<button type="button" class="btn-chico btn-peligro" data-borrar-espera="' + TE_ESC(e.id) + '">Borrar</button>' +
        "</div>" + TE_EDITADO(e) +
      "</div>";
    }).join("") : '<p class="vacio-lista">Nadie en la lista de espera de esta propiedad.</p>';
  }

  function cambiar(ids, cambios) {
    lista = lista.map(function (e) { return ids.indexOf(e.id) >= 0 ? Object.assign({}, e, cambios) : e; });
    guardar();
  }
  function cerrar() { $("espera-modal").hidden = true; abierto = null; porDisponible = false; }

  // A property goes back to "Disponible": offer to tell everyone waiting
  function disponible(codigo) {
    if (esperando(codigo).length) abrir(codigo, true);
  }

  /* ---------- Events ---------- */
  document.addEventListener("click", function (e) {
    var ver = e.target.closest("[data-ver-espera]");
    if (ver) { abrir(ver.dataset.verEspera, false); return; }
  });
  $("espera-personas").addEventListener("click", function (e) {
    var avisar = e.target.closest("[data-avisar]");
    if (avisar) {
      // The link opens WhatsApp or the email; here it is only remembered
      cambiar([avisar.dataset.avisar], { estado: "avisado", avisado: TE_HOY() });
      setTimeout(pintarVentana, 0);
      return;
    }
    var hecho = e.target.closest("[data-contactado]");
    if (hecho) {
      var x = lista.find(function (y) { return y.id === hecho.dataset.contactado; });
      cambiar([hecho.dataset.contactado], { estado: x && x.estado === "contactado" ? "esperando" : "contactado" });
      pintar();
      return;
    }
    var borrar = e.target.closest("[data-borrar-espera]");
    if (borrar) {
      var b = lista.find(function (y) { return y.id === borrar.dataset.borrarEspera; });
      if (!b || !confirm("¿Borrar a " + b.nombre + " de la lista de espera?")) return;
      lista = lista.filter(function (y) { return y.id !== b.id; });
      guardar();
      pintar();
    }
  });
  $("espera-mail-todos").addEventListener("click", function () {
    var ids = esperando(abierto).filter(function (e) { return e.email; }).map(function (e) { return e.id; });
    cambiar(ids, { estado: "avisado", avisado: TE_HOY() });
    setTimeout(pintar, 0);
  });
  $("espera-mensaje").addEventListener("input", function () {
    try { localStorage.setItem("te_espera_mensaje", this.value === MENSAJE ? "" : this.value); } catch (e) {}
    pintarVentana();
  });
  $("espera-mensaje-original").addEventListener("click", function () {
    $("espera-mensaje").value = MENSAJE;
    try { localStorage.removeItem("te_espera_mensaje"); } catch (e) {}
    pintarVentana();
  });
  $("espera-cerrar").addEventListener("click", cerrar);
  $("espera-modal").addEventListener("click", function (e) { if (e.target === this) cerrar(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("espera-modal").hidden) cerrar(); });

  window.TE_ESPERA = { etiqueta: etiqueta, disponible: disponible, abrir: abrir, pintar: pintar };
  pintar();
})();
