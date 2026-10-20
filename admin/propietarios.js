/* ============================================================
   TRES ESTRUCTURAS — Owners of third-party rentals (Contabilidad)

   Each owner (name, WhatsApp, a private note) is chosen in the rental
   contract, in Cobros. Every month the panel puts together their
   statement: the rent collected, minus the commission and the expenses
   of their properties (te-cobros.js: cierrePropietario), and sends it by
   WhatsApp with one tap (wa.me, from the phone in use). Shared between
   phones like the rest of the panel data; never published.
   ============================================================ */

(function () {
  "use strict";

  var K = window.TE_COBROS;
  var $ = function (id) { return document.getElementById(id); };
  var col = TE_DATOS.coleccion("propietarios", { local: "te_propietarios" });
  var propietarios = col.leer() || [];
  var editando = null;
  var abiertos = {};   // owner id -> the statement's detail is shown

  col.alCambiar(function (lista) { propietarios = lista; pintar(); });
  function guardar() { col.guardar(propietarios); }

  function avisar(msg, esError) {
    var n = document.querySelector(".aviso-flotante");
    if (!n) { n = document.createElement("div"); n.className = "aviso-flotante"; n.setAttribute("role", "status"); document.body.appendChild(n); }
    n.classList.toggle("aviso-flotante--error", !!esError);
    n.textContent = msg;
    clearTimeout(n._t);
    n._t = setTimeout(function () { n.remove(); }, 3500);
  }

  function porId(id) { return propietarios.find(function (p) { return p.id === id; }) || null; }
  function nombre(id) { var p = porId(id); return p ? p.nombre : ""; }
  function ordenados() {
    return propietarios.slice().sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), "es"); });
  }

  /* ---------- Data from the other tabs ---------- */
  function contratos() { return window.TE_COBROS_UI ? TE_COBROS_UI.contratos() : []; }
  function pagos() { return window.TE_COBROS_UI ? TE_COBROS_UI.pagos() : []; }
  function movs() { return window.TE_CONTA ? TE_CONTA.movimientos() : []; }
  function mes() { return window.TE_CONTA ? TE_CONTA.mes() : TE_HOY().slice(0, 7); }

  // How a property is called in the statement: its code and the internal
  // reference (the owner knows their own address), else its contract's name
  function nombrePropiedad(g) {
    if (!g.codigo) return g.etiqueta;
    var ref = window.TE_ADMIN && TE_ADMIN.referencia ? TE_ADMIN.referencia(g.codigo) : "";
    var p = window.TE_ADMIN ? TE_ADMIN.obtenerProps().find(function (x) { return x.codigo === g.codigo; }) : null;
    return g.codigo + (ref ? " · " + ref : p && p.barrio ? " · " + p.barrio : "");
  }

  function conSigno(n, moneda) { return (n < 0 ? "− " : "") + K.formato(Math.abs(n), moneda); }

  /* ---------- For the contract form (Cobros) ---------- */
  function llenarSelect(sel, valor) {
    sel.innerHTML = "";
    function opcion(v, texto) {
      var o = document.createElement("option");
      o.value = v; o.textContent = texto;
      sel.appendChild(o);
    }
    opcion("", "— Ninguno (la propiedad es de ustedes) —");
    ordenados().forEach(function (p) { opcion(p.id, p.nombre); });
    if (valor && !porId(valor)) opcion(valor, "(propietario borrado)");
    opcion("__nuevo", "+ Nuevo propietario…");
    sel.value = valor || "";
  }

  function crear(nombreNuevo) {
    var p = { id: "O" + Date.now() + Math.random().toString(36).slice(2, 5), nombre: String(nombreNuevo).trim() };
    propietarios = propietarios.concat([p]);
    guardar();
    pintar();
    return p.id;
  }

  /* ---------- The statements of the month ---------- */
  function pintar() {
    var cont = $("lista-propietarios");
    if (!cont || !K) return;
    var m = mes();
    var lista = ordenados();
    if (!lista.length) {
      cont.innerHTML = '<p class="vacio-lista">Todavía no hay propietarios. Agregá uno con "+ Propietario" y elegilo en su contrato, en Cobros.</p>';
      return;
    }
    cont.innerHTML = lista.map(function (o) {
      var c = K.cierrePropietario(o.id, contratos(), pagos(), movs(), m);
      var monedas = Object.keys(c.totales);
      var negativo = monedas.some(function (mon) { return c.totales[mon].neto < 0; });
      var resumen = !c.contratos ? "" : c.vacio ? "Sin cobros ni gastos este mes"
        : (negativo ? "" : "A transferir ") + monedas.map(function (mon) { return conSigno(c.totales[mon].neto, mon); }).join(" · ");
      var detalle = abiertos[o.id] && c.contratos
        ? '<ul class="propietario__detalle">' + c.propiedades.map(function (g) {
            return '<li class="prop"><span>' + TE_ESC(nombrePropiedad(g)) + "</span></li>" +
              (g.lineas.length
                ? g.lineas.map(function (l) {
                    return "<li><span>" + TE_ESC(l.texto) + '</span><span class="num">' + (l.monto < 0 ? "− " : "+ ") + K.formato(Math.abs(l.monto), l.moneda) + "</span></li>";
                  }).join("")
                : '<li><span class="op">Sin cobros ni gastos este mes</span></li>');
          }).join("") + "</ul>"
        : "";
      var texto = K.mensajeCierre(o, c, m, { nombre: typeof CONFIG !== "undefined" ? CONFIG.nombre : "", nombrePropiedad: nombrePropiedad });
      // Without a number, WhatsApp asks which contact to send it to
      var link = K.waLink(o.telefono, texto) || "https://wa.me/?text=" + encodeURIComponent(texto);
      var enviado = o.enviados && o.enviados[m];
      return '<div class="propietario" data-propietario="' + TE_ESC(o.id) + '">' +
        '<div class="propietario__cabeza">' +
          '<span class="propietario__nombre">' + TE_ESC(o.nombre) + "</span>" +
          '<span class="op">' + (c.contratos ? c.contratos + (c.contratos === 1 ? " contrato" : " contratos") : "Sin contratos: elegilo en su contrato, en Cobros") + "</span>" +
          (resumen ? '<span class="propietario__total' + (negativo ? " propietario__total--negativo" : "") + '">' + TE_ESC(resumen) + "</span>" : "") +
        "</div>" +
        detalle +
        '<div class="propietario__acciones">' +
          (c.contratos
            ? '<button class="btn-chico" data-ver-cierre="' + TE_ESC(o.id) + '">' + (abiertos[o.id] ? "Ocultar detalle" : "Ver detalle") + "</button>" +
              '<a class="lead__wa" data-enviar-cierre="' + TE_ESC(o.id) + '" href="' + TE_ESC(link) + '" target="_blank" rel="noopener">Mandar el cierre por WhatsApp</a>'
            : "") +
          '<button class="btn-chico" data-editar-propietario="' + TE_ESC(o.id) + '">Editar</button>' +
          (enviado ? '<span class="propietario__enviado">Cierre enviado el ' + TE_ESC(K.fechaCorta(enviado)) + "</span>" : "") +
          (c.contratos && !K.waLink(o.telefono, "") ? '<span class="op">Sin WhatsApp cargado: vas a elegir el contacto.</span>' : "") +
        "</div>" +
        TE_EDITADO(o) +
      "</div>";
    }).join("");
  }

  $("lista-propietarios").addEventListener("click", function (e) {
    var ver = e.target.closest("[data-ver-cierre]");
    if (ver) { abiertos[ver.dataset.verCierre] = !abiertos[ver.dataset.verCierre]; pintar(); return; }
    var enviar = e.target.closest("[data-enviar-cierre]");
    if (enviar) {
      // The link opens WhatsApp; the panel only remembers it was sent this month
      var m = mes();
      propietarios = propietarios.map(function (p) {
        if (p.id !== enviar.dataset.enviarCierre) return p;
        var enviados = Object.assign({}, p.enviados);
        enviados[m] = TE_HOY();
        return Object.assign({}, p, { enviados: enviados });
      });
      guardar();
      setTimeout(pintar, 0);
      return;
    }
    var editar = e.target.closest("[data-editar-propietario]");
    if (editar) abrir(editar.dataset.editarPropietario);
  });

  /* ---------- Owner form ---------- */
  function abrir(id) {
    var o = id ? porId(id) : null;
    editando = o ? o.id : null;
    $("form-propietario-titulo").textContent = o ? o.nombre : "Nuevo propietario";
    $("o-nombre").value = o ? o.nombre || "" : "";
    $("o-telefono").value = o ? o.telefono || "" : "";
    $("o-nota").value = o ? o.nota || "" : "";
    var suyos = o ? contratos().filter(function (c) { return c.propietario === o.id; }) : [];
    $("o-contratos").textContent = suyos.length
      ? "Contratos: " + suyos.map(function (c) { return (c.codigo || K.etiquetaPropiedad(c)) + (c.inquilino ? " (" + c.inquilino + ")" : ""); }).join(", ") + "."
      : "Para que reciba el cierre, elegilo como propietario en su contrato (Cobros).";
    $("btn-eliminar-propietario").hidden = !o;
    $("form-propietario").hidden = false;
    $("form-propietario").scrollIntoView({ behavior: "smooth" });
    $("o-nombre").focus({ preventScroll: true });
  }

  $("btn-nuevo-propietario").addEventListener("click", function () { abrir(null); });
  $("btn-cancelar-propietario").addEventListener("click", function () { $("form-propietario").hidden = true; editando = null; });

  $("btn-guardar-propietario").addEventListener("click", function () {
    var nombreNuevo = $("o-nombre").value.trim();
    if (!nombreNuevo) { avisar("Falta el nombre del propietario.", true); return; }
    var datos = { nombre: nombreNuevo, telefono: $("o-telefono").value.trim(), nota: $("o-nota").value.trim() };
    if (editando) {
      propietarios = propietarios.map(function (p) { return p.id === editando ? Object.assign({}, p, datos) : p; });
    } else {
      propietarios = propietarios.concat([Object.assign({ id: "O" + Date.now() + Math.random().toString(36).slice(2, 5) }, datos)]);
    }
    guardar();
    editando = null;
    $("form-propietario").hidden = true;
    pintar();
    avisar("Propietario guardado.");
  });

  $("btn-eliminar-propietario").addEventListener("click", function () {
    var o = editando ? porId(editando) : null;
    if (!o) return;
    var suyos = contratos().filter(function (c) { return c.propietario === o.id; });
    if (suyos.length) {
      avisar("Tiene " + suyos.length + (suyos.length === 1 ? " contrato" : " contratos") + ". Primero sacalo de " + (suyos.length === 1 ? "su contrato" : "sus contratos") + ", en Cobros.", true);
      return;
    }
    if (!confirm("¿Eliminar a " + o.nombre + "?")) return;
    propietarios = propietarios.filter(function (p) { return p.id !== o.id; });
    guardar();
    editando = null;
    $("form-propietario").hidden = true;
    pintar();
  });

  window.TE_PROPIETARIOS = { pintar: pintar, nombre: nombre, llenarSelect: llenarSelect, crear: crear };
  pintar();
})();
