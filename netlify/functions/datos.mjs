/* ============================================================
   TRES ESTRUCTURAS — Shared panel data

   Leads, visits, jobs, workers, job categories, accounting, rental
   contracts and rent payments used
   to live only in the browser where they were typed. This function
   keeps one shared copy in Netlify Blobs so every phone sees the same
   data. Each phone still keeps its own copy and works offline
   (admin/te-datos.js); this is where those copies meet.

   Only users invited to the site's Netlify Identity and listed in
   ADMINS (same rule as publishing) can read or write.

   POST JSON:
     {accion: "leer"}
        -> {ok, colecciones: {leads: {items, borrados}, ...}}
     {accion: "guardar", coleccion, cambios: [{id, item} | {id, borrar: true}]}
        -> {ok, coleccion, datos: {items, borrados}}

   Storage: one JSON document per collection, {items: {id: item},
   borrados: {id: time}, rev}. Writes are conditional on the version
   just read (ETag), so two phones saving at the same moment never wipe
   each other out: the loser re-reads and merges. Every saved item gets
   _u, the server time of its last change, and _por, the email of the
   user who made it (the panel shows both). When two phones change the
   SAME item, the last save wins. Deletions are kept for a while as
   "borrados" so the other phones also drop the item.

   Written as a v2 function (export default): its runtime provides the
   Blobs settings for strongly consistent reads, which the conditional
   writes need.
   ============================================================ */

import { getStore } from "@netlify/blobs";

const COLECCIONES = {
  leads: "id",
  visitas: "id",
  trabajos: "id",
  trabajadores: "id",
  categorias: "clave",
  movs: "id",
  contratos: "id",   // rental contracts (Cobros tab)
  pagos: "id",       // rent payments
  amenities: "clave", // which amenity options the panel shows, and the owners' own
  referencias: "codigo", // each property's internal reference (never published)
  propietarios: "id",  // owners of third-party rentals and their monthly statement (never published)
  zonas: "clave",      // zones added or renamed by the owners, keyed by their code letters
  espera: "id",        // the site's waiting list (espera.mjs adds; the panel reads, marks and deletes)
  sueldos: "id"        // workers' pay settings and payments (never sent to the worker's page)
};
const MAX_CAMBIOS = 500;
const MAX_BYTES = 4 * 1024 * 1024;
const DIAS_BORRADOS = 120;
const INTENTOS = 10;

/* ---------- Responses ---------- */

function responder(codigo, cuerpo) {
  return new Response(JSON.stringify(cuerpo), {
    status: codigo,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function error(codigo, mensaje) {
  return responder(codigo, { ok: false, error: mensaje });
}

/* ---------- Who is asking ---------- */

// Identity validates its own tokens: ask it who this token belongs to.
async function usuarioDe(req) {
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/.test(auth)) return null;
  try {
    const r = await fetch(new URL("/.netlify/identity/user", req.url), { headers: { Authorization: auth } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.email ? u : null;
  } catch (e) {
    return null;
  }
}

function permitido(email) {
  const lista = String(process.env.ADMINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !lista.length || lista.indexOf(String(email).toLowerCase()) >= 0;
}

/* ---------- Store ---------- */

let fabricaStore = () => getStore({ name: "panel", consistency: "strong" });
export function __setStoreFactory(fn) { fabricaStore = fn; }   // tests only

const clave = (coleccion) => "col/" + coleccion;
const vacio = () => ({ items: {}, borrados: {}, rev: 0 });

function normalizar(doc) {
  const d = doc && typeof doc === "object" ? doc : vacio();
  return { items: d.items || {}, borrados: d.borrados || {}, rev: d.rev || 0 };
}

/* ---------- Validation ---------- */

function validarCambios(coleccion, cambios) {
  const campo = COLECCIONES[coleccion];
  if (!campo) return "Ese tipo de datos no existe.";
  if (!Array.isArray(cambios) || !cambios.length) return "No llegaron cambios para guardar.";
  if (cambios.length > MAX_CAMBIOS) return "Demasiados cambios juntos (máximo " + MAX_CAMBIOS + ").";
  for (const c of cambios) {
    if (!c || typeof c.id !== "string" || !c.id || c.id.length > 80) return "Un cambio llegó sin identificador válido.";
    if (c.borrar === true) continue;
    if (!c.item || typeof c.item !== "object" || Array.isArray(c.item)) return "Un cambio llegó sin datos.";
    if (String(c.item[campo]) !== c.id) return "Un cambio no coincide con su identificador.";
  }
  return null;
}

/* ---------- Merge ---------- */

function aplicar(doc, cambios, ahora, por) {
  for (const c of cambios) {
    if (c.borrar === true) {
      delete doc.items[c.id];
      doc.borrados[c.id] = ahora;
    } else {
      doc.items[c.id] = Object.assign({}, c.item, { _u: ahora, _por: por });
      delete doc.borrados[c.id];
    }
  }
  const limite = ahora - DIAS_BORRADOS * 24 * 60 * 60 * 1000;
  for (const id of Object.keys(doc.borrados)) {
    if (doc.borrados[id] < limite) delete doc.borrados[id];
  }
  doc.rev += 1;
  return doc;
}

/* ============================================================
   Handler
   ============================================================ */

export default async (req) => {
  if (req.method !== "POST") return error(405, "Este endpoint solo acepta POST.");

  const usuario = await usuarioDe(req);
  if (!usuario) return error(401, "Tenés que iniciar sesión.");
  if (!permitido(usuario.email)) return error(403, "Tu usuario no tiene permiso para ver los datos del panel.");

  let cuerpo;
  try { cuerpo = await req.json(); } catch (e) { return error(400, "El pedido llegó mal formado."); }

  let store;
  try { store = fabricaStore(); } catch (e) { return error(500, "El almacenamiento de datos no está disponible: " + e.message); }

  if (cuerpo.accion === "leer") {
    try {
      const colecciones = {};
      for (const nombre of Object.keys(COLECCIONES)) {
        const d = normalizar(await store.get(clave(nombre), { type: "json" }));
        colecciones[nombre] = { items: d.items, borrados: d.borrados };
      }
      return responder(200, { ok: true, colecciones });
    } catch (e) {
      return error(500, "No se pudieron leer los datos: " + e.message);
    }
  }

  if (cuerpo.accion === "guardar") {
    const { coleccion, cambios } = cuerpo;
    const problema = validarCambios(coleccion, cambios);
    if (problema) return error(400, problema);

    try {
      for (let intento = 0; intento < INTENTOS; intento++) {
        const actual = await store.getWithMetadata(clave(coleccion), { type: "json" });
        const doc = aplicar(normalizar(actual && actual.data), cambios, Date.now(), String(usuario.email).toLowerCase());
        const texto = JSON.stringify(doc);
        if (texto.length > MAX_BYTES) return error(413, "Los datos guardados superan el tamaño permitido.");
        // Only write on top of the exact version just read; otherwise read again and merge
        const resultado = actual && actual.etag
          ? await store.setJSON(clave(coleccion), doc, { onlyIfMatch: actual.etag })
          : await store.setJSON(clave(coleccion), doc, { onlyIfNew: true });
        if (resultado && resultado.modified) {
          return responder(200, { ok: true, coleccion, datos: { items: doc.items, borrados: doc.borrados } });
        }
        // Someone saved in between: wait a little (random, growing) so the
        // phones racing for the same document don't collide again
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 40 * (intento + 1)));
      }
      return error(409, "Muchos cambios al mismo tiempo. Se va a reintentar solo en unos segundos.");
    } catch (e) {
      return error(500, "No se pudieron guardar los datos: " + e.message);
    }
  }

  return error(400, "Acción desconocida: " + cuerpo.accion);
};
