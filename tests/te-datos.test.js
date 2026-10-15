/* Tests for the merge logic in admin/te-datos.js. Run: node --test tests/ */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../admin/te-datos.js");

const J = JSON.stringify;
const lead = (id, extra) => Object.assign({ id, nombre: "N" + id, estado: "nuevo" }, extra || {});
const baseDe = (items) => Object.fromEntries(items.map((x) => [x.id, J(x)]));
const doc = (items) => ({ items: Object.fromEntries(items.map((x) => [x.id, x])), borrados: {} });

test("pendientes: new, changed and deleted items; untouched ones are not sent", function () {
  const a = lead("A", { _u: 1 }), b = lead("B", { _u: 1 }), c = lead("C", { _u: 1 });
  const local = [a, Object.assign({}, b, { estado: "contactado" }), lead("N")];
  const cambios = D.pendientes(local, baseDe([a, b, c]), "id");
  assert.deepEqual(cambios.map((x) => x.id + (x.borrar ? ":borrar" : "")).sort(), ["B", "C:borrar", "N"]);
});

test("first sync on a phone with old local data: everything is sent", function () {
  const cambios = D.pendientes([lead("A"), lead("B")], {}, "id");
  assert.deepEqual(cambios.map((x) => x.id), ["A", "B"]);
});

test("combinar: items from another phone are added, changes from another phone applied", function () {
  const a = lead("A", { _u: 1 });
  const aRemote = Object.assign({}, a, { estado: "visita", _u: 2 });
  const r = D.combinar([a], baseDe([a]), doc([aRemote, lead("X", { _u: 2 })]), "id", null, null);
  assert.equal(r.cambio, true);
  assert.deepEqual(r.lista, [aRemote, lead("X", { _u: 2 })]);
  assert.deepEqual(D.pendientes(r.lista, r.base, "id"), []);
});

test("combinar: a change made here and not sent yet survives a remote change", function () {
  const a = lead("A", { _u: 1 });
  const mine = Object.assign({}, a, { nombre: "Ana (mío)" });
  const theirs = Object.assign({}, a, { estado: "visita", _u: 2 });
  const r = D.combinar([mine], baseDe([a]), doc([theirs]), "id", null, null);
  assert.deepEqual(r.lista, [mine]);
  assert.deepEqual(D.pendientes(r.lista, r.base, "id").map((x) => x.id), ["A"]);
});

test("combinar: deleted on another phone and untouched here -> gone here too", function () {
  const a = lead("A", { _u: 1 }), b = lead("B", { _u: 1 });
  const r = D.combinar([a, b], baseDe([a, b]), doc([a]), "id", null, null);
  assert.deepEqual(r.lista.map((x) => x.id), ["A"]);
  assert.deepEqual(D.pendientes(r.lista, r.base, "id"), []);
});

test("combinar: deleted elsewhere but edited here -> kept, and sent again", function () {
  const b = lead("B", { _u: 1 });
  const edited = Object.assign({}, b, { estado: "reservado" });
  const r = D.combinar([edited], baseDe([b]), doc([]), "id", null, null);
  assert.deepEqual(r.lista, [edited]);
  assert.deepEqual(D.pendientes(r.lista, r.base, "id").map((x) => x.id), ["B"]);
});

test("combinar: deleted here and not sent yet -> the server copy doesn't bring it back", function () {
  const a = lead("A", { _u: 1 }), b = lead("B", { _u: 1 });
  const r = D.combinar([a], baseDe([a, b]), doc([a, b]), "id", null, null);
  assert.deepEqual(r.lista.map((x) => x.id), ["A"]);
  assert.deepEqual(D.pendientes(r.lista, r.base, "id"), [{ id: "B", borrar: true }]);
});

test("after this phone's own save, the server copies (with _u) replace the sent ones", function () {
  const n = lead("N");
  const back = Object.assign({}, n, { _u: 99 });
  const r = D.combinar([n], {}, doc([back]), "id", { N: J(n) }, null);
  assert.deepEqual(r.lista, [back]);
  assert.deepEqual(D.pendientes(r.lista, r.base, "id"), []);
});

test("an item edited again while it was being sent keeps the newer local version", function () {
  const sent = lead("N");
  const editedMeanwhile = Object.assign({}, sent, { estado: "contactado" });
  const r = D.combinar([editedMeanwhile], {}, doc([Object.assign({}, sent, { _u: 5 })]), "id", { N: J(sent) }, null);
  assert.deepEqual(r.lista, [editedMeanwhile]);
  assert.deepEqual(D.pendientes(r.lista, r.base, "id").map((x) => x.id), ["N"]);
});

test("ordering: newest lead first when a comparator is given", function () {
  const ord = (a, b) => String(b.id).localeCompare(String(a.id));
  const r = D.combinar([lead("L100")], {}, doc([lead("L300"), lead("L200")]), "id", null, ord);
  assert.deepEqual(r.lista.map((x) => x.id), ["L300", "L200", "L100"]);
});

test("a phone that never saved this collection just takes the server's", function () {
  const r = D.combinar([], {}, doc([lead("A"), lead("B")]), "id", null, null);
  assert.deepEqual(r.lista.map((x) => x.id), ["A", "B"]);
});

test("categories merge by their 'clave' field", function () {
  const c = { clave: "pintura", nombre: "Pintura" };
  const nueva = { clave: "albanileria", nombre: "Albañilería" };
  const r = D.combinar([c], { pintura: J(c) }, { items: { pintura: c, albanileria: nueva } }, "clave", null, null);
  assert.deepEqual(r.lista.map((x) => x.clave), ["pintura", "albanileria"]);
});
