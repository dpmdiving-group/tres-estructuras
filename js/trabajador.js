/* ============================================================
   TRES ESTRUCTURAS — "Mis trabajos": a worker's own page

   Opened from the personal link the panel creates
   (/trabajador/#t=<secret>). The secret is kept on the phone, so
   the page added to the home screen keeps working. It shows only
   this worker's jobs, by day (overdue first), with where to go, and
   lets them mark each one as done or not done, with a note.

   Works with poor signal: the last list stays on the phone, and a
   mark made without signal is sent as soon as there is.
   Server side: netlify/functions/trabajador.mjs.
   ============================================================ */

(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var CLAVE_TOKEN = "te_trabajador_token";
  var CLAVE_DATOS = "te_trabajador_datos";
  var CLAVE_COLA = "te_trabajador_cola";
  var DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  function leer(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function escribir(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // The secret comes in the link once; then it lives on the phone and leaves the address bar
  var m = /[#&]t=([A-Za-z0-9_-]{20,200})/.exec(location.hash);
  if (m) {
    try { localStorage.setItem(CLAVE_TOKEN, m[1]); } catch (e) {}
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
  }
  var token = m ? m[1] : (function () { try { return localStorage.getItem(CLAVE_TOKEN); } catch (e) { return null; } })();

  var datos = leer(CLAVE_DATOS);        // last answer from the server
  var props = {};                       // public listing, for titles and neighbourhoods
  var abierto = null;                   // {id, estado}: the note form on screen

  function estado(texto, esError) {
    $("tr-estado").textContent = texto || "";
    $("tr-estado").classList.toggle("tr__estado--error", !!esError);
  }

  function api(cuerpo) {
    return fetch("/.netlify/functions/trabajador", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Trabajador " + token },
      body: JSON.stringify(cuerpo)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || "Error " + r.status); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  /* ---------- Marks waiting for signal ---------- */
  function cola() { return leer(CLAVE_COLA) || []; }

  // A mark shows at once, even before it reaches the server
  function conCola(lista) {
    var pendientes = cola();
    return (lista || []).map(function (t) {
      var p = pendientes.filter(function (x) { return x.id === t.id; }).pop();
      return p ? Object.assign({}, t, { estado: p.estado, notaTrabajador: p.nota, _sinEnviar: true }) : t;
    });
  }

  function enviarCola() {
    var pendientes = cola();
    if (!pendientes.length || !token) return Promise.resolve();
    var x = pendientes[0];
    return api({ accion: "actualizar", id: x.id, estado: x.estado, nota: x.nota }).then(function (r) {
      escribir(CLAVE_COLA, cola().slice(1));
      if (datos && r.trabajo) {
        datos.trabajos = datos.trabajos.map(function (t) { return t.id === r.trabajo.id ? r.trabajo : t; });
        escribir(CLAVE_DATOS, datos);
      }
      return enviarCola();
    }, function (e) {
      // The job is no longer theirs, or the mark is refused: drop it so the rest can go
      if (e.status && e.status !== 401 && e.status < 500 && e.status !== 409) {
        escribir(CLAVE_COLA, cola().slice(1));
        estado("No se pudo guardar un trabajo: " + e.message, true);
        return enviarCola();
      }
      throw e;
    });
  }

  /* ---------- Drawing ---------- */
  function sumarDias(fecha, n) {
    var d = new Date(fecha + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function nombreDia(fecha, hoy) {
    if (fecha === hoy) return "Hoy";
    if (fecha === sumarDias(hoy, 1)) return "Mañana";
    var d = new Date(fecha + "T12:00:00");
    var n = DIAS[d.getDay()];
    return n.charAt(0).toUpperCase() + n.slice(1) + " " + d.getDate() + "/" + (d.getMonth() + 1);
  }

  function dondeDe(t) {
    var p = props[t.codigo];
    var ref = datos && datos.referencias && datos.referencias[t.codigo];
    var lugar = t.donde || ref || "";
    var zona = p ? [p.barrio, p.zona].filter(Boolean).join(", ") : "";
    return { texto: lugar || zona, zona: zona, prop: p };
  }

  function mapa(lugar, zona) {
    var q = [lugar, zona, "Buenos Aires, Argentina"].filter(Boolean).join(", ");
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  }

  function tarjeta(t) {
    var cat = (datos.categorias && datos.categorias[t.categoria]) || { nombre: t.categoria || "Trabajo", color: "#57616A" };
    var d = dondeDe(t);
    var hecho = t.estado === "hecho", noSe = t.estado === "no_se_pudo";
    var html = '<article class="tr__card' + (hecho || noSe ? " tr__card--hecho" : "") + '" style="border-left-color:' + esc(cat.color) + '" data-id="' + esc(t.id) + '">' +
      '<div class="tr__fila"><span class="tr__hora">' + esc(t.hora || "Sin hora") + "</span>" +
      '<span class="tr__cat" style="background:' + esc(cat.color) + '">' + esc(cat.nombre) + "</span></div>" +
      '<p class="tr__que">' + esc(t.descripcion) + "</p>";
    if (d.texto) html += '<p class="tr__donde">📍 ' + esc(d.texto) + "</p>";
    if (t.codigo) html += '<p class="tr__prop">' + esc(t.codigo) + (d.prop ? " · " + esc(d.prop.titulo) : "") + "</p>";
    if (hecho || noSe) {
      html += '<p class="tr__resultado tr__resultado--' + (hecho ? "ok" : "no") + '">' + (hecho ? "✔ Resuelto" : "✖ No se pudo hacer") + "</p>" +
        (t.notaTrabajador ? '<p class="tr__nota">' + esc(t.notaTrabajador) + "</p>" : "") +
        (t._sinEnviar ? '<p class="tr__pendiente-envio">Se envía cuando haya señal.</p>' : "") +
        '<div class="tr__acciones"><button type="button" class="tr__btn" data-deshacer>Volver a pendiente</button></div>';
    } else if (abierto && abierto.id === t.id) {
      var esNo = abierto.estado === "no_se_pudo";
      html += '<div class="tr__form"><label>' + (esNo ? "¿Por qué no se pudo hacer? (obligatorio)" : "Contá qué hiciste (opcional)") +
        '<textarea id="tr-nota" maxlength="500"></textarea></label>' +
        '<div class="tr__acciones"><button type="button" class="tr__btn ' + (esNo ? "tr__btn--no" : "tr__btn--ok") + '" data-guardar>Guardar</button>' +
        '<button type="button" class="tr__btn" data-cancelar>Cancelar</button></div></div>';
    } else {
      html += '<div class="tr__acciones">' +
        (d.texto ? '<a class="tr__btn" href="' + esc(mapa(d.texto, d.zona)) + '" target="_blank" rel="noopener">Cómo llegar</a>' : "") +
        '<button type="button" class="tr__btn tr__btn--ok" data-marcar="hecho">Resuelto</button>' +
        '<button type="button" class="tr__btn tr__btn--no" data-marcar="no_se_pudo">No se pudo</button></div>';
    }
    return html + "</article>";
  }

  function pintar() {
    if (!token) { $("tr-sin-link").hidden = false; $("tr-lista").innerHTML = ""; return; }
    if (!datos) return;
    $("tr-hola").textContent = "Hola, " + String(datos.trabajador.nombre || "").split(" ")[0];
    var hoy = datos.hoy;
    var lista = conCola(datos.trabajos);
    var atrasados = lista.filter(function (t) { return t.estado === "pendiente" && t.fecha < hoy; });
    var porDia = {};
    lista.forEach(function (t) {
      if (t.fecha < hoy) return;
      (porDia[t.fecha] = porDia[t.fecha] || []).push(t);
    });
    var hechosAntes = lista.filter(function (t) { return t.estado !== "pendiente" && t.fecha < hoy; }).reverse();
    var html = "";
    if (atrasados.length) html += '<h2 class="tr__dia tr__dia--atrasados">Atrasados</h2>' + atrasados.map(tarjeta).join("");
    Object.keys(porDia).sort().forEach(function (f) {
      html += '<h2 class="tr__dia">' + esc(nombreDia(f, hoy)) + "</h2>" + porDia[f].map(tarjeta).join("");
    });
    if (hechosAntes.length) {
      html += '<details class="tr__hechos"><summary>Hechos los últimos días (' + hechosAntes.length + ")</summary>" + hechosAntes.map(tarjeta).join("") + "</details>";
    }
    $("tr-lista").innerHTML = html;
    $("tr-vacio").hidden = !!html;
    var nota = $("tr-nota");
    if (nota) nota.focus();
  }

  /* ---------- Loading ---------- */
  function cargar() {
    if (!token) { pintar(); return Promise.resolve(); }
    estado(datos ? "Actualizando…" : "Cargando tus trabajos…");
    return enviarCola().catch(function () {}).then(function () {
      return api({ accion: "leer" });
    }).then(function (r) {
      datos = r;
      escribir(CLAVE_DATOS, datos);
      estado(cola().length ? "Hay cambios que se envían cuando haya señal." : "");
      pintar();
    }, function (e) {
      if (e.status === 401) {
        estado(e.message, true);
        datos = null;
        try { localStorage.removeItem(CLAVE_DATOS); } catch (x) {}
        $("tr-lista").innerHTML = "";
        return;
      }
      estado(datos ? "Sin señal: te muestro lo último que se cargó." : "No se pudieron cargar tus trabajos. Probá de nuevo en un rato.", true);
      pintar();
    });
  }

  fetch("/data/propiedades.json").then(function (r) { return r.ok ? r.json() : []; }).then(function (lista) {
    (lista || []).forEach(function (p) { props[p.codigo] = p; });
    pintar();
  }, function () {});

  /* ---------- Actions ---------- */
  function marcar(id, estadoNuevo, nota) {
    escribir(CLAVE_COLA, cola().concat([{ id: id, estado: estadoNuevo, nota: nota || "" }]));
    abierto = null;
    pintar();
    enviarCola().then(function () {
      estado(estadoNuevo === "pendiente" ? "Volvió a pendiente." : "Guardado. ¡Gracias!");
      pintar();
    }, function () {
      estado("Sin señal: se envía solo cuando vuelva.", true);
    });
  }

  $("tr-lista").addEventListener("click", function (e) {
    var card = e.target.closest(".tr__card");
    if (!card) return;
    var id = card.dataset.id;
    var b;
    if ((b = e.target.closest("[data-marcar]"))) { abierto = { id: id, estado: b.dataset.marcar }; pintar(); return; }
    if (e.target.closest("[data-cancelar]")) { abierto = null; pintar(); return; }
    if (e.target.closest("[data-guardar]")) {
      var nota = ($("tr-nota") || {}).value || "";
      if (abierto.estado === "no_se_pudo" && !nota.trim()) { estado("Contá por qué no se pudo hacer.", true); $("tr-nota").focus(); return; }
      marcar(id, abierto.estado, nota.trim());
      return;
    }
    if (e.target.closest("[data-deshacer]")) marcar(id, "pendiente", "");
  });

  window.addEventListener("online", cargar);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") cargar(); });
  setInterval(function () { if (document.visibilityState === "visible") cargar(); }, 5 * 60 * 1000);

  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(function () {});

  pintar();
  cargar();
})();
