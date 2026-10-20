/* ============================================================
   TRES ESTRUCTURAS — Helpers compartidos entre home y ficha.
   Expone window.TE. Sin frameworks.
   ============================================================ */

window.TE = (function () {
  "use strict";

  // Normaliza para comparar sin acentos ("Lanús" -> "lanus")
  function normalizar(texto) {
    return String(texto)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  // Formatea precio segun moneda. Soporta USD y ARS en cualquier operacion (spec §6).
  function formatearPrecio(valor, moneda) {
    const n = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(valor);
    return { simbolo: moneda === "USD" ? "USD" : "$", numero: n };
  }

  // URL de la ficha. Un solo lugar para cambiar el esquema.
  // op: for a property offered for rent and for sale, which one to open
  function urlFicha(codigo, op) {
    if (window.__PREVIEW__) return "#p/" + encodeURIComponent(codigo);
    return "propiedad.html?c=" + encodeURIComponent(codigo) + (op ? "&op=" + encodeURIComponent(op) : "");
  }

  /* Rent and sale at once: "operacion", "precio" and "moneda" are the main
     operation; "tambien" {precio, moneda} offers the other one too. */
  var NOMBRE_OP = { alquiler: "Alquiler", venta: "Venta" };
  function otraOperacion(op) { return op === "venta" ? "alquiler" : "venta"; }
  function tieneOtra(p) { return !!(p && p.tambien && p.tambien.precio > 0); }
  function operaciones(p) {
    return tieneOtra(p) ? [p.operacion, otraOperacion(p.operacion)] : [p.operacion];
  }
  function ofrece(p, op) { return operaciones(p).indexOf(op) >= 0; }
  // The operation to show: the one asked for if offered, else the main one
  function operacionVista(p, op) { return op && ofrece(p, op) ? op : p.operacion; }
  function precioDe(p, op) {
    if (tieneOtra(p) && op === otraOperacion(p.operacion)) {
      return { precio: p.tambien.precio, moneda: p.tambien.moneda || (op === "venta" ? "USD" : "ARS") };
    }
    return { precio: p.precio, moneda: p.moneda };
  }

  // Ruta de una foto relativa a la raiz del sitio
  function rutaFoto(path) {
    return String(path).replace(/^\//, "");
  }

  // Un video vale solo si el dato esta completo de verdad. Un id de relleno
  // ("PENDIENTE360") no puede encender el sello 360 ni abrir una seccion vacia.
  // A YouTube video id from whatever was saved: the id itself, or a full link
  // (watch?v=, youtu.be/, shorts/, live/, embed/), as older panels stored it
  function idYoutube(texto) {
    var t = String(texto || "").trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t;
    var m = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(t);
    return m ? m[1] : null;
  }

  function videoValido(v) {
    if (!v || !v.tipo) return false;
    if (v.tipo === "youtube") return !!idYoutube(v.id);
    // Only a file on this site plays (the CSP blocks video from other sites, and a
    // phone's share link such as Quick Share is a web page, not a video)
    if (v.tipo === "mp4") return /^\/(?!\/)\S+\.(mp4|webm|mov)$/i.test(v.url || "");
    return false;
  }

  function tiene360(p) { return videoValido(p && p.video360); }
  function tieneVideo(p) { return videoValido(p && p.video); }

  function escaparHTML(texto) {
    return String(texto).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Tarjeta de la grilla (spec §7.2). Devuelve un <li>.
  // op: the operation the visitor is looking at (the filter), for a property
  // offered for both: its price goes first and the link opens that one.
  function tarjeta(p, op) {
    const vista = operacionVista(p, op);
    const ambas = tieneOtra(p);
    const pv = precioDe(p, vista);
    const precio = formatearPrecio(pv.precio, pv.moneda);
    const li = document.createElement("li");
    li.className = "ficha";

    const exp = p.expensas
      ? (function () {
          const e = formatearPrecio(p.expensas, p.monedaExpensas || "ARS");
          return '<p class="ficha__expensas">+ ' + e.simbolo + " " + e.numero + " expensas</p>";
        })()
      : "";

    const badge360 = tiene360(p)
      ? '<span class="ficha__360" aria-hidden="true">360°</span>'
      : "";

    const ops = ambas ? [vista, otraOperacion(vista)] : [p.operacion];
    const chips = ops.map(function (o) {
      return '<span class="ficha__operacion ficha__operacion--' + escaparHTML(o) + '">' + (NOMBRE_OP[o] || "Alquiler") + "</span>";
    }).join("");
    const otro = ambas
      ? (function () {
          const o = otraOperacion(vista), po = precioDe(p, o), f = formatearPrecio(po.precio, po.moneda);
          return '<p class="ficha__otro-precio">' + NOMBRE_OP[o] + ": " + f.simbolo + " " + f.numero + "</p>";
        })()
      : "";

    li.innerHTML =
      '<a class="ficha__link" href="' + urlFicha(p.codigo, ambas ? vista : "") + '">' +
        '<div class="ficha__media">' +
          '<img class="ficha__foto" src="' + rutaFoto(p.portada) + '" ' +
               'alt="' + escaparHTML(p.titulo + ", " + p.barrio + ", " + p.zona) + '" loading="lazy" width="1200" height="900">' +
          '<span class="ficha__operaciones">' + chips + "</span>" +
          badge360 +
        "</div>" +
        '<div class="ficha__cuerpo">' +
          '<span class="ficha__codigo">' + escaparHTML(p.codigo) + "</span>" +
          '<h3 class="ficha__titulo">' + escaparHTML(p.titulo) + "</h3>" +
          '<p class="ficha__zona">' + escaparHTML(p.barrio + " · " + p.zona) + "</p>" +
          '<p class="ficha__precio">' + (ambas ? '<span class="ficha__precio-op">' + NOMBRE_OP[vista] + "</span> " : "") +
            '<span class="ficha__moneda">' + precio.simbolo + "</span> " + precio.numero + "</p>" +
          otro +
          exp +
          '<div class="ficha__datos">' +
            "<span>" + p.ambientes + " amb</span>" +
            "<span>" + p.dormitorios + " dorm</span>" +
            "<span>" + p.banos + (p.banos === 1 ? " baño" : " baños") + "</span>" +
            "<span>" + p.m2Cubiertos + " m² cub</span>" +
            (p.m2Totales && p.m2Totales !== p.m2Cubiertos ? "<span>" + p.m2Totales + " m² tot</span>" : "") +
          "</div>" +
        "</div>" +
      "</a>";
    return li;
  }

  // Carga de datos: preview inyectada o fetch del JSON
  function cargarPropiedades() {
    if (window.__PROPIEDADES__) return Promise.resolve(window.__PROPIEDADES__);
    return fetch("data/propiedades.json").then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  return {
    normalizar: normalizar,
    formatearPrecio: formatearPrecio,
    urlFicha: urlFicha,
    rutaFoto: rutaFoto,
    escaparHTML: escaparHTML,
    tiene360: tiene360,
    tieneVideo: tieneVideo,
    tarjeta: tarjeta,
    NOMBRE_OP: NOMBRE_OP,
    otraOperacion: otraOperacion,
    tieneOtra: tieneOtra,
    operaciones: operaciones,
    ofrece: ofrece,
    operacionVista: operacionVista,
    precioDe: precioDe,
    cargarPropiedades: cargarPropiedades,
    idYoutube: idYoutube
  };
})();
