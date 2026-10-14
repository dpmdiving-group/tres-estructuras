/* ============================================================
   TRES ESTRUCTURAS — Modulo de nube del panel

   Tres cosas, y ninguna mas:

   1. SESION. Entrar con mail y contrasena (Netlify Identity).
      La llave de GitHub no vive aca: vive en el servidor.

   2. FOTOS A SALVO. Apenas sacas una foto se guarda en el
      telefono (IndexedDB) y se sube al servidor. Si se cierra
      la pestana, si se corta la señal, si se muere la bateria:
      la foto ya esta.

   3. PUBLICAR. Un boton que manda todo junto en un solo
      commit. Si algo falla, lo dice en castellano.

   4. NO OVERWRITES. The panel remembers the last version it got
      from the server (te_base). On open, when coming back online
      and right before publishing, it reads the latest version and
      merges it with the local copy (te-merge.js). Conflicts are
      shown to the user; nothing is ever replaced silently.

   Regla de oro: si esto falla, el panel sigue funcionando como
   siempre. Nunca deja al usuario encerrado afuera.
   ============================================================ */

window.TE_NUBE = (function () {
  "use strict";

  var IDENTITY = "/.netlify/identity";
  var FUNCION = "/.netlify/functions/publicar";
  var CLAVE_SESION = "te_sesion";
  var CLAVE_BASE = "te_base";   // {sha, props}: last version received from the server

  var sesion = null;        // {access_token, refresh_token, expira, email}
  var urls = {};            // uid -> objectURL para previsualizar
  var pendientes = {};      // uid -> {uid, ruta, sha, subiendo}
  var db = null;
  var enLinea = navigator.onLine;

  /* ==========================================================
     1. Base de datos local (IndexedDB)
     ========================================================== */

  function abrirDB() {
    return new Promise(function (resolver) {
      if (db) return resolver(db);
      if (!window.indexedDB) return resolver(null);
      var pedido = indexedDB.open("te-fotos", 1);
      pedido.onupgradeneeded = function () {
        var d = pedido.result;
        if (!d.objectStoreNames.contains("fotos")) {
          d.createObjectStore("fotos", { keyPath: "uid" });
        }
      };
      pedido.onsuccess = function () { db = pedido.result; resolver(db); };
      pedido.onerror = function () { resolver(null); };
    });
  }

  function guardarEnDB(registro) {
    return abrirDB().then(function (d) {
      if (!d) return null;
      return new Promise(function (resolver) {
        var tx = d.transaction("fotos", "readwrite");
        tx.objectStore("fotos").put(registro);
        tx.oncomplete = function () { resolver(registro); };
        tx.onerror = function () { resolver(null); };
      });
    });
  }

  function leerTodoDB() {
    return abrirDB().then(function (d) {
      if (!d) return [];
      return new Promise(function (resolver) {
        var tx = d.transaction("fotos", "readonly");
        var pedido = tx.objectStore("fotos").getAll();
        pedido.onsuccess = function () { resolver(pedido.result || []); };
        pedido.onerror = function () { resolver([]); };
      });
    });
  }

  function borrarDeDB(uids) {
    return abrirDB().then(function (d) {
      if (!d) return;
      return new Promise(function (resolver) {
        var tx = d.transaction("fotos", "readwrite");
        var almacen = tx.objectStore("fotos");
        uids.forEach(function (uid) { almacen.delete(uid); });
        tx.oncomplete = resolver;
        tx.onerror = resolver;
      });
    });
  }

  /* ==========================================================
     2. Sesion
     ========================================================== */

  function cargarSesion() {
    try {
      var guardada = JSON.parse(localStorage.getItem(CLAVE_SESION) || "null");
      if (guardada && guardada.access_token) sesion = guardada;
    } catch (e) { sesion = null; }
  }

  function guardarSesion(datos, email) {
    sesion = {
      access_token: datos.access_token,
      refresh_token: datos.refresh_token,
      expira: Date.now() + (datos.expires_in || 3600) * 1000,
      email: email || (sesion && sesion.email) || ""
    };
    try { localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion)); } catch (e) {}
  }

  function cerrarSesion() {
    sesion = null;
    try { localStorage.removeItem(CLAVE_SESION); } catch (e) {}
    pintarBarra();
    mostrarLogin();
  }

  function identity(ruta, opciones) {
    opciones = opciones || {};
    return fetch(IDENTITY + ruta, {
      method: opciones.metodo || "GET",
      headers: opciones.headers || { "Content-Type": "application/json" },
      body: opciones.cuerpo
    }).then(function (r) {
      return r.text().then(function (t) {
        var datos = null;
        try { datos = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) {
          var msg = (datos && (datos.error_description || datos.msg || datos.error)) || ("HTTP " + r.status);
          var e2 = new Error(msg);
          e2.status = r.status;
          throw e2;
        }
        return datos;
      });
    });
  }

  function entrar(email, password) {
    var cuerpo = "grant_type=password&username=" + encodeURIComponent(email) +
                 "&password=" + encodeURIComponent(password);
    return identity("/token", {
      metodo: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cuerpo: cuerpo
    }).then(function (datos) {
      guardarSesion(datos, email);
      return sesion;
    });
  }

  function refrescar() {
    if (!sesion || !sesion.refresh_token) return Promise.reject(new Error("sin sesion"));
    var cuerpo = "grant_type=refresh_token&refresh_token=" + encodeURIComponent(sesion.refresh_token);
    return identity("/token", {
      metodo: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      cuerpo: cuerpo
    }).then(function (datos) {
      guardarSesion(datos);
      return sesion;
    });
  }

  function token() {
    if (!sesion) return Promise.reject(new Error("sin sesion"));
    if (Date.now() < sesion.expira - 60000) return Promise.resolve(sesion.access_token);
    return refrescar().then(function () { return sesion.access_token; });
  }

  function haySesion() { return !!sesion; }

  /* Invitacion y recuperacion llegan por mail con el token en el # de la URL */
  function tokenDelHash(nombre) {
    var h = location.hash || "";
    var m = new RegExp("[#&]" + nombre + "=([^&]+)").exec(h);
    return m ? m[1] : null;
  }

  /* Trae el mail del usuario de la sesion actual y lo guarda */
  function traerUsuario() {
    return token().then(function (t) {
      return identity("/user", {
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t }
      });
    }).then(function (u) {
      if (u && u.email && sesion) {
        sesion.email = u.email;
        try { localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion)); } catch (e) {}
      }
      return u;
    }).catch(function () { return null; });
  }

  /* Aceptar una invitacion.
     OJO: el token de invitacion NO es una sesion. No sirve mandarlo como
     Bearer a /user: eso da 401. El camino correcto es /verify con
     type "signup", que ademas devuelve la sesion ya iniciada. */
  function aceptarInvitacion(tokenInvitacion, password) {
    return identity("/verify", {
      metodo: "POST",
      cuerpo: JSON.stringify({
        type: "signup",
        token: tokenInvitacion,
        password: password
      })
    }).then(function (datos) {
      guardarSesion(datos);
      return traerUsuario().then(function () { return datos; });
    });
  }

  /* Recuperar la contrasena: primero se canjea el token por una sesion,
     y recien con esa sesion se puede cambiar la contrasena. */
  function cambiarPasswordConToken(tokenRecuperacion, password) {
    return identity("/verify", {
      metodo: "POST",
      cuerpo: JSON.stringify({ type: "recovery", token: tokenRecuperacion })
    }).then(function (datos) {
      guardarSesion(datos);
      return identity("/user", {
        metodo: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + datos.access_token
        },
        cuerpo: JSON.stringify({ password: password })
      });
    }).then(function () {
      return traerUsuario();
    });
  }

  function pedirRecuperacion(email) {
    return identity("/recover", {
      metodo: "POST",
      cuerpo: JSON.stringify({ email: email })
    });
  }

  /* ==========================================================
     3. Llamadas al servidor
     ========================================================== */

  function api(datos) {
    return token().then(function (t) {
      return fetch(FUNCION, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + t
        },
        body: JSON.stringify(datos)
      });
    }).then(function (r) {
      return r.text().then(function (texto) {
        var cuerpo = null;
        try { cuerpo = texto ? JSON.parse(texto) : null; } catch (e) {}
        if (!r.ok) {
          var e3 = new Error((cuerpo && cuerpo.error) || ("El servidor respondio " + r.status));
          e3.status = r.status;
          e3.problemas = cuerpo && cuerpo.problemas;
          e3.cuerpo = cuerpo;
          throw e3;
        }
        return cuerpo;
      });
    });
  }

  /* ==========================================================
     4. Fotos: guardar, subir, previsualizar
     ========================================================== */

  function nuevoUid() {
    return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function base64De(blob) {
    return new Promise(function (resolver, rechazar) {
      var lector = new FileReader();
      lector.onload = function () {
        var r = String(lector.result);
        resolver(r.slice(r.indexOf(",") + 1));
      };
      lector.onerror = rechazar;
      lector.readAsDataURL(blob);
    });
  }

  /* Guarda la foto en el telefono al instante y arranca la subida */
  function guardarFoto(uid, blob) {
    urls[uid] = URL.createObjectURL(blob);
    pendientes[uid] = pendientes[uid] || { uid: uid, ruta: null, sha: null };
    return guardarEnDB({ uid: uid, blob: blob, sha: null, ruta: null, creada: Date.now() })
      .then(function () {
        pintarBarra();
        subirPendientes();
        return uid;
      });
  }

  /* Cuando se guarda la propiedad, cada foto nueva ya sabe donde va a vivir */
  function asignarRuta(uid, ruta) {
    if (!pendientes[uid]) pendientes[uid] = { uid: uid, ruta: null, sha: null };
    pendientes[uid].ruta = ruta;
    return abrirDB().then(function (d) {
      if (!d) return;
      return new Promise(function (resolver) {
        var tx = d.transaction("fotos", "readwrite");
        var almacen = tx.objectStore("fotos");
        var pedido = almacen.get(uid);
        pedido.onsuccess = function () {
          var reg = pedido.result;
          if (reg) { reg.ruta = ruta; almacen.put(reg); }
          resolver();
        };
        pedido.onerror = resolver;
        tx.oncomplete = function () { pintarBarra(); };
      });
    });
  }

  var subiendo = false;
  function subirPendientes() {
    if (subiendo || !haySesion() || !enLinea) return Promise.resolve();
    subiendo = true;

    return leerTodoDB().then(function (registros) {
      var faltan = registros.filter(function (r) { return !r.sha && r.blob; });
      if (!faltan.length) return;

      // De a una, para no saturar la conexion del telefono
      return faltan.reduce(function (cadena, reg) {
        return cadena.then(function () {
          return base64De(reg.blob)
            .then(function (b64) { return api({ accion: "blob", base64: b64 }); })
            .then(function (resp) {
              reg.sha = resp.sha;
              if (pendientes[reg.uid]) pendientes[reg.uid].sha = resp.sha;
              else pendientes[reg.uid] = { uid: reg.uid, ruta: reg.ruta, sha: resp.sha };
              return guardarEnDB(reg);
            })
            .then(function () { pintarBarra(); })
            .catch(function (e) {
              // Si es un problema de sesion o de red, se reintenta despues.
              console.warn("No se pudo subir una foto todavia:", e.message);
            });
        });
      }, Promise.resolve());
    }).then(function () {
      subiendo = false;
      pintarBarra();
    }).catch(function () {
      subiendo = false;
    });
  }

  function url(uid) { return urls[uid] || null; }

  function uidDeNombre(nombre) {
    return String(nombre || "").replace(/\.[A-Za-z0-9]+$/, "");
  }

  /* ==========================================================
     5. Staying in sync with the server
     ========================================================== */

  function loadBase() {
    try {
      var saved = JSON.parse(localStorage.getItem(CLAVE_BASE) || "null");
      return saved && saved.sha && Array.isArray(saved.props) ? saved : null;
    } catch (e) { return null; }
  }

  function saveBase(sha, props) {
    try { localStorage.setItem(CLAVE_BASE, JSON.stringify({ sha: sha, props: props })); } catch (e) {}
  }

  // After a file import nobody knows what the local copy was based on:
  // the next sync treats every difference with the site as a conflict.
  function forgetBase() {
    try { localStorage.removeItem(CLAVE_BASE); } catch (e) {}
    pintarBarra();
  }

  function unpublishedCount() {
    var base = loadBase();
    if (!base || !window.TE_MERGE || !window.TE_ADMIN) return 0;
    return TE_MERGE.changedCodes(base.props, TE_ADMIN.obtenerProps() || []).length;
  }

  function tell(msg, isError) {
    if (window.TE_ADMIN && TE_ADMIN.notify) TE_ADMIN.notify(msg, isError);
  }

  /* A new property whose code was already used on the site gets the next
     free code. Its photos waiting on this device must follow it. */
  function moveRoutes(fromCode, toCode) {
    var from = "/media/" + fromCode + "/";
    var to = "/media/" + toCode + "/";
    Object.keys(pendientes).forEach(function (uid) {
      var p = pendientes[uid];
      if (p.ruta && p.ruta.indexOf(from) === 0) p.ruta = to + p.ruta.slice(from.length);
    });
    return leerTodoDB().then(function (registros) {
      var moved = registros.filter(function (r) { return r.ruta && r.ruta.indexOf(from) === 0; });
      moved.forEach(function (r) { r.ruta = to + r.ruta.slice(from.length); });
      return Promise.all(moved.map(guardarEnDB));
    }).then(function () {
      if (TE_ADMIN.renameCode) TE_ADMIN.renameCode(fromCode, toCode);
    });
  }

  function applyRenames(renamed) {
    return renamed.reduce(function (chain, r) {
      return chain.then(function () { return moveRoutes(r.from, r.to); });
    }, Promise.resolve());
  }

  /* Resolves to {status}: "up_to_date" | "updated" | "merged" | "pending"
     (the user postponed the conflicts) | "skipped" (no session, offline,
     or a property form is open). */
  function applyRemote(sha, remoteProps) {
    var M = window.TE_MERGE;
    var base = loadBase();
    var local = TE_ADMIN.obtenerProps() || [];

    if (base && base.sha === sha) return Promise.resolve({ status: "up_to_date" });

    // Nothing of mine to keep: just take the site's version. Without a base,
    // a list just copied from the published site and never edited counts as nothing.
    var nothingToKeep = base
      ? M.deepEqual(local, base.props)
      : !local.length || (TE_ADMIN.hasLocalEdits && !TE_ADMIN.hasLocalEdits());
    if (nothingToKeep || M.deepEqual(local, remoteProps)) {
      var changed = !M.deepEqual(local, remoteProps);
      if (changed) TE_ADMIN.setProps(remoteProps);
      saveBase(sha, remoteProps);
      return Promise.resolve({ status: "updated", changed: changed });
    }

    var result = M.merge(base ? base.props : null, local, remoteProps);
    var decide = result.conflicts.length ? askConflicts(result) : Promise.resolve({});
    return decide.then(function (choices) {
      if (!choices) return { status: "pending" };
      return applyRenames(result.renamed).then(function () {
        TE_ADMIN.setProps(M.resolve(result, choices));
        // The merged list now sits on top of the site's latest version
        saveBase(sha, remoteProps);
        return { status: "merged", renamed: result.renamed };
      });
    });
  }

  var syncInFlight = null;
  var lastSync = 0;

  function syncWithServer() {
    if (syncInFlight) return syncInFlight;
    if (!haySesion() || !enLinea || !window.TE_ADMIN || !window.TE_MERGE) {
      return Promise.resolve({ status: "skipped" });
    }
    // Never swap the list under an open form: saving it would write into the wrong slot
    if (TE_ADMIN.isEditing && TE_ADMIN.isEditing()) return Promise.resolve({ status: "skipped" });

    syncInFlight = api({ accion: "leer" })
      .then(function (resp) { return applyRemote(resp.sha, resp.propiedades); })
      .then(function (r) {
        syncInFlight = null;
        lastSync = Date.now();
        pintarBarra();
        return r;
      }, function (e) {
        syncInFlight = null;
        if (e.status === 401) cerrarSesion();
        throw e;
      });
    return syncInFlight;
  }

  function report(r, manual) {
    if (!r) return;
    if (r.status === "updated" && r.changed) tell("Se trajeron los últimos cambios publicados.");
    else if (r.status === "merged") {
      var msg = "Se combinaron tus cambios con lo publicado desde otro dispositivo.";
      (r.renamed || []).forEach(function (x) {
        msg += " " + x.from + " pasó a ser " + x.to + " porque ese código ya se usó.";
      });
      tell(msg);
    } else if (r.status === "pending") tell("Quedaron cambios para revisar antes de publicar.", true);
    else if (manual && (r.status === "up_to_date" || r.status === "updated")) tell("Ya tenés lo último del sitio.");
  }

  // Background sync: on open, when coming back online, when the app comes back to the front
  function syncQuietly() {
    return syncWithServer().then(function (r) { report(r, false); }).catch(function (e) {
      console.warn("No se pudo traer lo último del sitio:", e.message);
    });
  }

  // The "Traer lo último del sitio" button
  function syncNow() {
    if (!haySesion()) { mostrarLogin(); return Promise.resolve(); }
    if (!enLinea) { tell("Sin señal: probá de nuevo cuando vuelvas a tener conexión.", true); return Promise.resolve(); }
    if (TE_ADMIN.isEditing && TE_ADMIN.isEditing()) {
      tell("Guardá o cancelá la propiedad que estás editando y probá de nuevo.", true);
      return Promise.resolve();
    }
    return syncWithServer().then(function (r) { report(r, true); }).catch(function (e) {
      tell("No se pudo traer lo último del sitio: " + e.message, true);
    });
  }

  /* ---------- Conflict screen ---------- */

  var FIELD_LABELS = {
    titulo: "Título", zona: "Zona", barrio: "Barrio", operacion: "Operación", estado: "Estado",
    precio: "Precio", moneda: "Moneda", expensas: "Expensas", monedaExpensas: "Moneda de expensas",
    ambientes: "Ambientes", dormitorios: "Dormitorios", banos: "Baños", cocheras: "Cocheras",
    m2Cubiertos: "m² cubiertos", m2Totales: "m² totales", antiguedad: "Antigüedad",
    reciclada: "Reciclada", aptoCredito: "Apto crédito", aptoMascotas: "Acepta mascotas",
    descripcion: "Descripción", portada: "Foto de portada", fotos: "Fotos", video: "Video",
    video360: "Video 360", amenities: "Amenities", destacada: "Destacada", publicada: "Fecha de publicación"
  };

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function formatValue(field, v) {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Sí" : "No";
    if (typeof v === "number") return new Intl.NumberFormat("es-AR").format(v);
    if (field === "fotos" && Array.isArray(v)) return v.length + (v.length === 1 ? " foto" : " fotos");
    if (field === "portada") return String(v).split("/").pop();
    if (Array.isArray(v)) return v.join(", ") || "—";
    if (typeof v === "object") return (v.tipo || "") + " " + (v.id || v.url || "");
    var s = String(v);
    return s.length > 140 ? s.slice(0, 137) + "…" : s;
  }

  var CONFLICT_TEXT = {
    fields: {
      intro: "Se cambió lo mismo acá y desde otro dispositivo.",
      local: "Dejar lo de este dispositivo",
      remote: "Dejar lo del sitio"
    },
    deleted_here: {
      intro: "La borraste en este dispositivo, pero desde otro la modificaron.",
      local: "Borrarla",
      remote: "Mantenerla como está en el sitio"
    },
    deleted_on_site: {
      intro: "La borraron desde otro dispositivo, pero acá la modificaste.",
      local: "Mantenerla con mis cambios",
      remote: "Dejarla borrada"
    }
  };

  /* Resolves to {codigo: "local"|"remote"}, or null if the user postpones */
  function askConflicts(result) {
    return new Promise(function (resolve) {
      var html =
        "<h2>Hay cambios para revisar</h2>" +
        "<p>Mientras trabajabas, desde otro dispositivo se publicaron cambios en las mismas propiedades. " +
        "Elegí qué queda en cada una. Todo lo demás ya se combinó solo.</p>";

      result.conflicts.forEach(function (c, i) {
        var p = c.remote || c.local;
        var t = CONFLICT_TEXT[c.type];
        html += '<div class="te-conflicto">' +
          "<h3>" + escapeHtml(c.codigo) + " — " + escapeHtml(p.titulo || "") + "</h3>" +
          '<p class="te-conflicto__que">' + t.intro + "</p>";
        (c.fields || []).forEach(function (f) {
          html += '<div class="te-conflicto__campo"><strong>' + escapeHtml(FIELD_LABELS[f.field] || f.field) + "</strong>" +
            "<span>Este dispositivo: " + escapeHtml(formatValue(f.field, f.local)) + "</span>" +
            "<span>Sitio: " + escapeHtml(formatValue(f.field, f.remote)) + "</span></div>";
        });
        html +=
          '<label class="te-opcion"><input type="radio" name="te-c' + i + '" value="remote" checked> ' + t.remote + "</label>" +
          '<label class="te-opcion"><input type="radio" name="te-c' + i + '" value="local"> ' + t.local + "</label>" +
          "</div>";
      });

      html +=
        '<button type="button" class="te-btn" data-te="aplicar">Aplicar</button>' +
        '<button type="button" class="te-menor" data-te="despues">Decidir después</button>';

      var c = capa(html);
      c.querySelector(".te-tarjeta").classList.add("te-tarjeta--ancha");

      c.querySelector("[data-te='aplicar']").addEventListener("click", function () {
        var choices = {};
        result.conflicts.forEach(function (conf, i) {
          var picked = c.querySelector("input[name='te-c" + i + "']:checked");
          choices[conf.codigo] = picked ? picked.value : "remote";
        });
        c.remove();
        resolve(choices);
      });
      c.querySelector("[data-te='despues']").addEventListener("click", function () {
        c.remove();
        resolve(null);
      });
    });
  }

  /* ==========================================================
     5b. Publicar
     ========================================================== */

  function pendingConflictsError() {
    return new Error("Quedaron cambios para revisar. Tocá Publicar de nuevo para elegir qué queda en cada propiedad.");
  }

  /* Always publish on top of the latest version: read and merge first,
     then commit. If someone else publishes in those few seconds the
     server answers 409: read, merge and try once more. */
  function publicar() {
    if (!window.TE_ADMIN) {
      return Promise.reject(new Error("El panel todavia no termino de cargar."));
    }
    if (!window.TE_MERGE) {
      return Promise.reject(new Error("El panel no terminó de cargar bien. Recargá la página y volvé a intentar."));
    }
    if (TE_ADMIN.isEditing && TE_ADMIN.isEditing()) {
      return Promise.reject(new Error("Guardá o cancelá la propiedad que estás editando antes de publicar."));
    }

    function syncThenCommit() {
      return syncWithServer().then(function (r) {
        report(r, false);
        if (r.status === "pending") throw pendingConflictsError();
        return commitOnce();
      });
    }

    return syncThenCommit().catch(function (e) {
      if (e.status !== 409) throw e;
      return syncThenCommit();
    });
  }

  /* Que fotos entran en la publicacion: las que estan guardadas en este
     dispositivo Y que el JSON menciona de verdad. No se depende de la memoria
     de la pestana: si se cerro y se volvio a abrir, las fotos siguen aca. */
  function commitOnce() {
    var base = loadBase();
    if (!base) {
      return Promise.reject(new Error("Todavía no se pudo traer lo último del sitio. Revisá la conexión y volvé a intentar."));
    }
    // Snapshot of exactly what is sent: it becomes the next base
    var props = JSON.parse(JSON.stringify(TE_ADMIN.obtenerProps() || []));

    var enUso = {};
    (props || []).forEach(function (p) {
      (p.fotos || []).forEach(function (r) { enUso[r] = true; });
      if (p.portada) enUso[p.portada] = true;
    });

    return leerTodoDB().then(function (registros) {
      var candidatas = registros.filter(function (r) { return r.ruta && enUso[r.ruta]; });

      var sinSubir = candidatas.filter(function (r) { return !r.sha; });
      if (sinSubir.length) {
        var e = new Error("Hay " + sinSubir.length + " foto(s) que todavía no terminaron de subir. Esperá unos segundos y volvé a intentar.");
        e.esperar = true;
        throw e;
      }

      var fotos = candidatas.map(function (r) { return { ruta: r.ruta, sha: r.sha }; });
      var mensaje = fotos.length
        ? "Panel: " + props.length + " propiedades, " + fotos.length + " foto(s) nuevas"
        : "Panel: actualizacion de datos (" + props.length + " propiedades)";

      return api({
        accion: "commit",
        propiedades: props,
        fotos: fotos,
        mensaje: mensaje,
        baseSha: base.sha
      }).then(function (resp) {
        if (resp.sha) saveBase(resp.sha, props);
        var uids = candidatas.map(function (r) { return r.uid; });
        uids.forEach(function (u) { delete pendientes[u]; });
        return borrarDeDB(uids).then(function () {
          if (TE_ADMIN.publicado) TE_ADMIN.publicado();
          pintarBarra();
          return resp;
        });
      });
    });
  }

  /* ==========================================================
     6. Interfaz
     ========================================================== */

  var barra = null;

  function estilos() {
    var css = document.createElement("style");
    css.textContent = [
      ".te-barra{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:10px;",
      "  padding:8px 14px;background:#182430;color:#ECEFF0;font-size:.82rem;flex-wrap:wrap}",
      ".te-barra__estado{display:flex;align-items:center;gap:6px;min-width:0}",
      ".te-punto{width:8px;height:8px;border-radius:50%;background:#7A4646;flex:none}",
      ".te-punto--ok{background:#4a8f5b}",
      ".te-punto--trabajando{background:#A68F60;animation:te-late 1s infinite}",
      "@keyframes te-late{50%{opacity:.35}}",
      ".te-barra__mail{opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40vw}",
      ".te-barra__sep{flex:1}",
      ".te-btn{font:inherit;border:0;border-radius:8px;padding:9px 14px;cursor:pointer;background:#A68F60;color:#182430;font-weight:700}",
      ".te-btn:disabled{opacity:.5;cursor:default}",
      ".te-btn--fantasma{background:transparent;color:#ECEFF0;border:1px solid rgba(236,239,240,.35);font-weight:500}",
      // align-items:center recortaria la tarjeta en pantallas bajas y dejaria
      // botones imposibles de tocar. Con margin:auto se centra si entra, y si
      // no entra se puede scrollear entera.
      ".te-capa{position:fixed;inset:0;z-index:200;background:#182430;display:flex;",
      "  align-items:flex-start;justify-content:center;padding:20px 20px 44px;overflow:auto;",
      "  -webkit-overflow-scrolling:touch}",
      ".te-tarjeta{background:#ECEFF0;color:#182430;border-radius:14px;padding:26px 24px;",
      "  max-width:380px;width:100%;margin:auto;box-sizing:border-box}",
      ".te-tarjeta h2{margin:0 0 4px;font-size:1.3rem}",
      ".te-tarjeta p{margin:0 0 18px;font-size:.88rem;color:#57616A;line-height:1.45}",
      ".te-campo{display:block;margin-bottom:12px;font-size:.8rem;font-weight:600}",
      ".te-campo input{width:100%;box-sizing:border-box;margin-top:5px;padding:13px 12px;font:inherit;",
      "  border:1.5px solid #c9d0d4;border-radius:9px;background:#fff}",
      ".te-campo input:focus{outline:2px solid #A68F60;outline-offset:1px;border-color:#A68F60}",
      ".te-tarjeta .te-btn{width:100%;padding:14px;font-size:1rem;margin-top:4px}",
      ".te-error{background:#f6e4e4;color:#7A4646;border-radius:8px;padding:10px 12px;font-size:.83rem;margin-bottom:12px}",
      ".te-ok{background:#e4f0e6;color:#2f5c3a;border-radius:8px;padding:10px 12px;font-size:.83rem;margin-bottom:12px}",
      ".te-menor{display:block;width:100%;background:none;border:0;color:#57616A;font:inherit;font-size:.8rem;",
      "  text-decoration:underline;cursor:pointer;margin-top:14px;padding:6px}",
      ".te-lista-problemas{margin:8px 0 0;padding-left:18px;font-size:.8rem;line-height:1.5}",
      // Conflict screen: wider card, stacked values that fit a phone, 44px touch targets
      ".te-tarjeta--ancha{max-width:560px}",
      ".te-conflicto{border-top:1px solid #c9d0d4;padding:14px 0 6px}",
      ".te-conflicto h3{margin:0 0 4px;font-size:1rem}",
      ".te-tarjeta .te-conflicto__que{margin:0 0 10px}",
      ".te-conflicto__campo{display:flex;flex-direction:column;gap:2px;background:#fff;border-radius:8px;",
      "  padding:8px 10px;margin-bottom:8px;font-size:.84rem;overflow-wrap:anywhere}",
      ".te-opcion{display:flex;align-items:center;gap:10px;min-height:44px;font-size:.9rem;cursor:pointer}",
      ".te-opcion input{width:20px;height:20px;accent-color:#182430;flex:none}",
      "@media(max-width:520px){.te-barra{font-size:.78rem;padding:7px 10px}.te-barra__mail{display:none}}"
    ].join("");
    document.head.appendChild(css);
  }

  function contarPendientes() {
    var conRuta = 0, sinSha = 0;
    Object.keys(pendientes).forEach(function (uid) {
      var p = pendientes[uid];
      if (!p.sha) sinSha++;
      if (p.ruta) conRuta++;
    });
    return { sinSubir: sinSha, listas: conRuta };
  }

  function pintarBarra() {
    if (!barra) return;
    var punto = barra.querySelector(".te-punto");
    var texto = barra.querySelector(".te-barra__texto");
    var mail = barra.querySelector(".te-barra__mail");
    var btnPublicar = barra.querySelector("[data-te='publicar']");
    var btnSalir = barra.querySelector("[data-te='salir']");
    var btnEntrar = barra.querySelector("[data-te='entrar']");

    var cuenta = contarPendientes();

    if (!haySesion()) {
      punto.className = "te-punto";
      texto.textContent = "Sin conectar";
      mail.textContent = "";
      btnPublicar.hidden = true;
      btnSalir.hidden = true;
      btnEntrar.hidden = false;
      return;
    }

    btnEntrar.hidden = true;
    btnSalir.hidden = false;
    btnPublicar.hidden = false;
    mail.textContent = sesion.email || "";

    if (!enLinea) {
      punto.className = "te-punto";
      texto.textContent = "Sin señal";
    } else if (cuenta.sinSubir) {
      punto.className = "te-punto te-punto--trabajando";
      texto.textContent = "Subiendo " + cuenta.sinSubir + " foto" + (cuenta.sinSubir > 1 ? "s" : "");
    } else {
      punto.className = "te-punto te-punto--ok";
      var sinPublicar = unpublishedCount();
      texto.textContent = "Conectado" + (sinPublicar
        ? " · " + sinPublicar + (sinPublicar > 1 ? " cambios" : " cambio") + " sin publicar"
        : "");
    }

    btnPublicar.disabled = !enLinea || cuenta.sinSubir > 0;
  }

  function montarBarra() {
    barra = document.createElement("div");
    barra.className = "te-barra";
    barra.innerHTML =
      '<span class="te-barra__estado"><span class="te-punto"></span>' +
      '<span class="te-barra__texto">Sin conectar</span></span>' +
      '<span class="te-barra__mail"></span>' +
      '<span class="te-barra__sep"></span>' +
      '<button type="button" class="te-btn te-btn--fantasma" data-te="entrar">Entrar</button>' +
      '<button type="button" class="te-btn" data-te="publicar" hidden>Publicar en el sitio</button>' +
      '<button type="button" class="te-btn te-btn--fantasma" data-te="salir" hidden>Salir</button>';
    document.body.insertBefore(barra, document.body.firstChild);

    barra.querySelector("[data-te='entrar']").addEventListener("click", function () { mostrarLogin(); });
    barra.querySelector("[data-te='salir']").addEventListener("click", function () {
      if (confirm("¿Cerrar la sesión en este dispositivo?")) cerrarSesion();
    });
    barra.querySelector("[data-te='publicar']").addEventListener("click", alPublicar);
  }

  function capa(html) {
    var c = document.createElement("div");
    c.className = "te-capa";
    c.innerHTML = '<div class="te-tarjeta">' + html + "</div>";
    document.body.appendChild(c);
    return c;
  }

  function mostrarLogin(mensajeOk) {
    if (document.querySelector(".te-capa")) return;
    var c = capa(
      "<h2>Panel Tres Estructuras</h2>" +
      "<p>Entrá con tu mail y contraseña para poder publicar.</p>" +
      (mensajeOk ? '<div class="te-ok">' + mensajeOk + "</div>" : "") +
      '<div class="te-error" hidden></div>' +
      '<label class="te-campo">Mail<input type="email" autocomplete="username" inputmode="email" data-te="mail"></label>' +
      '<label class="te-campo">Contraseña<input type="password" autocomplete="current-password" data-te="pass"></label>' +
      '<button type="button" class="te-btn" data-te="ok">Entrar</button>' +
      '<button type="button" class="te-menor" data-te="olvide">Me olvidé la contraseña</button>' +
      '<button type="button" class="te-menor" data-te="sin">Seguir sin conectarme (no voy a publicar)</button>'
    );

    var err = c.querySelector(".te-error");
    var mail = c.querySelector("[data-te='mail']");
    var pass = c.querySelector("[data-te='pass']");
    var btn = c.querySelector("[data-te='ok']");

    function fallar(m) { err.hidden = false; err.textContent = m; }

    function intentar() {
      err.hidden = true;
      if (!mail.value.trim() || !pass.value) return fallar("Completá el mail y la contraseña.");
      btn.disabled = true;
      btn.textContent = "Entrando…";
      entrar(mail.value.trim(), pass.value).then(function () {
        c.remove();
        pintarBarra();
        subirPendientes();
        syncQuietly();
      }).catch(function (e) {
        btn.disabled = false;
        btn.textContent = "Entrar";
        if (e.status === 400 || e.status === 401) fallar("Mail o contraseña incorrectos.");
        else if (e.status === 404) fallar("El login todavía no está activado en Netlify. Revisá el instructivo.");
        else fallar("No se pudo entrar: " + e.message);
      });
    }

    btn.addEventListener("click", intentar);
    pass.addEventListener("keydown", function (e) { if (e.key === "Enter") intentar(); });

    c.querySelector("[data-te='sin']").addEventListener("click", function () { c.remove(); });

    c.querySelector("[data-te='olvide']").addEventListener("click", function () {
      err.hidden = true;
      var email = mail.value.trim();
      if (!email) return fallar("Escribí tu mail arriba y volvé a tocar acá.");
      pedirRecuperacion(email).then(function () {
        c.remove();
        capa(
          "<h2>Revisá tu mail</h2>" +
          "<p>Te mandamos un link a <strong>" + email + "</strong> para poner una contraseña nueva. " +
          "Puede tardar un par de minutos; si no llega, mirá en correo no deseado.</p>" +
          '<button type="button" class="te-btn" onclick="this.closest(\'.te-capa\').remove()">Listo</button>'
        );
      }).catch(function (e) {
        fallar("No se pudo mandar el mail: " + e.message);
      });
    });

    setTimeout(function () { mail.focus(); }, 50);
  }

  /* Pantalla para elegir contrasena: sirve para invitacion y para recuperacion */
  function mostrarElegirPassword(tokenTemporal, esInvitacion) {
    var c = capa(
      "<h2>" + (esInvitacion ? "Bienvenido al panel" : "Nueva contraseña") + "</h2>" +
      "<p>" + (esInvitacion
        ? "Elegí la contraseña con la que vas a entrar de ahora en más."
        : "Escribí tu contraseña nueva.") + "</p>" +
      '<div class="te-error" hidden></div>' +
      '<label class="te-campo">Contraseña nueva<input type="password" autocomplete="new-password" data-te="p1"></label>' +
      '<label class="te-campo">Repetila<input type="password" autocomplete="new-password" data-te="p2"></label>' +
      '<button type="button" class="te-btn" data-te="ok">Guardar contraseña</button>'
    );

    var err = c.querySelector(".te-error");
    var p1 = c.querySelector("[data-te='p1']");
    var p2 = c.querySelector("[data-te='p2']");
    var btn = c.querySelector("[data-te='ok']");

    btn.addEventListener("click", function () {
      err.hidden = true;
      if (p1.value.length < 8) { err.hidden = false; err.textContent = "Usá al menos 8 caracteres."; return; }
      if (p1.value !== p2.value) { err.hidden = false; err.textContent = "Las dos contraseñas no coinciden."; return; }
      btn.disabled = true;
      btn.textContent = "Guardando…";

      var accion = esInvitacion
        ? aceptarInvitacion(tokenTemporal, p1.value)
        : cambiarPasswordConToken(tokenTemporal, p1.value);

      accion.then(function () {
        // Al aceptar la invitacion la sesion ya queda abierta: se entra directo.
        history.replaceState(null, "", location.pathname + location.search);
        c.remove();
        pintarBarra();
        subirPendientes();
        syncQuietly();
        capa(
          "<h2>Listo, ya estás adentro</h2>" +
          "<p>Tu contraseña quedó guardada. De ahora en más entrás con tu mail y esa contraseña, " +
          "desde cualquier teléfono o computadora.</p>" +
          '<button type="button" class="te-btn" onclick="this.closest(\'.te-capa\').remove()">Empezar</button>'
        );
      }).catch(function (e) {
        btn.disabled = false;
        btn.textContent = "Guardar contraseña";
        err.hidden = false;
        if (e.status === 401 || e.status === 404 || e.status === 410) {
          err.textContent = "Ese link no es válido o ya se usó. Pedí que te manden la invitación de nuevo.";
        } else if (e.status === 422) {
          err.textContent = "La contraseña no cumple los requisitos. Probá con una más larga.";
        } else {
          err.textContent = "No se pudo guardar: " + e.message;
        }
      });
    });

    setTimeout(function () { p1.focus(); }, 50);
  }

  function alPublicar() {
    var btn = barra.querySelector("[data-te='publicar']");
    btn.disabled = true;
    var textoOriginal = btn.textContent;
    btn.textContent = "Publicando…";

    publicar().then(function (resp) {
      btn.textContent = textoOriginal;
      pintarBarra();
      capa(
        "<h2>Publicado</h2>" +
        "<p>Se subieron los cambios" + (resp.fotos ? " y " + resp.fotos + " foto(s)" : "") +
        ". El sitio se actualiza solo en un par de minutos: no hace falta que hagas nada más.</p>" +
        '<button type="button" class="te-btn" onclick="this.closest(\'.te-capa\').remove()">Listo</button>'
      );
    }).catch(function (e) {
      btn.textContent = textoOriginal;
      pintarBarra();

      if (e.status === 401) { cerrarSesion(); return; }

      var detalle = "";
      if (e.problemas && e.problemas.length) {
        detalle = '<ul class="te-lista-problemas">' +
          e.problemas.map(function (p) { return "<li>" + String(p).replace(/[<>]/g, "") + "</li>"; }).join("") +
          "</ul>";
      }
      capa(
        "<h2>No se pudo publicar</h2>" +
        '<div class="te-error">' + String(e.message).replace(/[<>]/g, "") + detalle + "</div>" +
        "<p>Tus datos no se perdieron: siguen acá, tal como los dejaste.</p>" +
        '<button type="button" class="te-btn" onclick="this.closest(\'.te-capa\').remove()">Entendido</button>'
      );
    });
  }

  /* ==========================================================
     7. Arranque
     ========================================================== */

  function arrancar() {
    estilos();
    montarBarra();
    cargarSesion();

    window.addEventListener("online", function () { enLinea = true; pintarBarra(); subirPendientes(); syncQuietly(); });
    window.addEventListener("offline", function () { enLinea = false; pintarBarra(); });

    // Phones keep the panel in the background for hours: check again when it comes back
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && Date.now() - lastSync > 60000) syncQuietly();
    });

    // Recuperar las fotos que quedaron a medio camino de una sesion anterior
    leerTodoDB().then(function (registros) {
      registros.forEach(function (r) {
        pendientes[r.uid] = { uid: r.uid, ruta: r.ruta, sha: r.sha };
        if (r.blob && !urls[r.uid]) urls[r.uid] = URL.createObjectURL(r.blob);
      });
      pintarBarra();
      if (window.TE_ADMIN && TE_ADMIN.refrescarFotos) TE_ADMIN.refrescarFotos();
      subirPendientes();
    });

    // Links de invitacion y de recuperacion
    var invitacion = tokenDelHash("invite_token");
    var recuperacion = tokenDelHash("recovery_token");
    if (invitacion) { mostrarElegirPassword(invitacion, true); return; }
    if (recuperacion) { mostrarElegirPassword(recuperacion, false); return; }

    if (!haySesion()) mostrarLogin();
    else { pintarBarra(); syncQuietly(); }

    // Reintento periodico de las fotos que quedaron sin subir
    setInterval(function () { subirPendientes(); }, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arrancar);
  } else {
    arrancar();
  }

  /* ---------- Lo que el panel puede usar ---------- */
  return {
    nuevoUid: nuevoUid,
    guardarFoto: guardarFoto,
    asignarRuta: asignarRuta,
    url: url,
    uidDeNombre: uidDeNombre,
    haySesion: haySesion,
    publicar: publicar,
    mostrarLogin: mostrarLogin,
    syncNow: syncNow,
    forgetBase: forgetBase,
    refreshBar: pintarBarra
  };
})();
