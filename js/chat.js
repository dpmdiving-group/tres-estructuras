/* ============================================================
   TRES ESTRUCTURAS — Chat flotante + atribucion por fuente
   (spec §9 y §9.1)

   - La fuente llega por ?f= (cartel, web, instagram, facebook,
     marketplace), se guarda para toda la visita y define la
     frase de cierre del mensaje. Ese cierre ES el sistema de
     atribucion: sin cookies ni analytics.
   - El boton flotante es el UNICO elemento con el verde --wa.
   - No se abre solo. Nunca.
   ============================================================ */

window.TE_Chat = (function () {
  "use strict";

  // Cada fuente cierra el mensaje con su frase (spec §9)
  var FRASES = {
    cartel: "Escaneé el QR del cartel.",
    web: "La vi en la web.",
    instagram: "La vi en Instagram.",
    facebook: "La vi en Facebook.",
    marketplace: "La vi en Marketplace."
  };

  function fuenteActual() {
    try {
      var f = new URLSearchParams(location.search).get("f");
      if (f && FRASES[f]) {
        sessionStorage.setItem("te_fuente", f);
        return f;
      }
      return sessionStorage.getItem("te_fuente") || "web";
    } catch (e) {
      return "web";
    }
  }

  function mensaje(p) {
    var f = fuenteActual();
    if (p) {
      return "Hola " + CONFIG.nombre + ", me interesa la propiedad " + p.codigo +
        " (" + p.titulo + "). " + FRASES[f];
    }
    return "Hola " + CONFIG.nombre + ", quiero hacer una consulta por una propiedad.";
  }

  function link(p) {
    return "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(mensaje(p));
  }

  /* Boton flotante: circulo en desktop, barra al pie en mobile.
     El texto cambia segun contexto (spec §9.1). */
  function montar(p) {
    var previo = document.getElementById("chat-flotante");
    if (previo) previo.remove();

    var a = document.createElement("a");
    a.id = "chat-flotante";
    a.className = "chat-flotante";
    a.href = link(p);
    a.target = "_blank";
    a.rel = "noopener";
    var texto = p ? "Consultar por " + p.codigo : "Consultar";
    a.setAttribute("aria-label", texto + " por WhatsApp");
    a.innerHTML =
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.6-1.3.1-.2 0-.4 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.9.9-1.2 2.1-.6 3.5.7 1.5 2 3.2 3.9 4.4 2.4 1.5 3.4 1.6 4.4 1.4.6-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3z"/></svg>' +
      '<span class="chat-flotante__texto">' + texto + "</span>";
    document.body.appendChild(a);
    return a;
  }

  // La fuente se captura apenas carga cualquier pagina
  fuenteActual();

  return { fuenteActual: fuenteActual, mensaje: mensaje, link: link, montar: montar, FRASES: FRASES };
})();
