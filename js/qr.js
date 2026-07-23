/* ============================================================
   TRES ESTRUCTURAS — QR variable por propiedad (spec §9)

   Reglas que no se rompen:
   - Un QR por unidad. Codifica SIEMPRE la ruta corta:
       {dominio}/p/{codigo}?f=cartel
   - El numero de WhatsApp NUNCA va dentro de un QR.
   - Correccion de error nivel H (aguanta lluvia, sol, un dedo).
   - Se dibuja en el navegador: cero archivos que mantener.
     Si cambia el dominio en config, todos los QR cambian solos.
   ============================================================ */

window.TE_QR = (function () {
  "use strict";

  // URL corta a proposito: menos caracteres = QR menos denso =
  // se escanea desde mas lejos (spec §9)
  function urlCorta(codigo, fuente) {
    return CONFIG.dominio + "/p/" + codigo + "?f=" + (fuente || "cartel");
  }

  function crear(codigo, fuente) {
    var qr = qrcode(0, "H"); // tipo automatico, correccion H
    qr.addData(urlCorta(codigo, fuente));
    qr.make();
    return qr;
  }

  /* SVG nitido para el cartel impreso. margen = zona de silencio
     (4 modulos blancos alrededor, obligatorios para escanear bien). */
  function svg(codigo, fuente) {
    var qr = crear(codigo, fuente);
    return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  }

  /* PNG para descargar y usar en flyers o posteos (spec §9, salida 2) */
  function descargarPNG(codigo, fuente, lado) {
    lado = lado || 1024;
    var qr = crear(codigo, fuente);
    var modulos = qr.getModuleCount();
    var margen = 4; // modulos de zona de silencio
    var celda = Math.floor(lado / (modulos + margen * 2));
    var total = celda * (modulos + margen * 2);

    var c = document.createElement("canvas");
    c.width = c.height = total;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, total, total);
    ctx.fillStyle = "#182430";
    for (var f = 0; f < modulos; f++) {
      for (var col = 0; col < modulos; col++) {
        if (qr.isDark(f, col)) {
          ctx.fillRect((col + margen) * celda, (f + margen) * celda, celda, celda);
        }
      }
    }
    var a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "qr-" + codigo + ".png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return { urlCorta: urlCorta, svg: svg, descargarPNG: descargarPNG };
})();
