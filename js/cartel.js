/* ============================================================
   TRES ESTRUCTURAS — Cartel imprimible (spec §7.4 y §9)
   Tres salidas: cartel A4 de una unidad, QR suelto en PNG,
   y hoja con los QR de todas las disponibles (?todos=1).
   ============================================================ */

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  function formatearPrecio(valor, moneda) {
    var n = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(valor);
    return { simbolo: moneda === "USD" ? "USD" : "$", numero: n };
  }

  function cargar() {
    if (window.__PROPIEDADES__) return Promise.resolve(window.__PROPIEDADES__);
    return fetch("data/propiedades.json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function renderCartel(p) {
    document.title = "Cartel " + p.codigo + " — " + CONFIG.nombre;
    $("hoja-cartel").hidden = false;

    var op = $("c-operacion");
    op.textContent = p.operacion === "venta" ? "Venta" : "Alquiler";
    op.className = "cartel__operacion cartel__operacion--" + p.operacion;

    $("c-titulo").textContent = p.titulo;

    var precio = formatearPrecio(p.precio, p.moneda);
    var precioHTML = '<span class="moneda">' + precio.simbolo + "</span> " + precio.numero;
    if (p.expensas) {
      var e = formatearPrecio(p.expensas, p.monedaExpensas || "ARS");
      precioHTML += ' <span class="moneda">+ ' + e.simbolo + " " + e.numero + " exp.</span>";
    }
    $("c-precio").innerHTML = precioHTML;

    // Tres datos clave (spec §7.4)
    $("c-datos").innerHTML =
      "<span>" + p.ambientes + " amb</span>" +
      "<span>" + p.dormitorios + " dorm</span>" +
      "<span>" + p.m2Totales + " m²</span>";

    // QR variable: apunta a la ficha de ESTA unidad con fuente cartel
    $("c-qr").innerHTML = TE_QR.svg(p.codigo, "cartel");
    $("c-codigo").textContent = "Código " + p.codigo;
    $("c-pie").textContent = CONFIG.dominio.replace(/^https?:\/\//, "") + " · Unidades propias, sin comisión de inmobiliaria";

    $("btn-qr-png").addEventListener("click", function () {
      TE_QR.descargarPNG(p.codigo, "cartel");
    });
    $("nota-cartel").textContent = "El QR abre la ficha de " + p.codigo + " con fuente 'cartel'.";
  }

  function renderTanda(todas) {
    document.title = "Hoja de QRs — " + CONFIG.nombre;
    $("hoja-tanda").hidden = false;
    $("btn-qr-png").hidden = true;
    $("link-tanda").hidden = true;

    var disponibles = todas.filter(function (p) { return p.estado === "disponible"; });
    var cont = $("tanda");
    disponibles.forEach(function (p) {
      var div = document.createElement("div");
      div.className = "tanda__item";
      div.innerHTML =
        TE_QR.svg(p.codigo, "cartel") +
        '<span class="tanda__codigo">' + p.codigo + "</span>" +
        '<span class="tanda__detalle">' + p.titulo + "</span>";
      cont.appendChild(div);
    });
    $("nota-cartel").textContent = disponibles.length + " QRs listos para recortar.";
  }

  function iniciar(codigo, todos) {
    cargar().then(function (todas) {
      if (todos) return renderTanda(todas);
      var p = todas.find(function (x) { return x.codigo === codigo; });
      if (!p) {
        $("c-no-encontrado").hidden = false;
        return;
      }
      renderCartel(p);
    }).catch(function (err) {
      $("c-no-encontrado").hidden = false;
      console.error(err);
    });
  }

  // Expuesto para previews SPA; en produccion arranca solo
  window.TE_CartelInit = iniciar;

  if (!window.__SPA__) {
    var params = new URLSearchParams(location.search);
    var codigo = (params.get("c") || "").toUpperCase();
    if (!codigo && !params.get("todos")) {
      var m = /\/cartel\/([A-Za-z]{3}-?\d{3})/.exec(location.pathname);
      if (m) codigo = m[1].toUpperCase().replace(/^([A-Z]{3})(\d{3})$/, "$1-$2");
    }
    iniciar(codigo, params.get("todos"));
  }
})();
