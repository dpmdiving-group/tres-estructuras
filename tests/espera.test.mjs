/* Tests for netlify/functions/espera.mjs: the site's waiting list form.
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

const { default: handler, __setStoreFactory } = await import("../netlify/functions/espera.mjs");

let store;
function nuevo() { store = new StoreComoNetlify(); __setStoreFactory(() => store); }
const BIEN = { codigo: "QLM-001", operacion: "alquiler", nombre: "Lucía Gómez", telefono: "11 5555-1234", email: "Lucia@Example.com",
  cuando: "1mes", personas: "2", mascotas: "si", garantia: "caucion", comentario: "Trabajo en Capital", acepto: true, sitio: "", ms: 9000 };
function enviar(cuerpo, ip = "1.2.3.4", metodo = "POST") {
  return handler(new Request("https://x/.netlify/functions/espera", { method: metodo, headers: { "Content-Type": "application/json" }, body: metodo === "POST" ? JSON.stringify(cuerpo) : undefined }), { ip })
    .then(async (r) => ({ status: r.status, body: await r.json() }));
}
const lista = async () => Object.values(((await store.get("col/espera")) || { items: {} }).items);

test("a visitor's details are saved in the panel's waiting list, cleaned", async () => {
  nuevo();
  const r = await enviar(BIEN);
  assert.equal(r.status, 200);
  const [e] = await lista();
  assert.equal(e.codigo, "QLM-001");
  assert.equal(e.email, "lucia@example.com");
  assert.equal(e.personas, 2);
  assert.equal(e.estado, "esperando");
  assert.equal(e._por, "Formulario del sitio");
  assert.ok(e.id && e.fecha && e._u);
  assert.ok(!("acepto" in e) && !("sitio" in e) && !("ms" in e), JSON.stringify(e));
});

test("missing or wrong details are refused with a clear message", async () => {
  nuevo();
  for (const [cambio, re] of [[{ nombre: "" }, /nombre/], [{ telefono: "123" }, /WhatsApp/], [{ email: "no-es-mail" }, /email/],
    [{ acepto: false }, /aceptar/], [{ codigo: "<script>" }, /propiedad/]]) {
    const r = await enviar(Object.assign({}, BIEN, cambio));
    assert.equal(r.status, 400, JSON.stringify(cambio));
    assert.match(r.body.error, re);
  }
  assert.equal((await lista()).length, 0);
});

test("bots are told ok and nothing is saved: the hidden field, or a form sent in an instant", async () => {
  nuevo();
  assert.equal((await enviar(Object.assign({}, BIEN, { sitio: "http://spam" }))).status, 200);
  assert.equal((await enviar(Object.assign({}, BIEN, { ms: 300 }))).status, 200);
  assert.equal((await enviar(Object.assign({}, BIEN, { ms: undefined }))).status, 200);
  assert.equal((await lista()).length, 0);
});

test("the same phone on the same property updates its entry; another property is another entry", async () => {
  nuevo();
  await enviar(BIEN);
  const [e] = await lista();
  e.estado = "avisado";
  await store.setJSON("col/espera", { items: { [e.id]: e }, borrados: {}, rev: 2 });
  await enviar(Object.assign({}, BIEN, { telefono: "+54 9 11 5555-1234".replace("+54 9 ", ""), comentario: "Sigo interesada" }), "5.6.7.8");
  let l = await lista();
  assert.equal(l.length, 1);
  assert.equal(l[0].comentario, "Sigo interesada");
  assert.equal(l[0].estado, "esperando");
  await enviar(Object.assign({}, BIEN, { codigo: "DPX-002" }), "5.6.7.8");
  assert.equal((await lista()).length, 2);
});

test("at most 5 entries per visitor per hour", async () => {
  nuevo();
  for (let i = 0; i < 5; i++) assert.equal((await enviar(Object.assign({}, BIEN, { telefono: "11 5555-00" + (10 + i) }))).status, 200);
  const r = await enviar(Object.assign({}, BIEN, { telefono: "11 5555-0099" }));
  assert.equal(r.status, 429);
  assert.equal((await enviar(Object.assign({}, BIEN, { telefono: "11 5555-0099" }), "9.9.9.9")).status, 200, "another visitor");
  // The visitor's IP is never stored as such
  assert.ok(![...store.m.keys()].some((k) => k.includes("1.2.3.4")));
});

test("nothing can be read back from the form's endpoint", async () => {
  nuevo();
  await enviar(BIEN);
  assert.equal((await enviar(null, "1.2.3.4", "GET")).status, 405);
  // Whatever is sent, the answer never carries the list
  for (const cuerpo of [{ accion: "leer" }, { accion: "leer", ms: 9000 }, Object.assign({}, BIEN, { telefono: "11 4444-0000" })]) {
    const r = await enviar(cuerpo);
    assert.ok(!JSON.stringify(r.body).includes("Lucía") && !("items" in r.body), JSON.stringify(r.body));
  }
});
