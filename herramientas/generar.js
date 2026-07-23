#!/usr/bin/env node
/* ============================================================
   TRES ESTRUCTURAS — Generador de SEO (spec §11)

   Corre solo en cada deploy de Netlify (ver netlify.toml).
   No hace falta ejecutarlo a mano: publicar sigue siendo
   "editar propiedades.json y subir".

   Genera, leyendo data/propiedades.json:
   1. p/{codigo}/index.html  -> pagina liviana con los meta de
      Open Graph por propiedad. Es lo que ve WhatsApp cuando
      alguien pega el link, y lo que ve Google. Al abrirla,
      pasa al instante a la ficha real conservando ?f=.
      Se genera TAMBIEN para las cerradas: un QR impreso
      nunca puede llevar a un 404.
   2. sitemap.xml
   ============================================================ */

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");

// Dominio y nombre desde js/config.js (unico lugar de verdad)
const configTexto = fs.readFileSync(path.join(RAIZ, "js/config.js"), "utf8");
const DOMINIO = (configTexto.match(/dominio:\s*"([^"]+)"/) || [])[1] || "https://tresestructuras.com";
const NOMBRE = (configTexto.match(/nombre:\s*"([^"]+)"/) || [])[1] || "Tres Estructuras";

const props = JSON.parse(fs.readFileSync(path.join(RAIZ, "data/propiedades.json"), "utf8"));

function escapar(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function precioTexto(p) {
  const n = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(p.precio);
  return (p.moneda === "USD" ? "USD " : "$ ") + n;
}

function tituloSEO(p) {
  // "Casa 3 ambientes en Quilmes — Venta USD 145.000 | Tres Estructuras" (spec §11)
  const op = p.operacion === "venta" ? "Venta" : "Alquiler";
  return p.titulo + " en " + p.zona + " — " + op + " " + precioTexto(p) + " | " + NOMBRE;
}

function descripcion155(p) {
  const d = (p.descripcion || "").replace(/\s+/g, " ").trim();
  return d.length > 155 ? d.slice(0, 152).trim() + "…" : d;
}

function jsonLD(p) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "name": p.titulo,
    "url": DOMINIO + "/p/" + p.codigo,
    "image": DOMINIO + p.portada,
    "description": descripcion155(p),
    "datePosted": p.publicada,
    "offers": {
      "@type": "Offer",
      "price": p.precio,
      "priceCurrency": p.moneda,
      "availability": p.estado === "disponible" ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      "businessFunction": p.operacion === "venta" ? "http://purl.org/goodrelations/v1#Sell" : "http://purl.org/goodrelations/v1#LeaseOut"
    },
    "address": {
      "@type": "PostalAddress",
      "addressLocality": p.zona,
      "addressRegion": "Buenos Aires",
      "addressCountry": "AR"
    }
  });
}

function stub(p) {
  const titulo = tituloSEO(p);
  const desc = descripcion155(p);
  const urlFicha = "/propiedad.html?c=" + p.codigo;
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapar(titulo)}</title>
<meta name="description" content="${escapar(desc)}">
<link rel="canonical" href="${DOMINIO}/p/${p.codigo}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapar(NOMBRE)}">
<meta property="og:title" content="${escapar(titulo)}">
<meta property="og:description" content="${escapar(desc)}">
<meta property="og:image" content="${DOMINIO}${p.portada}">
<meta property="og:url" content="${DOMINIO}/p/${p.codigo}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLD(p)}</script>
<script>
// Pasa a la ficha conservando la fuente (?f=cartel etc.)
var q = location.search ? "&" + location.search.slice(1) : "";
location.replace("${urlFicha}" + q);
</script>
</head>
<body>
<noscript><a href="${urlFicha}">Ver ${escapar(p.titulo)}</a></noscript>
</body>
</html>
`;
}

/* ---------- Generar stubs ---------- */
let generados = 0;
props.forEach(function (p) {
  const dir = path.join(RAIZ, "p", p.codigo);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), stub(p));
  generados++;
});

/* ---------- Sitemap (solo lo listable; las cerradas viven pero no se promocionan) ---------- */
const hoy = new Date().toISOString().slice(0, 10);
const urls = [{ loc: DOMINIO + "/", prio: "1.0" }].concat(
  props.filter(function (p) { return p.estado !== "cerrada"; })
    .map(function (p) { return { loc: DOMINIO + "/p/" + p.codigo, prio: "0.8", lastmod: p.publicada }; })
);
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(function (u) {
    return "  <url><loc>" + u.loc + "</loc><lastmod>" + (u.lastmod || hoy) + "</lastmod><priority>" + u.prio + "</priority></url>";
  }).join("\n") +
  "\n</urlset>\n";
fs.writeFileSync(path.join(RAIZ, "sitemap.xml"), sitemap);

console.log(generados + " paginas /p/ generadas + sitemap.xml (" + urls.length + " URLs)");
