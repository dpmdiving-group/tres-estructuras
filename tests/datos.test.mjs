/* Tests for netlify/functions/datos.mjs with a fake Identity endpoint and an
   in-memory store that behaves like Netlify Blobs in production: reads return
   an ETag, and a conditional write against a stale ETag is refused. (The
   BlobsServer bundled with @netlify/blobs omits the ETag on reads, so it
   can't exercise conditional writes. A temporary diagnostic on the real
   staging runtime confirmed the production behaviour on 2026-10-15.)
   Run: npm ci && node --test tests/ */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const pausa = () => new Promise((r) => setTimeout(r, Math.random() * 3));

class StoreComoNetlify {
  constructor() { this.m = new Map(); this.n = 0; }
  async get(k) { await pausa(); const v = this.m.get(k); return v ? JSON.parse(v.data) : null; }
  async getWithMetadata(k) { await pausa(); const v = this.m.get(k); return v ? { data: JSON.parse(v.data), etag: v.etag, metadata: {} } : null; }
  async setJSON(k, valor, op = {}) {
    await pausa();
    const actual = this.m.get(k);
    if (op.onlyIfNew && actual) return { modified: false };
    if (op.onlyIfMatch && (!actual || actual.etag !== op.onlyIfMatch)) return { modified: false };
    const etag = '"' + (++this.n) + '"';
    this.m.set(k, { data: JSON.stringify(valor), etag });
    return { etag, modified: true };
  }
  async delete(k) { this.m.delete(k); }
}
let store = new StoreComoNetlify();

// Fake Identity: "Bearer ok:<email>" is a valid session for <email>
const identity = http.createServer((req, res) => {
  const m = /^Bearer ok:(.+)$/.exec(req.headers.authorization || "");
  if (req.url === "/.netlify/identity/user" && m) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ email: m[1] }));
  }
  res.writeHead(401);
  res.end("{}");
});
await new Promise((r) => identity.listen(0, "127.0.0.1", r));
const SITE = `http://127.0.0.1:${identity.address().port}`;

const { default: handler, __setStoreFactory } = await import("../netlify/functions/datos.mjs");
__setStoreFactory(() => store);

async function call(body, who = "dueno@example.com") {
  const headers = { "Content-Type": "application/json" };
  if (who) headers.Authorization = "Bearer ok:" + who;
  const res = await handler(new Request(SITE + "/.netlify/functions/datos", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
}

async function reset() {
  store = new StoreComoNetlify();
  delete process.env.ADMINS;
}

const lead = (id, extra) => Object.assign({ id, fecha: "2026-10-15", fuente: "web", estado: "nuevo", nombre: "N " + id }, extra || {});

test.after(() => identity.close());

test("without a valid session nothing is read", async () => {
  await reset();
  assert.equal((await call({ accion: "leer" }, null)).status, 401);
  const res = await handler(new Request(SITE + "/.netlify/functions/datos", { method: "POST", headers: { Authorization: "Bearer forged" }, body: "{}" }));
  assert.equal(res.status, 401);
});

test("users outside ADMINS are refused", async () => {
  await reset();
  process.env.ADMINS = "dueno@example.com,socio@example.com";
  assert.equal((await call({ accion: "leer" }, "otro@example.com")).status, 403);
  assert.equal((await call({ accion: "leer" }, "Socio@Example.com")).status, 200);
});

test("leer on an empty store returns every collection empty", async () => {
  await reset();
  const r = await call({ accion: "leer" });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.colecciones).sort(), ["categorias", "leads", "movs", "trabajadores", "trabajos", "visitas"]);
  for (const c of Object.values(r.body.colecciones)) assert.deepEqual(c, { items: {}, borrados: {} });
});

test("guardar adds items with a server timestamp, and leer returns them", async () => {
  await reset();
  const before = Date.now();
  const r = await call({ accion: "guardar", coleccion: "leads", cambios: [{ id: "L1", item: lead("L1") }, { id: "L2", item: lead("L2") }] });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.datos.items).sort(), ["L1", "L2"]);
  assert.ok(r.body.datos.items.L1._u >= before);
  const l = await call({ accion: "leer" });
  assert.equal(l.body.colecciones.leads.items.L2.nombre, "N L2");
});

test("every saved item records who saved it; a phone can't pass itself off as someone else", async () => {
  await reset();
  await call({ accion: "guardar", coleccion: "leads", cambios: [{ id: "L1", item: lead("L1") }] }, "Gerardo@Example.com");
  const r = await call({ accion: "guardar", coleccion: "leads", cambios: [{ id: "L2", item: lead("L2", { _por: "otro@example.com" }) }] }, "mauro@example.com");
  assert.equal(r.body.datos.items.L1._por, "gerardo@example.com");
  assert.equal(r.body.datos.items.L2._por, "mauro@example.com");
});

test("deleting keeps a tombstone; saving the id again clears it", async () => {
  await reset();
  await call({ accion: "guardar", coleccion: "leads", cambios: [{ id: "L1", item: lead("L1") }] });
  const d = await call({ accion: "guardar", coleccion: "leads", cambios: [{ id: "L1", borrar: true }] });
  assert.equal(d.body.datos.items.L1, undefined);
  assert.ok(d.body.datos.borrados.L1 > 0);
  const again = await call({ accion: "guardar", coleccion: "leads", cambios: [{ id: "L1", item: lead("L1", { estado: "contactado" }) }] });
  assert.equal(again.body.datos.items.L1.estado, "contactado");
  assert.equal(again.body.datos.borrados.L1, undefined);
});

test("ten phones saving at the same moment: nothing is lost", async () => {
  await reset();
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    call({ accion: "guardar", coleccion: "leads", cambios: [{ id: "P" + i, item: lead("P" + i) }] })));
  for (const r of results) assert.equal(r.status, 200, JSON.stringify(r.body));
  const l = await call({ accion: "leer" });
  assert.deepEqual(Object.keys(l.body.colecciones.leads.items).sort(), Array.from({ length: 10 }, (_, i) => "P" + i).sort());
});

test("categories are keyed by 'clave'", async () => {
  await reset();
  const ok = await call({ accion: "guardar", coleccion: "categorias", cambios: [{ id: "albanileria", item: { clave: "albanileria", nombre: "Albañilería", color: "#A68F60" } }] });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.datos.items.albanileria.nombre, "Albañilería");
});

test("bad requests are refused without touching the data", async () => {
  await reset();
  assert.equal((await call({ accion: "guardar", coleccion: "secretos", cambios: [{ id: "x", item: { id: "x" } }] })).status, 400);
  assert.equal((await call({ accion: "guardar", coleccion: "leads", cambios: [] })).status, 400);
  assert.equal((await call({ accion: "guardar", coleccion: "leads", cambios: [{ id: "L1", item: lead("L9") }] })).status, 400);
  assert.equal((await call({ accion: "guardar", coleccion: "leads", cambios: [{ id: "", item: lead("") }] })).status, 400);
  assert.equal((await call({ accion: "otra" })).status, 400);
  const l = await call({ accion: "leer" });
  assert.deepEqual(l.body.colecciones.leads.items, {});
});

test("tombstones older than 120 days are cleaned up on the next save", async () => {
  await reset();
  await store.setJSON("col/movs", { items: {}, borrados: { VIEJO: Date.now() - 200 * 86400000, NUEVO: Date.now() - 86400000 }, rev: 3 });
  const r = await call({ accion: "guardar", coleccion: "movs", cambios: [{ id: "M1", item: { id: "M1", monto: 10 } }] });
  assert.equal(r.body.datos.borrados.VIEJO, undefined);
  assert.ok(r.body.datos.borrados.NUEVO);
});
