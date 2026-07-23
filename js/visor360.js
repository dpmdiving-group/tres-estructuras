/* ============================================================
   TRES ESTRUCTURAS — Visor 360 (spec §8)
   Camino por defecto: embed de YouTube (equirectangular nativo).
   Camino alternativo: reproductor propio con three.js para mp4.
   Carga perezosa: nada se inicializa hasta que la seccion entra
   en viewport, y three.js recien se descarga al tocar play.
   ============================================================ */

window.TE_Visor360 = (function () {
  "use strict";

  var RUTA_THREE = "js/lib/three.min.js";

  /* ---------- Carga diferida de three.js ---------- */
  var threePromesa = null;
  function cargarThree() {
    if (window.THREE) return Promise.resolve();
    if (threePromesa) return threePromesa;
    threePromesa = new Promise(function (resolver, rechazar) {
      var s = document.createElement("script");
      s.src = RUTA_THREE;
      s.onload = function () { resolver(); };
      s.onerror = function () { threePromesa = null; rechazar(new Error("No se pudo cargar three.js")); };
      document.head.appendChild(s);
    });
    return threePromesa;
  }

  /* ---------- YouTube 360: mismo embed diferido que el video comun ---------- */
  function montarYouTube(id, lugar, titulo) {
    var fachada = document.createElement("button");
    fachada.className = "video-fachada";
    fachada.setAttribute("aria-label", "Reproducir recorrido 360: " + titulo);
    fachada.innerHTML =
      '<img src="https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/hqdefault.jpg" alt="" loading="lazy">' +
      '<span class="video-fachada__play"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span>' +
      '<span class="visor360__sello dato-mono">360°</span>';
    fachada.addEventListener("click", function () {
      var marco = document.createElement("div");
      marco.className = "video-marco";
      marco.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) +
        '?autoplay=1&rel=0" title="' + titulo +
        '" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
      fachada.replaceWith(marco);
    });
    lugar.appendChild(fachada);
  }

  /* ---------- Reproductor propio para mp4 equirectangular ---------- */
  function montarMp4(url, lugar, titulo) {
    var caja = document.createElement("div");
    caja.className = "visor360";
    caja.innerHTML =
      '<div class="visor360__inicio">' +
        '<button class="visor360__play" aria-label="Iniciar recorrido 360: ' + titulo + '">' +
          '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>' +
        "</button>" +
        '<span class="visor360__sello dato-mono">360°</span>' +
        '<p class="visor360__pista">Tocá play y arrastrá para mirar alrededor</p>' +
      "</div>" +
      '<p class="visor360__estado" hidden></p>';
    lugar.appendChild(caja);

    var estado = caja.querySelector(".visor360__estado");

    function mostrarError(msg) {
      caja.querySelector(".visor360__inicio").hidden = true;
      estado.hidden = false;
      estado.innerHTML = msg + ' <a href="' + url + '" target="_blank" rel="noopener">Abrir el video directo</a>.';
    }

    caja.querySelector(".visor360__play").addEventListener("click", function () {
      estado.hidden = false;
      estado.textContent = "Cargando recorrido 360…";
      cargarThree().then(function () {
        iniciarEscena();
      }).catch(function () {
        mostrarError("No se pudo cargar el visor.");
      });
    });

    function iniciarEscena() {
      var video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.loop = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.muted = true; // permite autoplay tras el gesto; el audio se activa con el boton
      video.src = url;

      video.addEventListener("error", function () {
        mostrarError("El video 360 no se pudo reproducir.");
      });

      video.addEventListener("canplay", function armar() {
        video.removeEventListener("canplay", armar);
        estado.hidden = true;
        caja.querySelector(".visor360__inicio").remove();

        // Escena three.js segun spec §8
        var escena = new THREE.Scene();
        var camara = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1100);
        var render = new THREE.WebGLRenderer({ antialias: true });
        render.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        var geometria = new THREE.SphereGeometry(500, 60, 40);
        geometria.scale(-1, 1, 1); // se mira desde adentro
        var textura = new THREE.VideoTexture(video);
        textura.minFilter = THREE.LinearFilter;
        var esfera = new THREE.Mesh(geometria, new THREE.MeshBasicMaterial({ map: textura }));
        escena.add(esfera);

        var lienzo = render.domElement;
        lienzo.className = "visor360__lienzo";
        lienzo.setAttribute("tabindex", "0");
        lienzo.setAttribute("aria-label", "Recorrido 360. Arrastrá con el mouse o el dedo, o usá las flechas del teclado.");
        caja.appendChild(lienzo);

        // Controles
        var controles = document.createElement("div");
        controles.className = "visor360__controles";
        controles.innerHTML =
          '<button type="button" data-v360="pausa" aria-label="Pausar">❚❚</button>' +
          '<button type="button" data-v360="sonido" aria-label="Activar sonido">🔇</button>' +
          '<button type="button" data-v360="giro" aria-label="Activar giroscopio" hidden>◎ Giroscopio</button>' +
          '<button type="button" data-v360="pantalla" aria-label="Pantalla completa">⛶</button>';
        caja.appendChild(controles);

        var lon = 0, lat = 0;             // longitud y latitud de la mirada
        var girando = false;
        var gyroActivo = false, gyroBase = null;

        function medir() {
          var ancho = caja.clientWidth;
          var alto = Math.round(ancho * 9 / 16);
          if (document.fullscreenElement === caja) alto = caja.clientHeight;
          render.setSize(ancho, alto);
          camara.aspect = ancho / alto;
          camara.updateProjectionMatrix();
        }
        medir();
        window.addEventListener("resize", medir);

        /* Arrastre con mouse y touch (pointer events) */
        var arrastrando = false, px = 0, py = 0;
        lienzo.style.touchAction = "none";
        lienzo.addEventListener("pointerdown", function (e) {
          arrastrando = true; px = e.clientX; py = e.clientY;
          lienzo.setPointerCapture(e.pointerId);
        });
        lienzo.addEventListener("pointermove", function (e) {
          if (!arrastrando) return;
          lon -= (e.clientX - px) * 0.18;
          lat += (e.clientY - py) * 0.18;
          px = e.clientX; py = e.clientY;
        });
        ["pointerup", "pointercancel"].forEach(function (ev) {
          lienzo.addEventListener(ev, function () { arrastrando = false; });
        });

        /* Teclado */
        lienzo.addEventListener("keydown", function (e) {
          if (e.key === "ArrowLeft") { lon += 6; e.preventDefault(); }
          if (e.key === "ArrowRight") { lon -= 6; e.preventDefault(); }
          if (e.key === "ArrowUp") { lat += 4; e.preventDefault(); }
          if (e.key === "ArrowDown") { lat -= 4; e.preventDefault(); }
        });

        /* Giroscopio opcional: iOS exige permiso por gesto (spec §8) */
        var btnGiro = controles.querySelector('[data-v360="giro"]');
        var esTactil = window.matchMedia("(pointer: coarse)").matches;
        if (esTactil && typeof DeviceOrientationEvent !== "undefined") {
          btnGiro.hidden = false;
        }
        function escucharGiro() {
          window.addEventListener("deviceorientation", function (e) {
            if (!gyroActivo || e.alpha === null) return;
            if (gyroBase === null) gyroBase = e.alpha;
            lon = -(e.alpha - gyroBase) * 1.0;
            lat = Math.max(-85, Math.min(85, (e.beta || 90) - 90));
          });
        }
        btnGiro.addEventListener("click", function () {
          if (gyroActivo) {
            gyroActivo = false; gyroBase = null;
            btnGiro.classList.remove("activo");
            return;
          }
          if (typeof DeviceOrientationEvent.requestPermission === "function") {
            DeviceOrientationEvent.requestPermission().then(function (r) {
              if (r === "granted") { gyroActivo = true; btnGiro.classList.add("activo"); escucharGiro(); }
            }).catch(function () {});
          } else {
            gyroActivo = true; btnGiro.classList.add("activo"); escucharGiro();
          }
        });

        /* Pausa / sonido / pantalla completa */
        controles.querySelector('[data-v360="pausa"]').addEventListener("click", function () {
          if (video.paused) { video.play(); this.textContent = "❚❚"; this.setAttribute("aria-label", "Pausar"); }
          else { video.pause(); this.textContent = "▶"; this.setAttribute("aria-label", "Reproducir"); }
        });
        controles.querySelector('[data-v360="sonido"]').addEventListener("click", function () {
          video.muted = !video.muted;
          this.textContent = video.muted ? "🔇" : "🔊";
          this.setAttribute("aria-label", video.muted ? "Activar sonido" : "Silenciar");
        });
        controles.querySelector('[data-v360="pantalla"]').addEventListener("click", function () {
          if (document.fullscreenElement) { document.exitFullscreen(); }
          else if (caja.requestFullscreen) { caja.requestFullscreen(); }
        });
        document.addEventListener("fullscreenchange", medir);

        /* Bucle de render */
        function cuadro() {
          lat = Math.max(-85, Math.min(85, lat)); // clamp para no darse vuelta
          var fi = THREE.MathUtils.degToRad(90 - lat);
          var theta = THREE.MathUtils.degToRad(lon);
          camara.lookAt(
            500 * Math.sin(fi) * Math.cos(theta),
            500 * Math.cos(fi),
            500 * Math.sin(fi) * Math.sin(theta)
          );
          render.render(escena, camara);
          requestAnimationFrame(cuadro);
        }
        cuadro();
        video.play();
      });

      video.load();
    }
  }

  /* ---------- Punto de entrada con carga perezosa por viewport ---------- */
  function montar(video360, lugar, titulo) {
    function armar() {
      if (video360.tipo === "youtube") montarYouTube(video360.id, lugar, titulo);
      else if (video360.tipo === "mp4") montarMp4(video360.url, lugar, titulo);
    }
    // Nada se inicializa hasta que la seccion entra en viewport (spec §8)
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entradas) {
        if (entradas[0].isIntersecting) {
          io.disconnect();
          armar();
        }
      }, { rootMargin: "200px" });
      io.observe(lugar);
    } else {
      armar();
    }
  }

  return { montar: montar };
})();
