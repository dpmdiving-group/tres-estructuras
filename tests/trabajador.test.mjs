/* Tests for netlify/functions/trabajador.mjs: a worker's personal link
   sees only their own jobs and can only mark those.
   Run: node --test tests/ */

import test from "node:test";
import assert from "node:assert/strict";

class StoreComoNetlify {
  constructor() { this.m = new Map(); this.n = 0; }
  async get(k) { const v = this.m.get(k); return v ? JSON.parse(v.data) : null; }
  async getWithMetadata(k) { const v = this.m.get(k); return v ? { data: JSON.parse(v.data), etag: v.etag } : null; }
  async setJSON(k, valor, op = {}) {
    const actual = this.m.get(k);
    if (op.onlyIfNew && actual) return { modified: false };
    if (op.onlyIfMatch && (!actual || actual.etag !== op.onlyIfMatch)) return { modified: false };
    const etag = '"' + (++this.n) + '"';
    this.m.set(k, { data: JSON.stringify(valor), etag });
    return { etag, modified: true };
  }
}

const { default: handler, __setStoreFactory, hashToken } = await import("../netlify/functions/trabajador.mjs");

const TOKEN_PANCHO = "pancho_secreto_1234567890abcdef";
const TOKEN_ROSA = "rosa_secreto_1234567890abcdefgh";
const hoy = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const dia = (n) => { const d = new Date(hoy + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

let store;
function sembrar() {
  store = new StoreComoNetlify();
  __setStoreFactory(() => store);
  const doc = (items) => ({ items: Object.fromEntries(items.map((x) => [x.id || x.clave || x.codigo, x])), borrados: {}, rev: 1 });
  store.setJSON("col/trabajadores", doc([
    { id: "T1", nombre: "Pancho", telefono: "1111", tokenHash: hashToken(TOKEN_PANCHO) },
    { id: "T2", nombre: "Rosa", telefono: "2222", tokenHash: hashToken(TOKEN_ROSA) },
    { id: "T3", nombre: "Sin link" }
  ]));
  store.setJSON("col/trabajos", doc([
    { id: "J1", fecha: dia(0), hora: "09:00", categoria: "reparacion", trabajador: "T1", codigo: "DPX-001", descripcion: "Cocina", estado: "pendiente" },
    { id: "J2", fecha: dia(-5), categoria: "pintura", trabajador: "T1", codigo: "", descripcion: "Atrasado", estado: "pendiente", donde: "Mitre 900" },
    { id: "J3", fecha: dia(1), categoria: "pintura", trabajador: "T2", codigo: "QLM-002", descripcion: "De Rosa", estado: "pendiente" },
    { id: "J4", fecha: dia(2), categoria: "pintura", trabajador: "T1", descripcion: "Cancelado", estado: "cancelado" },
    { id: "J5", fecha: dia(-90), categoria: "pintura", trabajador: "T1", descripcion: "Viejo hecho", estado: "hecho" },
    { id: "J6", fecha: dia(200), categoria: "pintura", trabajador: "T1", descripcion: "Muy adelante", estado: "pendiente" }
  ]));
  store.setJSON("col/categorias", doc([{ clave: "reparacion", nombre: "Reparación", color: "#7A4646" }]));
  store.setJSON("col/referencias", doc([{ codigo: "DPX-001", texto: "Rivadavia 450, 3° A" }, { codigo: "QLM-002", texto: "Mitre 1234" }]));
  store.setJSON("col/leads", doc([{ id: "L1", nombre: "Secreto" }]));
}

async function call(body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token !== null) headers.Authorization = "Trabajador " + (token || TOKEN_PANCHO);
  const res = await handler(new Request("http://x/.netlify/functions/trabajador", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}

test("without a link, or with an old one, nothing is shown", async () => {
  sembrar();
  assert.equal((await call({ accion: "leer" }, null)).status, 401);
  assert.equal((await call({ accion: "leer" }, "otro_token_que_no_existe_12345")).status, 401);
});

test("a worker sees only their own jobs: overdue ones, upcoming ones, never cancelled or someone else's", async () => {
  sembrar();
  const r = await call({ accion: "leer" });
  assert.equal(r.status, 200);
  assert.equal(r.body.trabajador.nombre, "Pancho");
  assert.deepEqual(r.body.trabajos.map((t) => t.id), ["J2", "J1"]);
  assert.equal(r.body.referencias["DPX-001"], "Rivadavia 450, 3° A");
  assert.equal(r.body.referencias["QLM-002"], undefined, "another worker's property address leaked");
  const texto = JSON.stringify(r.body);
  assert.ok(!/tokenHash|Rosa|Secreto|1111/.test(texto), "something private leaked: " + texto);
  assert.equal(r.body.categorias.reparacion.nombre, "Reparación");
});

test("marking a job done or not done, with a note; the panel sees who and when", async () => {
  sembrar();
  const r = await call({ accion: "actualizar", id: "J1", estado: "hecho", nota: "Listo, cambié la canilla" });
  assert.equal(r.status, 200);
  assert.equal(r.body.trabajo.estado, "hecho");
  const j = (await store.get("col/trabajos")).items.J1;
  assert.equal(j.notaTrabajador, "Listo, cambié la canilla");
  assert.equal(j._por, "Pancho (trabajador)");
  assert.ok(j.resueltoEn > 0 && j._u > 0);
  assert.equal(j.descripcion, "Cocina", "other fields must stay");
  assert.equal((await call({ accion: "actualizar", id: "J2", estado: "no_se_pudo", nota: "No había nadie" })).status, 200);
  assert.equal((await call({ accion: "actualizar", id: "J1", estado: "pendiente" })).body.trabajo.resueltoEn, null);
});

test("'no se pudo' needs a reason; someone else's or a cancelled job can't be touched", async () => {
  sembrar();
  assert.equal((await call({ accion: "actualizar", id: "J1", estado: "no_se_pudo", nota: "  " })).status, 400);
  assert.equal((await call({ accion: "actualizar", id: "J3", estado: "hecho" })).status, 404);
  assert.equal((await call({ accion: "actualizar", id: "J4", estado: "hecho" })).status, 404);
  assert.equal((await call({ accion: "actualizar", id: "J1", estado: "cancelado" })).status, 400);
  assert.equal((await store.get("col/trabajos")).items.J3.estado, "pendiente");
});

test("a long note is cut to 500 characters", async () => {
  sembrar();
  await call({ accion: "actualizar", id: "J1", estado: "hecho", nota: "x".repeat(900) });
  assert.equal((await store.get("col/trabajos")).items.J1.notaTrabajador.length, 500);
});
