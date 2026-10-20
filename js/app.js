/* ============================================================
   TRES ESTRUCTURAS — Home: grilla + filtros con estado en la URL
   Sin frameworks. Usa los helpers de js/tarjetas.js (window.TE).
   ============================================================ */

(function () {
  "use strict";

  const grilla = document.getElementById("grilla");
  const vacio = document.getElementById("vacio");
  const contador = document.getElementById("contador");
  const filtrosNav = document.querySelector(".filtros");
  const filaZonas = document.querySelector('.filtros__fila[aria-label="Filtrar por zona"]');
  // The zone chips are rebuilt from the data: always read them live
  const chips = () => Array.from(document.querySelectorAll(".chip[data-filtro]"));
  const btnLimpiar = document.getElementById("limpiar-filtros");

  let propiedades = [];

  /* ---------- Estado de filtros <-> URL (spec §7.1) ---------- */

  function filtrosDesdeURL() {
    const params = new URLSearchParams(location.search);
    return {
      op: params.get("op") || "",
      zona: params.get("zona") || ""
    };
  }

  function filtrosHaciaURL(filtros, reemplazar) {
    const params = new URLSearchParams();
    if (filtros.op) params.set("op", filtros.op);
    if (filtros.zona) params.set("zona", filtros.zona);
    const query = params.toString();
    const url = query ? "?" + query : location.pathname;
    try {
      if (reemplazar) {
        history.replaceState(filtros, "", url);
      } else {
        history.pushState(filtros, "", url);
      }
    } catch (e) {
      // Entornos embebidos (previews) pueden bloquear history; el filtro funciona igual.
    }
  }

  function pintarChips(filtros) {
    chips().forEach(function (chip) {
      const activo = filtros[chip.dataset.filtro] === chip.dataset.valor;
      chip.setAttribute("aria-pressed", String(activo));
    });
  }

  /* ---------- Render ---------- */

  function render(filtros) {
    // Solo se listan las disponibles y reservadas; las cerradas nunca (spec §6)
    const visibles = propiedades.filter(function (p) {
      if (p.estado === "cerrada") return false;
      // A property for rent and for sale shows under both
      if (filtros.op && !TE.ofrece(p, filtros.op)) return false;
      if (filtros.zona && TE.normalizar(p.zona) !== filtros.zona) return false;
      return true;
    });

    // Coming-soon properties go after the ones you can rent or buy today
    visibles.sort(function (a, b) { return TE.esProxima(a) - TE.esProxima(b); });

    grilla.innerHTML = "";
    visibles.forEach(function (p) {
      grilla.appendChild(TE.tarjeta(p, filtros.op));
    });

    const hayResultados = visibles.length > 0;
    grilla.hidden = !hayResultados;
    vacio.hidden = hayResultados;

    pintarChips(filtros);
  }

  function actualizarContador() {
    // Every property the listing shows (all but closed ones), counted from the
    // JSON, never hardcoded (spec §7.1). Reserved ones are listed too, so they count.
    const visibles = propiedades.filter(function (p) {
      return p.estado !== "cerrada" && !TE.esProxima(p);
    }).length;
    const proximas = propiedades.filter(TE.esProxima).length;
    contador.textContent = (visibles === 1 ? "1 propiedad disponible" : visibles + " propiedades disponibles") +
      (proximas ? " y " + proximas + " próximamente" : "") + ".";
  }

  /* ---------- Eventos ---------- */

  // Estado en memoria, espejado en la URL. Si el entorno bloquea history
  // (previews embebidas), los filtros siguen funcionando igual.
  let estado = filtrosDesdeURL();

  filtrosNav.addEventListener("click", function (e) {
    const chip = e.target.closest(".chip[data-filtro]");
    if (!chip) return;
    estado[chip.dataset.filtro] = chip.dataset.valor;
    filtrosHaciaURL(estado, false);
    render(estado);
  });

  /* Zone chips from the listed properties: a zone added in the panel gets its
     button once one of its properties is published, and a zone with none
     doesn't show. The built-in zones keep their order; new ones follow. */
  function pintarZonas() {
    if (!filaZonas) return;
    const orden = typeof CONFIG !== "undefined" && CONFIG.zonas ? Object.keys(CONFIG.zonas).map(function (k) { return TE.normalizar(CONFIG.zonas[k]); }) : [];
    const vistas = {};
    propiedades.forEach(function (p) {
      if (p.estado === "cerrada" || !p.zona) return;
      const clave = TE.normalizar(p.zona);
      if (!vistas[clave]) vistas[clave] = String(p.zona).trim();
    });
    const lugar = function (clave) { const i = orden.indexOf(clave); return i < 0 ? orden.length : i; };
    const claves = Object.keys(vistas).sort(function (a, b) {
      return lugar(a) - lugar(b) || vistas[a].localeCompare(vistas[b], "es");
    });
    filaZonas.querySelectorAll('.chip[data-filtro="zona"]:not([data-valor=""])').forEach(function (c) { c.remove(); });
    claves.forEach(function (clave) {
      const b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.dataset.filtro = "zona";
      b.dataset.valor = clave;
      b.setAttribute("aria-pressed", "false");
      b.textContent = vistas[clave];
      filaZonas.appendChild(b);
    });
  }

  btnLimpiar.addEventListener("click", function () {
    estado = { op: "", zona: "" };
    filtrosHaciaURL(estado, false);
    render(estado);
  });

  window.addEventListener("popstate", function () {
    estado = filtrosDesdeURL();
    render(estado);
  });

  /* ---------- Arranque ---------- */

  // Chat flotante en el home: "Consultar" (spec §9.1), and the header's WhatsApp link
  if (window.TE_Chat) { TE_Chat.cabecera(null); TE_Chat.montar(null); }

  // Owners' block: the same WhatsApp link as the green button
  const waPropietarios = document.getElementById("propietarios-wa");
  if (waPropietarios && window.TE_Chat) waPropietarios.href = TE_Chat.link(null);

  TE.cargarPropiedades()
    .then(function (datos) {
      propiedades = datos;
      pintarZonas();
      actualizarContador();
      render(estado);
    })
    .catch(function (err) {
      grilla.hidden = true;
      vacio.hidden = false;
      vacio.querySelector(".vacio__titulo").textContent = "No se pudieron cargar las propiedades";
      vacio.querySelector(".vacio__texto").textContent = "Recargá la página. Si sigue pasando, avisanos por WhatsApp.";
      console.error(err);
    });
})();
