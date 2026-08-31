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

   Regla de oro: si esto falla, el panel sigue funcionando como
   siempre. Nunca deja al usuario encerrado afuera.
   ============================================================ */

window.TE_NUBE = (function () {
  "use strict";

  var IDENTITY = "/.netlify/identity";
  var FUNCION = "/.netlify/functions/publicar";
  var CLAVE_SESION = "te_sesion";

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
     5. Publicar
     ========================================================== */

  /* Que fotos entran en la publicacion: las que estan guardadas en este
     dispositivo Y que el JSON menciona de verdad. No se depende de la memoria
     de la pestana: si se cerro y se volvio a abrir, las fotos siguen aca. */
  function publicar() {
    if (!window.TE_ADMIN) {
      return Promise.reject(new Error("El panel todavia no termino de cargar."));
    }
    var props = TE_ADMIN.obtenerProps();

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
        mensaje: mensaje
      }).then(function (resp) {
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
      texto.textContent = "Conectado";
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

    window.addEventListener("online", function () { enLinea = true; pintarBarra(); subirPendientes(); });
    window.addEventListener("offline", function () { enLinea = false; pintarBarra(); });

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
    else pintarBarra();

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
    mostrarLogin: mostrarLogin
  };
})();
