/* ============================================================
   TRES ESTRUCTURAS — Home: grilla + filtros con estado en la URL
   Sin frameworks. Usa los helpers de js/tarjetas.js (window.TE).
   ============================================================ */

(function () {
  "use strict";

  const grilla = document.getElementById("grilla");
  const vacio = document.getElementById("vacio");
  const contador = document.getElementById("contador");
  const chips = Array.from(document.querySelectorAll(".chip[data-filtro]"));
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
    chips.forEach(function (chip) {
      const activo = filtros[chip.dataset.filtro] === chip.dataset.valor;
      chip.setAttribute("aria-pressed", String(activo));
    });
  }

  /* ---------- Render ---------- */

  function render(filtros) {
    // Solo se listan las disponibles y reservadas; las cerradas nunca (spec §6)
    const visibles = propiedades.filter(function (p) {
      if (p.estado === "cerrada") return false;
      if (filtros.op && p.operacion !== filtros.op) return false;
      if (filtros.zona && TE.normalizar(p.zona) !== filtros.zona) return false;
      return true;
    });

    grilla.innerHTML = "";
    visibles.forEach(function (p) {
      grilla.appendChild(TE.tarjeta(p));
    });

    const hayResultados = visibles.length > 0;
    grilla.hidden = !hayResultados;
    vacio.hidden = hayResultados;

    pintarChips(filtros);
  }

  function actualizarContador() {
    const disponibles = propiedades.filter(function (p) {
      return p.estado === "disponible";
    }).length;
    // Numero real calculado del JSON, nunca hardcodeado (spec §7.1)
    contador.textContent = disponibles + " propiedades disponibles hoy.";
  }

  /* ---------- Eventos ---------- */

  // Estado en memoria, espejado en la URL. Si el entorno bloquea history
  // (previews embebidas), los filtros siguen funcionando igual.
  let estado = filtrosDesdeURL();

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      estado[chip.dataset.filtro] = chip.dataset.valor;
      filtrosHaciaURL(estado, false);
      render(estado);
    });
  });

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

  const telHeader = document.getElementById("tel-header");
  if (telHeader && typeof CONFIG !== "undefined") {
    telHeader.textContent = CONFIG.telefonoVisible;
    telHeader.href = "tel:+" + CONFIG.whatsapp;
  }

  // Chat flotante en el home: "Consultar" (spec §9.1)
  if (window.TE_Chat) TE_Chat.montar(null);

  TE.cargarPropiedades()
    .then(function (datos) {
      propiedades = datos;
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
