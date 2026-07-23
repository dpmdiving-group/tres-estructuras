/* ============================================================
   TRES ESTRUCTURAS — Service worker (spec §5, PWA)

   Estrategia:
   - propiedades.json: red primero (los precios cambian; nunca
     mostrar datos viejos si hay conexion), cache de respaldo.
   - Estaticos y fotos: cache primero (las fotos ya vistas
     quedan guardadas y la proxima visita vuela).
   Subir una version nueva del sitio invalida el cache viejo
   cambiando VERSION.
   ============================================================ */

var VERSION = "te-v2";
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

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // El panel y las herramientas no se cachean
  if (url.pathname.indexOf("/admin") === 0) return;

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

  // Resto: cache primero, y lo nuevo se guarda al vuelo
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
