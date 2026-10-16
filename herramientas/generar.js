#!/usr/bin/env node
/* ============================================================
   TRES ESTRUCTURAS — Generador de SEO (spec §11)

   Corre solo en cada deploy de Netlify (ver netlify.toml).
   No hace falta ejecutarlo a mano: publicar sigue siendo
   "editar propiedades.json y subir".

   Genera, leyendo data/propiedades.json:
   1. fichas/{codigo}/index.html -> the complete property page
      (propiedad.html) with that property's Open Graph tags,
      JSON-LD and code baked in. _redirects serves it at
      /p/{codigo} as a rewrite (200), so a QR scan opens the page
      in one request: no 301, no preview page, no JS hop. It is
      also what WhatsApp and Google read. Generated for closed
      properties too: a printed QR never leads to a 404.
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
  // "<" escaped so a description can never close the <script> tag
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
  }).replace(/</g, "\\u003c");
}

/* ---------- Complete property pages ---------- */

const PLANTILLA = fs.readFileSync(path.join(RAIZ, "propiedad.html"), "utf8");
const RE_TITULO = /<title>[\s\S]*?<\/title>/;
const RE_DESC = /<meta name="description"[^>]*>/;
const SCRIPT_FICHA = '<script src="js/ficha.js"></script>';

// If propiedad.html stops matching what this expects, fail the build:
// Netlify then keeps serving the previous deploy instead of broken pages.
if (!RE_TITULO.test(PLANTILLA) || !RE_DESC.test(PLANTILLA) || PLANTILLA.indexOf(SCRIPT_FICHA) < 0 || PLANTILLA.indexOf('<base href="/">') < 0) {
  throw new Error("propiedad.html no tiene <title>, <meta name=\"description\">, <base href=\"/\"> o " + SCRIPT_FICHA + ": no se generan fichas.");
}

function fichaCompleta(p) {
  const titulo = tituloSEO(p);
  const desc = descripcion155(p);
  const url = DOMINIO + "/p/" + p.codigo;
  const meta = [
    `<title>${escapar(titulo)}</title>`,
    `<meta name="description" content="${escapar(desc)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapar(NOMBRE)}">`,
    `<meta property="og:title" content="${escapar(titulo)}">`,
    `<meta property="og:description" content="${escapar(desc)}">`,
    `<meta property="og:image" content="${DOMINIO}${escapar(p.portada || "")}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<script type="application/ld+json">${jsonLD(p)}</script>`
  ].join("\n  ");
  // Function replacements: a "$&" or "$1" typed in a title must stay literal
  return PLANTILLA
    .replace(RE_TITULO, () => "")
    .replace(RE_DESC, () => meta)
    // ficha.js reads the code from here instead of from ?c=
    .replace(SCRIPT_FICHA, () => `<script>window.__FICHA_CODIGO__ = ${JSON.stringify(p.codigo)};</script>\n  ${SCRIPT_FICHA}`);
}

/* ---------- Generate ---------- */
// Old preview pages under p/ would shadow the /p/ rewrite (Netlify serves a
// matching file first, with a 301 to its lowercase address): never ship them.
fs.rmSync(path.join(RAIZ, "p"), { recursive: true, force: true });
fs.rmSync(path.join(RAIZ, "fichas"), { recursive: true, force: true });
let generados = 0;
let anteriores = 0;
function escribirFicha(codigo, html) {
  // Netlify stores paths in lowercase; write them that way from the start
  const dir = path.join(RAIZ, "fichas", codigo.toLowerCase());
  if (fs.existsSync(dir)) return false;   // an old code never shadows a current one
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  return true;
}
props.forEach(function (p) {
  if (escribirFicha(p.codigo, fichaCompleta(p))) generados++;
});
// Old codes of a changed code: QRs printed before the change open the
// same page (its canonical URL is the new code)
props.forEach(function (p) {
  (Array.isArray(p.codigosAnteriores) ? p.codigosAnteriores : []).forEach(function (c) {
    if (/^[A-Z]{3}-\d{3}$/.test(c) && escribirFicha(c, fichaCompleta(p))) anteriores++;
  });
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

console.log(generados + " fichas generadas (servidas en /p/{codigo})" +
  (anteriores ? ", " + anteriores + " por codigos anteriores" : "") +
  " + sitemap.xml (" + urls.length + " URLs)");
