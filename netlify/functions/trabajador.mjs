/* ============================================================
   TRES ESTRUCTURAS — A worker's own view of their jobs

   Workers (Trabajos tab) don't get into the panel. Each one gets a
   personal link from the panel ("Link para el celular"): its secret
   is shown once, and the panel keeps only its SHA-256 in the worker's
   record (field tokenHash, shared data). Whoever opens the link sees
   that worker's jobs and nothing else, and can mark each one as done
   or not done, with a note. A new link replaces the old one.

   POST JSON, header "Authorization: Trabajador <secret>":
     {accion: "leer"}
        -> {ok, trabajador: {nombre}, trabajos: [...], categorias: {clave: {nombre, color}},
            referencias: {codigo: texto}}
     {accion: "actualizar", id, estado: "hecho" | "no_se_pudo" | "pendiente", nota}
        -> {ok, trabajo}

   It reads and writes the same Netlify Blobs documents as datos.mjs
   (conditional writes on the ETag, so it never wipes a panel save).
   ============================================================ */

import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

const ESTADOS = ["hecho", "no_se_pudo", "pendiente"];
const MAX_NOTA = 500;
const INTENTOS = 10;
const DIAS_ATRAS = 30;     // done jobs shown back to this many days
const DIAS_ADELANTE = 60;  // and jobs ahead up to this many

function responder(codigo, cuerpo) {
  return new Response(JSON.stringify(cuerpo), {
    status: codigo,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
const error = (codigo, mensaje) => responder(codigo, { ok: false, error: mensaje });

let fabricaStore = () => getStore({ name: "panel", consistency: "strong" });
export function __setStoreFactory(fn) { fabricaStore = fn; }   // tests only

const clave = (coleccion) => "col/" + coleccion;
const normalizar = (d) => (d && typeof d === "object" ? { items: d.items || {}, borrados: d.borrados || {}, rev: d.rev || 0 } : { items: {}, borrados: {}, rev: 0 });

export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

// Argentina has no daylight saving: UTC-3 all year
function hoyArgentina(ahora) {
  return new Date(ahora - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
function sumarDias(fecha, n) {
  const d = new Date(fecha + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// What a worker may see of a job
function vista(t) {
  return {
    id: t.id, fecha: t.fecha || "", hora: t.hora || "", categoria: t.categoria || "", codigo: t.codigo || "",
    descripcion: t.descripcion || "", donde: t.donde || "", estado: t.estado || "pendiente",
    notaTrabajador: t.notaTrabajador || "", resueltoEn: t.resueltoEn || null
  };
}

export default async (req) => {
  if (req.method !== "POST") return error(405, "Este endpoint solo acepta POST.");

  const token = (/^Trabajador\s+([A-Za-z0-9_-]{20,200})$/.exec(req.headers.get("authorization") || "") || [])[1];
  if (!token) return error(401, "Falta el link personal. Abrí el link que te mandaron por WhatsApp.");

  let cuerpo;
  try { cuerpo = await req.json(); } catch (e) { return error(400, "El pedido llegó mal formado."); }

  let store;
  try { store = fabricaStore(); } catch (e) { return error(500, "El almacenamiento no está disponible."); }

  try {
    const trabajadores = normalizar(await store.get(clave("trabajadores"), { type: "json" }));
    const hash = hashToken(token);
    const yo = Object.values(trabajadores.items).find((w) => w && w.tokenHash && w.tokenHash === hash);
    if (!yo) return error(401, "Este link ya no sirve. Pedí uno nuevo.");

    if (cuerpo.accion === "leer") {
      const hoy = hoyArgentina(Date.now());
      const desde = sumarDias(hoy, -DIAS_ATRAS);
      const hasta = sumarDias(hoy, DIAS_ADELANTE);
      const todos = normalizar(await store.get(clave("trabajos"), { type: "json" }));
      const mios = Object.values(todos.items)
        .filter((t) => t && t.trabajador === yo.id && t.estado !== "cancelado")
        // Pending ones always (even old: they are overdue), the rest within the window
        .filter((t) => (t.estado === "pendiente" && String(t.fecha || "") <= hasta) ||
          (String(t.fecha || "") >= desde && String(t.fecha || "") <= hasta))
        .map(vista)
        .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
      const cats = normalizar(await store.get(clave("categorias"), { type: "json" }));
      const categorias = {};
      Object.values(cats.items).forEach((c) => { if (c && c.clave) categorias[c.clave] = { nombre: c.nombre, color: c.color }; });
      const refs = normalizar(await store.get(clave("referencias"), { type: "json" }));
      const codigos = new Set(mios.map((t) => t.codigo).filter(Boolean));
      const referencias = {};
      Object.values(refs.items).forEach((r) => { if (r && codigos.has(r.codigo)) referencias[r.codigo] = r.texto; });
      return responder(200, { ok: true, trabajador: { nombre: yo.nombre }, hoy, trabajos: mios, categorias, referencias });
    }

    if (cuerpo.accion === "actualizar") {
      const { id, estado } = cuerpo;
      const nota = String(cuerpo.nota || "").trim().slice(0, MAX_NOTA);
      if (typeof id !== "string" || !id) return error(400, "Falta el trabajo.");
      if (ESTADOS.indexOf(estado) < 0) return error(400, "Estado desconocido.");
      if (estado === "no_se_pudo" && !nota) return error(400, "Contá por qué no se pudo hacer.");
      for (let intento = 0; intento < INTENTOS; intento++) {
        const actual = await store.getWithMetadata(clave("trabajos"), { type: "json" });
        const doc = normalizar(actual && actual.data);
        const t = doc.items[id];
        // Only their own jobs, and never a cancelled one
        if (!t || t.trabajador !== yo.id || t.estado === "cancelado") return error(404, "Ese trabajo ya no está asignado a vos.");
        const ahora = Date.now();
        doc.items[id] = Object.assign({}, t, {
          estado: estado,
          notaTrabajador: nota,
          resueltoEn: estado === "pendiente" ? null : ahora,
          _u: ahora,
          _por: yo.nombre + " (trabajador)"
        });
        doc.rev += 1;
        const resultado = actual && actual.etag
          ? await store.setJSON(clave("trabajos"), doc, { onlyIfMatch: actual.etag })
          : await store.setJSON(clave("trabajos"), doc, { onlyIfNew: true });
        if (resultado && resultado.modified) return responder(200, { ok: true, trabajo: vista(doc.items[id]) });
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 40 * (intento + 1)));
      }
      return error(409, "Muchos cambios al mismo tiempo. Probá de nuevo en unos segundos.");
    }

    return error(400, "Acción desconocida.");
  } catch (e) {
    return error(500, "No se pudo completar: " + e.message);
  }
};
