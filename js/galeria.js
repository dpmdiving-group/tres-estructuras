/* ============================================================
   TRES ESTRUCTURAS — Galeria de fotos (spec §7.3)
   Swipe en mobile, flechas en desktop, contador, pantalla
   completa con Escape. Sin dependencias.
   ============================================================ */

window.TE_Galeria = function (fotos, alts) {
  "use strict";

  const cont = document.getElementById("galeria");
  const pista = document.getElementById("galeria-pista");
  const btnAnt = document.getElementById("galeria-ant");
  const btnSig = document.getElementById("galeria-sig");
  const contador = document.getElementById("galeria-contador");

  let actual = 0;
  let lightbox = null;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Armar ---------- */
  pista.innerHTML = "";
  fotos.forEach(function (src, i) {
    const cuadro = document.createElement("div");
    cuadro.className = "galeria__cuadro";
    const img = document.createElement("img");
    img.src = TE.rutaFoto(src);
    img.alt = alts[i] || alts[0];
    img.loading = i === 0 ? "eager" : "lazy";
    img.width = 1200; img.height = 900;
    img.addEventListener("click", function () { abrirLightbox(); });
    cuadro.appendChild(img);
    pista.appendChild(cuadro);
  });

  cont.hidden = false;
  const unaSola = fotos.length < 2;
  btnAnt.hidden = btnSig.hidden = unaSola;
  cont.setAttribute("tabindex", "0");
  cont.setAttribute("role", "group");
  cont.setAttribute("aria-roledescription", "galería");

  function pintar() {
    if (reduceMotion) pista.style.transition = "none";
    pista.style.transform = "translateX(-" + actual * 100 + "%)";
    contador.textContent = (actual + 1) + "/" + fotos.length;
    if (lightbox) {
      lightbox.querySelector("img").src = TE.rutaFoto(fotos[actual]);
      lightbox.querySelector(".galeria__contador").textContent = (actual + 1) + "/" + fotos.length;
    }
  }

  function ir(delta) {
    actual = (actual + delta + fotos.length) % fotos.length;
    pintar();
  }

  btnAnt.addEventListener("click", function () { ir(-1); });
  btnSig.addEventListener("click", function () { ir(1); });

  /* ---------- Teclado (spec §12: todo operable con teclado) ---------- */
  cont.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { e.preventDefault(); ir(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); ir(1); }
    if (e.key === "Enter") { abrirLightbox(); }
  });

  /* ---------- Swipe tactil ---------- */
  let x0 = null, y0 = null;
  cont.addEventListener("touchstart", function (e) {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  cont.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) ir(dx < 0 ? 1 : -1);
    x0 = y0 = null;
  }, { passive: true });

  /* ---------- Pantalla completa ---------- */
  function abrirLightbox() {
    if (lightbox) return;
    lightbox = document.createElement("div");
    lightbox.className = "galeria-lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-label", "Foto en pantalla completa. Escape para cerrar.");
    lightbox.innerHTML =
      '<img src="' + TE.rutaFoto(fotos[actual]) + '" alt="' + TE.escaparHTML(alts[actual] || alts[0]) + '">' +
      '<button class="galeria-lightbox__cerrar" aria-label="Cerrar pantalla completa">✕</button>' +
      '<span class="galeria__contador dato-mono">' + (actual + 1) + "/" + fotos.length + "</span>";
    document.body.appendChild(lightbox);
    document.body.style.overflow = "hidden";

    lightbox.querySelector(".galeria-lightbox__cerrar").addEventListener("click", cerrarLightbox);
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) cerrarLightbox();
    });

    // swipe tambien en pantalla completa
    let lx0 = null;
    lightbox.addEventListener("touchstart", function (e) { lx0 = e.touches[0].clientX; }, { passive: true });
    lightbox.addEventListener("touchend", function (e) {
      if (lx0 === null) return;
      const dx = e.changedTouches[0].clientX - lx0;
      if (Math.abs(dx) > 40) ir(dx < 0 ? 1 : -1);
      lx0 = null;
    }, { passive: true });

    lightbox.querySelector(".galeria-lightbox__cerrar").focus();
  }

  function cerrarLightbox() {
    if (!lightbox) return;
    lightbox.remove();
    lightbox = null;
    document.body.style.overflow = "";
    cont.focus();
  }

  // Escape cierra; flechas navegan aun en pantalla completa (spec §7.3)
  document.addEventListener("keydown", function (e) {
    if (!lightbox) return;
    if (e.key === "Escape") cerrarLightbox();
    if (e.key === "ArrowLeft") ir(-1);
    if (e.key === "ArrowRight") ir(1);
  });

  pintar();
};
