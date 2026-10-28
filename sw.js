/* ============================================================
   TRES ESTRUCTURAS — Service worker (spec §5, PWA)

   Estrategia:
   - propiedades.json: red primero (los precios cambian; nunca
     mostrar datos viejos si hay conexion), cache de respaldo.
   - Paginas, scripts y estilos: red primero, asi un cambio se ve
     en la primera visita; sin señal (o con una red muy lenta)
     abre la copia guardada.
   - Fotos, logo y librerias: cache primero (las fotos ya vistas
     quedan guardadas y la proxima visita vuela).
   Subir una version nueva del sitio invalida el cache viejo
   cambiando VERSION.
   ============================================================ */

/* OJO: esta linea se actualiza sola en cada deploy de Netlify (el generador
   le pone el commit que se publica) y en cada publicacion desde el panel.
   No hace falta tocarla a mano nunca mas.
   Si cambia, el navegador tira el cache viejo y baja el sitio nuevo. */
var VERSION = "te-20261028231310";
var NUCLEO = [
  "/",
  "/index.html",
  "/propiedad.html",
  "/css/estilos.css",
  "/js/config.js",
  "/js/tarjetas.js",
  "/js/chat.js",
  "/js/app.js",
  "/js/galeria.js",
  "/js/visor360.js",
  "/js/ficha.js",
  "/assets/logo.svg",
  "/manifest.json"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return cache.addAll(NUCLEO);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.filter(function (k) { return k !== VERSION; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Network first with a saved copy as backup. With cache first, a visitor saw
   the previous version once more after every update (the client's PC kept
   the old header), and a tab left open never got it. If the network takes
   longer than ESPERA, the saved copy opens and the new one is saved for the
   next visit. Pages are matched without the query: /?op=venta and
   propiedad.html?c=X are the same file. */
var ESPERA = 3500;
function redPrimero(req, sinQuery) {
  var opciones = sinQuery ? { ignoreSearch: true } : undefined;
  return new Promise(function (resolve, reject) {
    var listo = false;
    function dar(r) { if (r && !listo) { listo = true; resolve(r); } }
    var reloj = setTimeout(function () { caches.match(req, opciones).then(dar); }, ESPERA);
    fetch(req).then(function (r) {
      clearTimeout(reloj);
      if (r.ok) {
        var copia = r.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copia); });
      }
      dar(r);
    }, function (err) {
      clearTimeout(reloj);
      caches.match(req, opciones).then(function (enCache) {
        if (enCache) dar(enCache);
        else if (!listo) { listo = true; reject(err); }
      });
    });
  });
}

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // Nada que tenga que ver con la sesion o con publicar pasa por el cache
  if (url.pathname.indexOf("/.netlify/") === 0) return;

  // El panel: red primero, cache de respaldo. Asi siempre abris la version
  // mas nueva, pero si estas sin señal el panel igual abre.
  // The workers' page too: always the newest, and it opens without signal
  if (url.pathname.indexOf("/admin") === 0 || url.pathname.indexOf("/trabajador") === 0) {
    e.respondWith(
      fetch(e.request).then(function (r) {
        if (r.ok) {
          var copiaAdmin = r.clone();
          caches.open(VERSION).then(function (c) { c.put(e.request, copiaAdmin); });
        }
        return r;
      }).catch(function () {
        return caches.match(e.request);
      })
    );
    return;
  }

  // Pages, the site's scripts and styles: the newest on the first visit
  var esPagina = e.request.mode === "navigate";
  var esCodigo = (/^\/(js|css)\//.test(url.pathname) && url.pathname.indexOf("/js/lib/") !== 0) ||
    url.pathname === "/manifest.json";
  if (esPagina || esCodigo) {
    e.respondWith(redPrimero(e.request, esPagina));
    return;
  }

  // Datos: red primero, cache de respaldo
  if (url.pathname.indexOf("/data/") === 0) {
    e.respondWith(
      fetch(e.request).then(function (r) {
        var copia = r.clone();
        caches.open(VERSION).then(function (c) { c.put(e.request, copia); });
        return r;
      }).catch(function () {
        return caches.match(e.request);
      })
    );
    return;
  }

  // Resto (fotos, logo, librerias): cache primero, y lo nuevo se guarda al vuelo
  e.respondWith(
    caches.match(e.request).then(function (enCache) {
      if (enCache) return enCache;
      return fetch(e.request).then(function (r) {
        if (r.ok && (url.pathname.indexOf("/media/") === 0 ||
                     url.pathname.indexOf("/js/") === 0 ||
                     url.pathname.indexOf("/css/") === 0 ||
                     url.pathname.indexOf("/assets/") === 0)) {
          var copia = r.clone();
          caches.open(VERSION).then(function (c) { c.put(e.request, copia); });
        }
        return r;
      });
    })
  );
});
