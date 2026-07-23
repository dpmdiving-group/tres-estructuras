/* ============================================================
   TRES ESTRUCTURAS — Ficha de propiedad (spec §7.3)
   Deep link: propiedad.html?c=QLM-014. Funciona entrando en
   frio desde el QR. La URL nunca muere (spec §9).
   ============================================================ */

(function () {
  "use strict";

  const $ = function (id) { return document.getElementById(id); };

  /* ---------- Iconos de amenities (trazo simple, color ocre) ---------- */
  const ICONO_BASE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  const ICONOS = {
    pileta: '<path d="M2 15c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M2 19c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M8 15V6a2 2 0 0 1 4 0M14 13V6a2 2 0 0 1 4 0"/>',
    parrilla: '<path d="M4 10h16M6 10c0 3 2.5 5 6 5s6-2 6-5M12 15v5M8 20h8M9 6c0-1 .5-1 .5-2M12.5 6c0-1 .5-1 .5-2M16 6c0-1 .5-1 .5-2"/>',
    cochera: '<path d="M3 17V9l3-4h12l3 4v8M3 13h18M7 17v2M17 17v2"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>',
    patio: '<path d="M12 3v18M12 3c-3 0-5 2-5 5 0 0 2 1 5 1M12 3c3 0 5 2 5 5 0 0-2 1-5 1M5 21h14"/>',
    balcon: '<path d="M4 11h16M4 11v8M20 11v8M8 11v8M12 11v8M16 11v8M3 19h18M12 11V4M8 7l4-3 4 3"/>',
    terraza: '<circle cx="12" cy="8" r="3"/><path d="M12 1v2M12 13v2M5 8H3M21 8h-2M6.5 2.5l1.4 1.4M17.5 2.5l-1.4 1.4M4 21h16M6 21v-4M18 21v-4"/>',
    jardin: '<path d="M12 21v-8M12 13c0-4-3-7-7-7 0 4 3 7 7 7zM12 13c0-4 3-7 7-7 0 4-3 7-7 7zM5 21h14"/>',
    seguridad: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    sum: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c0-3 3-5 6-5s6 2 6 5M14 15c3 0 6 2 6 5"/>',
    gimnasio: '<path d="M7 8v8M17 8v8M4 10v4M20 10v4M7 12h10"/>',
    ascensor: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 3v18M8.5 9l-1.5 2h3zM15.5 15l1.5-2h-3z"/>',
    lavadero: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="5"/><path d="M9 12c1 1 2 1 3 0s2-1 3 0M7 6h2"/>',
    aire: '<path d="M12 3v18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12h18M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
    calefaccion: '<path d="M12 21c4 0 6-2.5 6-6 0-4-3-6-3-9-2 1-2.5 3-2.5 5C11 8 9.5 5.5 10 3 7 5 6 9 6 12c0 5 2.5 9 6 9z"/>',
    amoblado: '<path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3M4 18v-4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M4 18h16M6 18v2M18 18v2"/>',
    mascotas: '<circle cx="8" cy="7" r="1.6"/><circle cx="16" cy="7" r="1.6"/><circle cx="4.8" cy="11" r="1.6"/><circle cx="19.2" cy="11" r="1.6"/><path d="M12 11c-2.5 0-5 2.5-5 5 0 1.6 1 2.6 2.5 2.6 1 0 1.7-.6 2.5-.6s1.5.6 2.5.6c1.5 0 2.5-1 2.5-2.6 0-2.5-2.5-5-5-5z"/>',
    apto_credito: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18M3 21h18"/>',
    apto_profesional: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
    _generico: '<path d="M20 12l-8 8-8-8 8-8z"/><circle cx="12" cy="12" r="1.4"/>'
  };

  function iconoAmenity(clave) {
    return ICONO_BASE + (ICONOS[clave] || ICONOS._generico) + "</svg>";
  }

  function etiquetaAmenity(clave) {
    if (CONFIG.amenities[clave]) return CONFIG.amenities[clave];
    // Clave fuera del diccionario: se muestra igual, nunca se descarta (spec §6)
    return clave.replace(/_/g, " ").replace(/^./, function (c) { return c.toUpperCase(); });
  }

  /* ---------- WhatsApp con atribucion por fuente (spec §9, via TE_Chat) ---------- */
  function linkWhatsApp(p) {
    return TE_Chat.link(p);
  }

  /* ---------- Video con carga diferida (spec §10) ---------- */
  function fachadaVideo(video, lugar, titulo) {
    if (video.tipo === "youtube") {
      const fachada = document.createElement("button");
      fachada.className = "video-fachada";
      fachada.setAttribute("aria-label", "Reproducir video: " + titulo);
      fachada.innerHTML =
        '<img src="https://i.ytimg.com/vi/' + encodeURIComponent(video.id) + '/hqdefault.jpg" alt="" loading="lazy">' +
        '<span class="video-fachada__play"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span>';
      fachada.addEventListener("click", function () {
        const marco = document.createElement("div");
        marco.className = "video-marco";
        marco.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(video.id) +
          '?autoplay=1&rel=0" title="' + TE.escaparHTML(titulo) +
          '" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
        fachada.replaceWith(marco);
      });
      lugar.appendChild(fachada);
    } else if (video.tipo === "mp4") {
      const marco = document.createElement("div");
      marco.className = "video-marco";
      const v = document.createElement("video");
      v.controls = true;
      v.preload = "none";
      v.src = video.url;
      marco.appendChild(v);
      lugar.appendChild(marco);
    }
  }

  /* ---------- Datos duros ---------- */
  function datoDuro(nombre, valor) {
    if (valor === null || valor === undefined || valor === "") return "";
    return '<div class="dato-duro"><dt>' + nombre + "</dt><dd>" + valor + "</dd></div>";
  }

  /* ---------- Render principal ---------- */
  function renderFicha(p, todas) {
    document.title = p.titulo + " en " + p.zona + " — " +
      (p.operacion === "venta" ? "Venta" : "Alquiler") + " | " + CONFIG.nombre;

    // SEO dinamico (spec §11): descripcion y JSON-LD.
    // Los crawlers sin JS ya reciben esto en las paginas /p/ generadas.
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      const d = (p.descripcion || "").replace(/\s+/g, " ").trim();
      metaDesc.setAttribute("content", d.length > 155 ? d.slice(0, 152) + "…" : d);
    }
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      "name": p.titulo,
      "url": CONFIG.dominio + "/p/" + p.codigo,
      "image": CONFIG.dominio + p.portada,
      "offers": { "@type": "Offer", "price": p.precio, "priceCurrency": p.moneda }
    });
    document.head.appendChild(ld);

    // URL corta y compartible en la barra de direcciones (solo en produccion)
    if (!window.__SPA__ && location.protocol.indexOf("http") === 0) {
      try {
        const f = new URLSearchParams(location.search).get("f");
        history.replaceState(null, "", "/p/" + p.codigo + (f ? "?f=" + f : ""));
      } catch (e) {}
    }

    $("migas").hidden = false;
    $("miga-codigo").textContent = p.codigo;

    // 1. Galeria
    const alts = p.fotos.map(function (_, i) {
      return p.titulo + " — foto " + (i + 1) + " de " + p.fotos.length + ", " + p.barrio + ", " + p.zona;
    });
    TE_Galeria(p.fotos, alts);

    // 2. Precio, operacion, codigo, direccion aproximada
    $("encabezado").hidden = false;
    const chipOp = $("chip-operacion");
    chipOp.textContent = p.operacion === "venta" ? "Venta" : "Alquiler";
    chipOp.className = "chip-operacion chip-operacion--" + p.operacion;
    if (p.estado === "reservada") {
      $("chip-estado").hidden = false;
      $("chip-estado").textContent = "Reservada";
    }
    $("codigo").textContent = p.codigo;
    $("titulo").textContent = p.titulo;
    $("ubicacion-linea").textContent = p.barrio + " · " + p.zona;

    const precio = TE.formatearPrecio(p.precio, p.moneda);
    $("precio").innerHTML = '<span class="moneda">' + precio.simbolo + "</span> " + precio.numero;

    // Expensas siempre visibles al lado del precio si existen (spec §6)
    if (p.expensas) {
      const e = TE.formatearPrecio(p.expensas, p.monedaExpensas || "ARS");
      $("expensas").hidden = false;
      $("expensas").textContent = "+ " + e.simbolo + " " + e.numero + " de expensas";
    }

    // 3. Boton de WhatsApp (el elemento mas importante de la web)
    $("boton-wa").href = linkWhatsApp(p);
    $("boton-wa-texto").textContent = "Consultar por " + p.codigo;

    // Chat flotante contextual: muestra el codigo de esta propiedad (spec §9.1)
    if (window.TE_Chat) TE_Chat.montar(p);

    // 4. Datos duros
    $("sec-datos").hidden = false;
    let datosHTML =
      datoDuro("Ambientes", p.ambientes) +
      datoDuro("Dormitorios", p.dormitorios) +
      datoDuro("Baños", p.banos) +
      datoDuro("Cocheras", p.cocheras) +
      datoDuro("m² cubiertos", p.m2Cubiertos) +
      datoDuro("m² totales", p.m2Totales) +
      (p.antiguedad ? datoDuro("Antigüedad", p.antiguedad + " años") : datoDuro("Antigüedad", "A estrenar")) +
      (p.expensas ? datoDuro("Expensas", TE.formatearPrecio(p.expensas, p.monedaExpensas || "ARS").simbolo + " " + TE.formatearPrecio(p.expensas, p.monedaExpensas || "ARS").numero) : "");
    // Relleno para que la grilla no muestre celdas grises (2 y 4 columnas)
    const nDatos = (datosHTML.match(/dato-duro/g) || []).length;
    for (let r = 0; r < (4 - (nDatos % 4)) % 4; r++) {
      datosHTML += '<div class="dato-duro" aria-hidden="true"></div>';
    }
    $("datos-duros").innerHTML = datosHTML;

    // 5. Descripcion
    if (p.descripcion) {
      $("sec-descripcion").hidden = false;
      $("descripcion").textContent = p.descripcion;
    }

    // 6. Video recorrido (diferido)
    if (p.video && p.video.tipo) {
      $("sec-video").hidden = false;
      fachadaVideo(p.video, $("video-lugar"), "Video recorrido de " + p.codigo);
    }

    // 7. Video 360 (spec §8): si no hay, la seccion no se muestra
    if (p.video360 && p.video360.tipo && window.TE_Visor360) {
      $("sec-video360").hidden = false;
      TE_Visor360.montar(p.video360, $("video360-lugar"), "Recorrido 360 de " + p.codigo);
    }

    // 8. Amenities
    if (p.amenities && p.amenities.length) {
      $("sec-amenities").hidden = false;
      $("amenities").innerHTML = p.amenities.map(function (clave) {
        return '<li class="amenity">' + iconoAmenity(clave) + "<span>" + TE.escaparHTML(etiquetaAmenity(clave)) + "</span></li>";
      }).join("");
    }

    // 9. Ubicacion aproximada (sin API de mapas en v1)
    $("sec-ubicacion").hidden = false;
    $("ubicacion-detalle").textContent = p.barrio + ", " + p.zona + ".";

    // 10. Otras propiedades en la misma zona
    renderRelacionadas(p, todas);
  }

  function renderRelacionadas(p, todas) {
    let otras = todas.filter(function (x) {
      return x.codigo !== p.codigo && x.estado !== "cerrada" && x.zona === p.zona;
    });
    let titulo = "Otras propiedades en " + p.zona;
    if (otras.length < 3) {
      const resto = todas.filter(function (x) {
        return x.codigo !== p.codigo && x.estado !== "cerrada" && x.zona !== p.zona;
      });
      otras = otras.concat(resto);
      if (otras.length && otras.length > 0) titulo = "Otras propiedades";
    }
    otras = otras.slice(0, 3);
    if (!otras.length) return;
    $("sec-relacionadas").hidden = false;
    $("relacionadas-titulo").textContent = titulo;
    const grilla = $("relacionadas-grilla");
    otras.forEach(function (x) { grilla.appendChild(TE.tarjeta(x)); });
  }

  /* ---------- Estados especiales: la URL nunca muere (spec §9) ---------- */
  function renderNoDisponible(p, todas) {
    document.title = "Propiedad no disponible — " + CONFIG.nombre;
    $("no-disponible").hidden = false;
    if (window.TE_Chat) TE_Chat.montar(null);
    renderRelacionadas(p, todas);
  }

  function renderNoEncontrada(todas) {
    document.title = "Propiedad no encontrada — " + CONFIG.nombre;
    $("no-disponible").hidden = false;
    $("no-disponible-titulo").textContent = "No encontramos esa propiedad";
    $("no-disponible-texto").textContent = "El código puede estar mal escrito, o la unidad ya no está publicada. Estas son las que tenemos hoy.";
    renderRelacionadas({ codigo: "", zona: "" }, todas);
  }

  /* ---------- Arranque ---------- */
  const telHeader = $("tel-header");
  if (telHeader && typeof CONFIG !== "undefined") {
    telHeader.textContent = CONFIG.telefonoVisible;
    telHeader.href = "tel:+" + CONFIG.whatsapp;
  }

  function iniciar(codigo) {
    TE.cargarPropiedades().then(function (todas) {
      const p = todas.find(function (x) { return x.codigo === codigo; });
      if (!p) return renderNoEncontrada(todas);
      if (p.estado === "cerrada") return renderNoDisponible(p, todas);
      renderFicha(p, todas);
    }).catch(function (err) {
      $("no-disponible").hidden = false;
      $("no-disponible-titulo").textContent = "No se pudo cargar la propiedad";
      $("no-disponible-texto").textContent = "Recargá la página. Si sigue pasando, avisanos por WhatsApp.";
      console.error(err);
    });
  }

  // Expuesto para previews SPA; en produccion arranca solo con ?c=
  window.TE_FichaInit = iniciar;

  if (!window.__SPA__) {
    if (window.__FICHA_CODIGO__) {
      iniciar(window.__FICHA_CODIGO__);
    } else {
      // Codigo desde ?c= o desde las rutas cortas /p/{codigo} y /propiedad/{codigo}
      // (los redirects de Netlify reescriben, pero este fallback cubre todo)
      let codigo = new URLSearchParams(location.search).get("c") || "";
      if (!codigo) {
        const m = /\/(?:p|propiedad)\/([A-Za-z]{3}-?\d{3})/.exec(location.pathname);
        if (m) codigo = m[1].replace(/^([A-Za-z]{3})(\d{3})$/, "$1-$2");
      }
      iniciar(codigo.toUpperCase());
    }
  }
})();
