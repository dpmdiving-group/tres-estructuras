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
  function urlFicha(codigo) {
    if (window.__PREVIEW__) return "#p/" + encodeURIComponent(codigo);
    return "propiedad.html?c=" + encodeURIComponent(codigo);
  }

  // Ruta de una foto relativa a la raiz del sitio
  function rutaFoto(path) {
    return String(path).replace(/^\//, "");
  }

  // Un video vale solo si el dato esta completo de verdad. Un id de relleno
  // ("PENDIENTE360") no puede encender el sello 360 ni abrir una seccion vacia.
  function videoValido(v) {
    if (!v || !v.tipo) return false;
    if (v.tipo === "youtube") return /^[A-Za-z0-9_-]{11}$/.test(v.id || "");
    if (v.tipo === "mp4") return /^(https?:\/\/|\/)/.test(v.url || "");
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
  function tarjeta(p) {
    const precio = formatearPrecio(p.precio, p.moneda);
    const esVenta = p.operacion === "venta";
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

    li.innerHTML =
      '<a class="ficha__link" href="' + urlFicha(p.codigo) + '">' +
        '<div class="ficha__media">' +
          '<img class="ficha__foto" src="' + rutaFoto(p.portada) + '" ' +
               'alt="' + escaparHTML(p.titulo + ", " + p.barrio + ", " + p.zona) + '" loading="lazy" width="1200" height="900">' +
          '<span class="ficha__operacion ficha__operacion--' + p.operacion + '">' +
            (esVenta ? "Venta" : "Alquiler") +
          "</span>" +
          badge360 +
        "</div>" +
        '<div class="ficha__cuerpo">' +
          '<span class="ficha__codigo">' + p.codigo + "</span>" +
          '<h3 class="ficha__titulo">' + escaparHTML(p.titulo) + "</h3>" +
          '<p class="ficha__zona">' + escaparHTML(p.barrio + " · " + p.zona) + "</p>" +
          '<p class="ficha__precio"><span class="ficha__moneda">' + precio.simbolo + "</span> " + precio.numero + "</p>" +
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
    cargarPropiedades: cargarPropiedades
  };
})();
