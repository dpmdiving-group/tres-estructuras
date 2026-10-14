/* Tests for admin/te-merge.js. Run: node --test tests/ */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../admin/te-merge.js");

function prop(codigo, extra) {
  return Object.assign({
    codigo: codigo,
    titulo: "Casa " + codigo,
    zona: "Quilmes",
    estado: "disponible",
    precio: 100000,
    moneda: "USD",
    portada: "/media/" + codigo + "/a.webp",
    fotos: ["/media/" + codigo + "/a.webp"]
  }, extra || {});
}

function edit(list, codigo, changes) {
  return list.map(function (p) {
    return p.codigo === codigo ? Object.assign({}, p, changes) : Object.assign({}, p);
  });
}

function find(list, codigo) {
  return list.find(function (p) { return p.codigo === codigo; });
}

const BASE = [prop("QLM-001"), prop("BER-001", { zona: "Bernal" }), prop("QLM-002")];

test("no changes anywhere keeps the list as is", function () {
  const r = M.merge(BASE, BASE, BASE);
  assert.equal(r.conflicts.length, 0);
  assert.deepEqual(M.resolve(r), BASE);
});

test("the original bug: an old copy no longer wipes out changes from another device", function () {
  // Device A published a new price; device B still has the old copy and changes a status
  const remote = edit(BASE, "QLM-001", { precio: 150000 });
  const local = edit(BASE, "BER-001", { estado: "reservada" });
  const r = M.merge(BASE, local, remote);
  const out = M.resolve(r);
  assert.equal(r.conflicts.length, 0);
  assert.equal(find(out, "QLM-001").precio, 150000);
  assert.equal(find(out, "BER-001").estado, "reservada");
});

test("different fields of the same property merge automatically", function () {
  const remote = edit(BASE, "QLM-001", { precio: 150000 });
  const local = edit(BASE, "QLM-001", { estado: "reservada" });
  const r = M.merge(BASE, local, remote);
  const p = find(M.resolve(r), "QLM-001");
  assert.equal(r.conflicts.length, 0);
  assert.equal(p.precio, 150000);
  assert.equal(p.estado, "reservada");
});

test("the same change on both sides is not a conflict", function () {
  const both = edit(BASE, "QLM-001", { precio: 150000 });
  const r = M.merge(BASE, both, both);
  assert.equal(r.conflicts.length, 0);
  assert.equal(find(M.resolve(r), "QLM-001").precio, 150000);
});

test("the same field changed differently is a conflict; default is the site, 'local' picks mine", function () {
  const remote = edit(BASE, "QLM-001", { precio: 150000, titulo: "Cambio del sitio" });
  const local = edit(BASE, "QLM-001", { precio: 130000, estado: "reservada" });
  const r = M.merge(BASE, local, remote);

  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].type, "fields");
  assert.deepEqual(r.conflicts[0].fields.map(function (f) { return f.field; }), ["precio"]);

  const site = find(M.resolve(r), "QLM-001");
  assert.equal(site.precio, 150000);
  // Non-conflicting changes from both sides survive either way
  assert.equal(site.titulo, "Cambio del sitio");
  assert.equal(site.estado, "reservada");

  const mine = find(M.resolve(r, { "QLM-001": "local" }), "QLM-001");
  assert.equal(mine.precio, 130000);
  assert.equal(mine.titulo, "Cambio del sitio");
  assert.equal(mine.estado, "reservada");
});

test("new properties from both sides are all kept, site order first", function () {
  const remote = BASE.concat([prop("LAN-001", { zona: "Lanús" })]);
  const local = BASE.concat([prop("LOM-001", { zona: "Lomas" })]);
  const r = M.merge(BASE, local, remote);
  assert.equal(r.conflicts.length, 0);
  assert.deepEqual(M.resolve(r).map(function (p) { return p.codigo; }),
    ["QLM-001", "BER-001", "QLM-002", "LAN-001", "LOM-001"]);
});

test("same new code created on two devices: the local one gets the next free code and its photo paths move", function () {
  const remote = BASE.concat([prop("QLM-003", { titulo: "Del otro telefono" })]);
  const local = BASE.concat([prop("QLM-003", { titulo: "De este telefono" })]);
  const r = M.merge(BASE, local, remote);
  const out = M.resolve(r);

  assert.equal(r.conflicts.length, 0);
  assert.deepEqual(r.renamed, [{ from: "QLM-003", to: "QLM-004" }]);
  assert.equal(find(out, "QLM-003").titulo, "Del otro telefono");
  const moved = find(out, "QLM-004");
  assert.equal(moved.titulo, "De este telefono");
  assert.equal(moved.portada, "/media/QLM-004/a.webp");
  assert.deepEqual(moved.fotos, ["/media/QLM-004/a.webp"]);
});

test("deleted here and untouched on the site: stays deleted", function () {
  const local = BASE.filter(function (p) { return p.codigo !== "QLM-002"; });
  const r = M.merge(BASE, local, BASE);
  assert.equal(r.conflicts.length, 0);
  assert.equal(find(M.resolve(r), "QLM-002"), undefined);
});

test("deleted on the site and untouched here: stays deleted", function () {
  const remote = BASE.filter(function (p) { return p.codigo !== "QLM-002"; });
  const r = M.merge(BASE, BASE, remote);
  assert.equal(r.conflicts.length, 0);
  assert.equal(find(M.resolve(r), "QLM-002"), undefined);
});

test("deleted here but changed on the site: conflict, default keeps the site version", function () {
  const local = BASE.filter(function (p) { return p.codigo !== "QLM-002"; });
  const remote = edit(BASE, "QLM-002", { precio: 99000 });
  const r = M.merge(BASE, local, remote);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].type, "deleted_here");
  assert.equal(find(M.resolve(r), "QLM-002").precio, 99000);
  assert.equal(find(M.resolve(r, { "QLM-002": "local" }), "QLM-002"), undefined);
});

test("deleted on the site but changed here: conflict, default follows the site (deleted)", function () {
  const remote = BASE.filter(function (p) { return p.codigo !== "QLM-002"; });
  const local = edit(BASE, "QLM-002", { precio: 99000 });
  const r = M.merge(BASE, local, remote);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].type, "deleted_on_site");
  assert.equal(find(M.resolve(r), "QLM-002"), undefined);
  assert.equal(find(M.resolve(r, { "QLM-002": "local" }), "QLM-002").precio, 99000);
});

test("without a base (first run, or a file import) every difference is a conflict, nothing is lost silently", function () {
  const remote = edit(BASE, "QLM-001", { precio: 150000 });
  const local = edit(BASE, "BER-001", { estado: "reservada" });
  const r = M.merge(null, local, remote);
  assert.deepEqual(r.conflicts.map(function (c) { return c.codigo; }).sort(), ["BER-001", "QLM-001"]);
  // Properties only on one side are kept, never treated as deletions
  const onlyLocal = M.merge(null, BASE.concat([prop("LOM-001")]), BASE);
  assert.ok(find(M.resolve(onlyLocal), "LOM-001"));
});

test("fields edited in the form compare equal regardless of key order and null vs missing", function () {
  const reordered = BASE.map(function (p) {
    const copy = {};
    Object.keys(p).reverse().forEach(function (k) { copy[k] = p[k]; });
    copy.expensas = null;
    return copy;
  });
  assert.deepEqual(M.changedCodes(BASE, reordered), []);
  const r = M.merge(BASE, reordered, edit(BASE, "QLM-001", { precio: 1 }));
  assert.equal(r.conflicts.length, 0);
});

test("changedCodes lists added, removed and edited properties", function () {
  const after = edit(BASE, "QLM-001", { precio: 1 })
    .filter(function (p) { return p.codigo !== "QLM-002"; })
    .concat([prop("LAN-001")]);
  assert.deepEqual(M.changedCodes(BASE, after).sort(), ["LAN-001", "QLM-001", "QLM-002"]);
});

test("nextFreeCode never reuses a number", function () {
  assert.equal(M.nextFreeCode("QLM", ["QLM-001", "QLM-007", "BER-009"]), "QLM-008");
  assert.equal(M.nextFreeCode("LAN", ["QLM-001"]), "LAN-001");
});
