/* ============================================================
   TRES ESTRUCTURAS — Panel data shared between phones

   Leads, visits, jobs, workers, job categories and accounting are
   still saved on the phone first (so the panel works without signal),
   and when the user is logged in they are kept in sync with the shared
   copy on the server (netlify/functions/datos.mjs).

   Each panel tab only swaps localStorage for:
     var col = TE_DATOS.coleccion("leads", {local: "te_leads"});
     col.leer()          -> array saved on this phone (null if never saved)
     col.guardar(array)  -> save on this phone, then sync shortly after
     col.alCambiar(fn)   -> fn(array) when another phone's changes arrive

   How a sync works: read every collection from the server and merge it
   into this phone's copy, keeping what this phone changed and hasn't
   sent yet; then send those changes. "te_sync_<name>" remembers the
   last server version of each item, which is how this phone tells its
   own changes (and deletions) apart from everybody else's.

   Nothing here throws away data from this phone: if a sync fails, the
   changes stay and the next sync sends them.
   ============================================================ */

(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TE_DATOS = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  var json = function (x) { return JSON.stringify(x); };
  var LOTE = 200;   // the server takes up to 500 changes per call

  /* ---------- Pure merge logic (also used by the Node tests) ---------- */

  /* What this phone changed since the last server version it knows (base:
     {id: JSON of that item on the server}) */
  function pendientes(local, base, clave) {
    var cambios = [];
    var vistos = {};
    (local || []).forEach(function (item) {
      var id = String(item[clave]);
      vistos[id] = true;
      if (base[id] === undefined || base[id] !== json(item)) cambios.push({ id: id, item: item });
    });
    Object.keys(base).forEach(function (id) {
      if (!vistos[id]) cambios.push({ id: id, borrar: true });
    });
    return cambios;
  }

  /* Merge the server copy (doc.items) into this phone's list.
     enviados: {id: JSON sent} right after this phone's own save; those
     items come back from the server with their new _u. */
  function combinar(local, baseVieja, doc, clave, enviados, ordenar) {
    var items = (doc && doc.items) || {};
    var base = {};
    Object.keys(items).forEach(function (id) { base[id] = json(items[id]); });

    var lista = [];
    var vistos = {};
    (local || []).forEach(function (item) {
      var id = String(item[clave]);
      vistos[id] = true;
      var actual = json(item);
      var confirmado = !!enviados && enviados[id] === actual;
      var sinTocar = baseVieja[id] !== undefined && baseVieja[id] === actual;
      if (items[id] !== undefined) {
        // Changed here and not sent yet: keep this phone's version
        lista.push(confirmado || sinTocar ? items[id] : item);
      } else if (!(confirmado || sinTocar)) {
        // New here, or changed here after another phone deleted it: keep it
        lista.push(item);
      }
      // else: deleted on another phone and untouched here -> drop it
    });
    Object.keys(items).forEach(function (id) {
      if (vistos[id]) return;
      // Was here before and isn't now: deleted on this phone, not sent yet
      if (baseVieja[id] !== undefined) return;
      lista.push(items[id]);   // new from another phone
    });

    if (ordenar) lista.sort(ordenar);
    return { lista: lista, base: base, cambio: json(lista) !== json(local || []) };
  }

  /* ---------- Browser side ---------- */

  var colecciones = {};
  var programado = null;
  var corriendo = false;
  var otraVez = false;
  var ultimaSync = 0;
  var ultimoAviso = 0;

  function leerJSON(k) {
    try { return JSON.parse(root.localStorage.getItem(k) || "null"); } catch (e) { return null; }
  }
  function escribirJSON(k, v) {
    try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
  function leerLocal(c) {
    var v = leerJSON(c.local);
    return Array.isArray(v) ? v : null;
  }
  function leerBase(c) { return leerJSON("te_sync_" + c.nombre) || {}; }

  function coleccion(nombre, opciones) {
    var c = colecciones[nombre] = {
      nombre: nombre,
      local: opciones.local,
      clave: opciones.clave || "id",
      ordenar: opciones.ordenar || null,
      oyentes: []
    };
    return {
      leer: function () { return leerLocal(c); },
      guardar: function (lista) { escribirJSON(c.local, lista); programar(1500); },
      alCambiar: function (fn) { c.oyentes.push(fn); }
    };
  }

  function nube() { return root.TE_NUBE; }

  function puedeSincronizar() {
    var n = nube();
    return !!(n && n.datos && n.haySesion && n.haySesion() && root.navigator && root.navigator.onLine !== false);
  }

  function programar(ms) {
    clearTimeout(programado);
    programado = setTimeout(sincronizar, ms || 0);
  }

  function aplicar(c, doc, enviados) {
    var local = leerLocal(c) || [];
    var r = combinar(local, leerBase(c), doc, c.clave, enviados, c.ordenar);
    escribirJSON("te_sync_" + c.nombre, r.base);
    if (!r.cambio) return;
    escribirJSON(c.local, r.lista);
    c.oyentes.forEach(function (fn) {
      try { fn(r.lista.slice()); } catch (e) { console.error(e); }
    });
  }

  function enviar(c) {
    var local = leerLocal(c);
    if (!local) return Promise.resolve();   // never saved on this phone: nothing to send
    var cambios = pendientes(local, leerBase(c), c.clave);
    var lotes = [];
    for (var i = 0; i < cambios.length; i += LOTE) lotes.push(cambios.slice(i, i + LOTE));
    return lotes.reduce(function (cadena, lote) {
      return cadena.then(function () {
        var enviados = {};
        lote.forEach(function (x) { if (!x.borrar) enviados[x.id] = json(x.item); });
        return nube().datos({ accion: "guardar", coleccion: c.nombre, cambios: lote })
          .then(function (r) { aplicar(c, r.datos, enviados); });
      });
    }, Promise.resolve());
  }

  function avisarFallo(e) {
    if (Date.now() - ultimoAviso < 10 * 60 * 1000) return;
    ultimoAviso = Date.now();
    // Say why (e.g. "Tu usuario no tiene permiso…"): it is what tells the owner what to fix
    var motivo = e && e.message && !/^sin sesion$/.test(e.message) ? " (" + e.message + ")" : "";
    if (root.TE_ADMIN && root.TE_ADMIN.notify) {
      root.TE_ADMIN.notify("No se pudieron sincronizar las consultas, la agenda o la contabilidad" + motivo + ". Quedan guardadas en este teléfono y se reintenta solo.", true);
    }
  }

  function sincronizar() {
    if (!puedeSincronizar()) return Promise.resolve(false);
    if (corriendo) { otraVez = true; return Promise.resolve(false); }
    corriendo = true;
    var nombres = Object.keys(colecciones);

    return nube().datos({ accion: "leer" }).then(function (resp) {
      nombres.forEach(function (n) { aplicar(colecciones[n], resp.colecciones && resp.colecciones[n], null); });
      return nombres.reduce(function (cadena, n) {
        return cadena.then(function () { return enviar(colecciones[n]); });
      }, Promise.resolve());
    }).then(function () {
      ultimaSync = Date.now();
      return true;
    }, function (e) {
      // Logged out or session expired: te-nube takes care of that
      if ((e && e.status === 401) || !nube().haySesion()) return false;
      console.warn("No se pudieron sincronizar los datos del panel:", e && e.message);
      avisarFallo(e);
      programar(30000);
      return false;
    }).then(function (ok) {
      corriendo = false;
      if (otraVez) { otraVez = false; programar(500); }
      return ok;
    });
  }

  if (typeof document !== "undefined" && typeof window !== "undefined") {
    document.addEventListener("te:sesion", function () { programar(0); });
    window.addEventListener("online", function () { programar(500); });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && Date.now() - ultimaSync > 30000) programar(0);
    });
  }

  return {
    coleccion: coleccion,
    sincronizar: sincronizar,
    pendientes: pendientes,
    combinar: combinar
  };
});
