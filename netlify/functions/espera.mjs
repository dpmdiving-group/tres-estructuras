/* ============================================================
   TRES ESTRUCTURAS — Waiting list form ("Lista de espera")

   The only thing a site visitor can save: on a reserved or coming-soon
   property, they leave their details to be told when it is available.
   Each entry goes into the panel's shared data (collection "espera",
   the same document format as datos.mjs), where the owners see it by
   property; nothing here is ever read back or published.

   POST JSON: {codigo, operacion, nombre, telefono, email, cuando,
     personas, mascotas, garantia, pago, comentario, acepto, sitio, ms}
     -> {ok: true}

   Against spam, without captchas: "sitio" is a field people never see
   (bots fill it), "ms" is how long the form was open (a person takes
   seconds), at most LIMITE_IP entries per visitor per hour (the IP is
   kept only as a salted hash), and the same phone on the same property
   updates its entry instead of adding another. Those caught are told
   "ok" and nothing is saved.

   Written as a v2 function (export default) for the Blobs settings with
   strongly consistent reads, which the conditional writes need.
   ============================================================ */

import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const LIMITE_IP = 5;                    // entries per visitor per hour
const MAX_ENTRADAS = 3000;              // the whole list, as a last guard
const MIN_MS = 1500;                    // a person needs a moment, even with autofill
const INTENTOS = 10;
const DIAS_BORRADOS = 120;

const CUANDO = ["ya", "1mes", "3meses", "mas"];
const GARANTIA = ["propietaria", "caucion", "recibo", "otra"];
const PAGO = ["contado", "credito", "permuta", "otra"];

let fabricaStore = () => getStore({ name: "panel", consistency: "strong" });
export function __setStoreFactory(fn) { fabricaStore = fn; }   // tests only

function responder(codigo, cuerpo) {
  return new Response(JSON.stringify(cuerpo), {
    status: codigo,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
const error = (codigo, mensaje) => responder(codigo, { ok: false, error: mensaje });

const texto = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const unaDe = (v, lista) => (lista.indexOf(v) >= 0 ? v : "");

/* What a visitor sent, cleaned; a string when something is missing or wrong */
export function validar(c) {
  if (!c || typeof c !== "object") return "El pedido llegó mal formado.";
  const codigo = texto(c.codigo, 7).toUpperCase();
  if (!/^[A-Z]{3}-\d{3}$/.test(codigo)) return "No sabemos de qué propiedad es.";
  const nombre = texto(c.nombre, 80);
  if (nombre.length < 2) return "Falta tu nombre.";
  const telefono = texto(c.telefono, 30);
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length < 8 || digitos.length > 15) return "Revisá el número de WhatsApp.";
  const email = texto(c.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Revisá el email.";
  if (c.acepto !== true) return "Falta aceptar que te contactemos.";
  const personas = parseInt(c.personas, 10);
  return {
    codigo: codigo,
    operacion: c.operacion === "venta" ? "venta" : "alquiler",
    nombre: nombre,
    telefono: telefono,
    email: email,
    cuando: unaDe(c.cuando, CUANDO),
    personas: personas >= 1 && personas <= 20 ? personas : "",
    mascotas: c.mascotas === "si" || c.mascotas === "no" ? c.mascotas : "",
    garantia: unaDe(c.garantia, GARANTIA),
    pago: unaDe(c.pago, PAGO),
    comentario: texto(c.comentario, 600)
  };
}

const hash = (s) => createHash("sha256").update("te-espera:" + s).digest("hex").slice(0, 24);
const vacio = () => ({ items: {}, borrados: {}, rev: 0 });
function normalizar(doc) {
  const d = doc && typeof doc === "object" ? doc : vacio();
  return { items: d.items || {}, borrados: d.borrados || {}, rev: d.rev || 0 };
}

// Read, change and write only on top of the version read (two visitors, or
// a visitor and a phone of the panel, saving at once never wipe each other)
async function cambiar(store, clave, fn) {
  for (let intento = 0; intento < INTENTOS; intento++) {
    const actual = await store.getWithMetadata(clave, { type: "json" });
    const doc = fn(actual && actual.data);
    if (doc === null) return false;
    const r = actual && actual.etag
      ? await store.setJSON(clave, doc, { onlyIfMatch: actual.etag })
      : await store.setJSON(clave, doc, { onlyIfNew: true });
    if (r && r.modified) return true;
    await new Promise((res) => setTimeout(res, 15 + Math.random() * 40 * (intento + 1)));
  }
  throw new Error("muchos cambios al mismo tiempo");
}

export default async (req, context) => {
  if (req.method !== "POST") return error(405, "Este endpoint solo acepta POST.");

  let cuerpo;
  try { cuerpo = await req.json(); } catch (e) { return error(400, "El pedido llegó mal formado."); }

  // A bot: looks like it worked, nothing is saved
  if (cuerpo && (texto(cuerpo.sitio, 200) || !(Number(cuerpo.ms) >= MIN_MS))) return responder(200, { ok: true });

  const datos = validar(cuerpo);
  if (typeof datos === "string") return error(400, datos);

  let store;
  try { store = fabricaStore(); } catch (e) { return error(500, "No pudimos guardar tus datos. Escribinos por WhatsApp."); }

  const ahora = Date.now();
  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "";
  try {
    // At most LIMITE_IP entries per visitor per hour
    let pasado = false;
    if (ip) {
      await cambiar(store, "espera-limite/" + hash(ip), (d) => {
        const recientes = (d && Array.isArray(d.t) ? d.t : []).filter((t) => t > ahora - 3600 * 1000);
        if (recientes.length >= LIMITE_IP) { pasado = true; return null; }
        return { t: recientes.concat([ahora]) };
      });
    }
    if (pasado) return error(429, "Ya recibimos varios pedidos desde acá. Probá más tarde o escribinos por WhatsApp.");

    const digitos = datos.telefono.replace(/\D/g, "");
    let lleno = false;
    await cambiar(store, "col/espera", (d) => {
      const doc = normalizar(d);
      // The same phone on the same property: update that entry, don't repeat it
      const previa = Object.values(doc.items).find((x) => x && x.codigo === datos.codigo && String(x.telefono || "").replace(/\D/g, "") === digitos);
      if (!previa && Object.keys(doc.items).length >= MAX_ENTRADAS) { lleno = true; return null; }
      const id = previa ? previa.id : "E" + ahora.toString(36) + Math.random().toString(36).slice(2, 6);
      // Signing up again means waiting again, even if they were already told
      doc.items[id] = Object.assign({}, previa, datos, {
        id: id,
        estado: "esperando",
        fecha: new Date(ahora).toISOString(),
        _u: ahora,
        _por: "Formulario del sitio"
      });
      delete doc.borrados[id];
      const limite = ahora - DIAS_BORRADOS * 24 * 3600 * 1000;
      for (const k of Object.keys(doc.borrados)) if (doc.borrados[k] < limite) delete doc.borrados[k];
      doc.rev += 1;
      return doc;
    });
    if (lleno) return error(507, "La lista de espera está llena. Escribinos por WhatsApp.");
    return responder(200, { ok: true });
  } catch (e) {
    return error(500, "No pudimos guardar tus datos. Escribinos por WhatsApp.");
  }
};
