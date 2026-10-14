/* Tests for netlify/functions/publicar.js against a fake GitHub API.
   Run: node --test tests/ */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const REPO = "owner/tres-estructuras";
process.env.GITHUB_TOKEN = "test-token";
process.env.GITHUB_REPO = REPO;
delete process.env.GITHUB_BRANCH;
delete process.env.ADMINS;

const { handler } = require("../netlify/functions/publicar.js");

/* ---------- Fake GitHub: just enough of the git data API ---------- */

function gitBlobSha(buffer) {
  return crypto.createHash("sha1")
    .update("blob " + buffer.length + "\0")
    .update(buffer)
    .digest("hex");
}

function fakeGitHub(initialProps) {
  const state = {
    blobs: {},      // sha -> Buffer
    files: {},      // path -> blob sha (what the branch currently points to)
    trees: {},      // sha -> entries
    commits: {},    // sha -> {tree, entries}
    head: null,
    refuseNextRefUpdate: false,
    counter: 0
  };

  function putBlob(buffer) {
    const sha = gitBlobSha(buffer);
    state.blobs[sha] = buffer;
    return sha;
  }
  function fakeSha(prefix) {
    state.counter++;
    return crypto.createHash("sha1").update(prefix + state.counter).digest("hex");
  }

  state.files["data/propiedades.json"] = putBlob(Buffer.from(JSON.stringify(initialProps, null, 2) + "\n"));
  state.files["sw.js"] = putBlob(Buffer.from('var VERSION = "te-1";\n'));
  state.head = fakeSha("commit");
  state.commits[state.head] = { tree: fakeSha("tree"), entries: [] };

  function json(status, body) {
    return Promise.resolve(new Response(JSON.stringify(body), { status: status }));
  }

  global.fetch = function (url, options) {
    const method = (options && options.method) || "GET";
    const path = new URL(url).pathname.replace("/repos/" + REPO, "");
    const body = options && options.body ? JSON.parse(options.body) : null;

    if (method === "GET" && path === "/git/ref/heads/main") {
      return json(200, { object: { sha: state.head } });
    }
    if (method === "GET" && path.indexOf("/git/commits/") === 0) {
      const c = state.commits[path.split("/").pop()];
      return c ? json(200, { tree: { sha: c.tree } }) : json(404, { message: "Not Found" });
    }
    if (method === "GET" && path.indexOf("/contents/") === 0) {
      const file = path.replace("/contents/", "");
      const sha = state.files[file];
      if (!sha) return json(404, { message: "Not Found" });
      return json(200, { sha: sha, content: state.blobs[sha].toString("base64") });
    }
    if (method === "POST" && path === "/git/blobs") {
      return json(201, { sha: putBlob(Buffer.from(body.content, "base64")) });
    }
    if (method === "POST" && path === "/git/trees") {
      const sha = fakeSha("tree");
      state.trees[sha] = body.tree;
      return json(201, { sha: sha });
    }
    if (method === "POST" && path === "/git/commits") {
      const sha = fakeSha("commit");
      state.commits[sha] = { tree: body.tree, entries: state.trees[body.tree], parents: body.parents };
      return json(201, { sha: sha });
    }
    if (method === "PATCH" && path === "/git/refs/heads/main") {
      if (state.refuseNextRefUpdate) {
        state.refuseNextRefUpdate = false;
        return json(422, { message: "Update is not a fast forward" });
      }
      const c = state.commits[body.sha];
      c.entries.forEach(function (e) { state.files[e.path] = e.sha; });
      state.head = body.sha;
      return json(200, { object: { sha: body.sha } });
    }
    return json(404, { message: "Unexpected call: " + method + " " + path });
  };

  state.readProps = function () {
    return JSON.parse(state.blobs[state.files["data/propiedades.json"]].toString("utf8"));
  };
  return state;
}

/* ---------- Helpers ---------- */

const USER = { clientContext: { user: { email: "dueno@example.com" } } };

function call(body, context) {
  return handler({ httpMethod: "POST", body: JSON.stringify(body) }, context || USER)
    .then(function (r) { return { status: r.statusCode, body: JSON.parse(r.body) }; });
}

function prop(codigo, extra) {
  return Object.assign({
    codigo: codigo, titulo: "Casa " + codigo, zona: "Quilmes", barrio: "Centro",
    operacion: "venta", estado: "disponible", precio: 100000, moneda: "USD",
    portada: "/media/" + codigo + "/a.webp", fotos: ["/media/" + codigo + "/a.webp"]
  }, extra || {});
}

const INITIAL = [prop("QLM-001"), prop("BER-001")];

/* ---------- Tests ---------- */

test("leer returns the list on GitHub and its version", async function () {
  const gh = fakeGitHub(INITIAL);
  const r = await call({ accion: "leer" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.propiedades, INITIAL);
  assert.equal(r.body.sha, gh.files["data/propiedades.json"]);
});

test("commit from the current version publishes and returns the new version", async function () {
  const gh = fakeGitHub(INITIAL);
  const before = await call({ accion: "leer" });
  const updated = [prop("QLM-001", { precio: 150000 }), prop("BER-001")];

  const r = await call({ accion: "commit", propiedades: updated, fotos: [], baseSha: before.body.sha });
  assert.equal(r.status, 200);
  assert.deepEqual(gh.readProps(), updated);

  // The returned sha is the real version on GitHub: the next publish can start from it
  const after = await call({ accion: "leer" });
  assert.equal(r.body.sha, after.body.sha);
  const again = await call({ accion: "commit", propiedades: updated, fotos: [], baseSha: r.body.sha });
  assert.equal(again.status, 200);
});

test("commit from an old version is refused with 409 and the latest list; nothing is overwritten", async function () {
  const gh = fakeGitHub(INITIAL);
  const old = await call({ accion: "leer" });

  // Another device publishes first
  const fromOther = [prop("QLM-001", { precio: 150000 }), prop("BER-001")];
  const first = await call({ accion: "commit", propiedades: fromOther, fotos: [], baseSha: old.body.sha });
  assert.equal(first.status, 200);
  const headAfterFirst = gh.head;

  // This device still starts from the old version
  const stale = [prop("QLM-001"), prop("BER-001", { estado: "reservada" })];
  const r = await call({ accion: "commit", propiedades: stale, fotos: [], baseSha: old.body.sha });

  assert.equal(r.status, 409);
  assert.equal(r.body.conflicto, true);
  assert.deepEqual(r.body.propiedades, fromOther);
  assert.equal(r.body.sha, first.body.sha);
  assert.equal(gh.head, headAfterFirst);
  assert.deepEqual(gh.readProps(), fromOther);
});

test("a panel that sends no baseSha (old cached version) is refused with 428", async function () {
  const gh = fakeGitHub(INITIAL);
  const headBefore = gh.head;
  const r = await call({ accion: "commit", propiedades: [prop("QLM-001")], fotos: [] });
  assert.equal(r.status, 428);
  assert.equal(gh.head, headBefore);
  assert.deepEqual(gh.readProps(), INITIAL);
});

test("losing the race at the very last step (branch moved) answers 409 so the panel re-reads", async function () {
  const gh = fakeGitHub(INITIAL);
  const before = await call({ accion: "leer" });
  gh.refuseNextRefUpdate = true;
  const r = await call({ accion: "commit", propiedades: [prop("QLM-001", { precio: 1 }), prop("BER-001")], fotos: [], baseSha: before.body.sha });
  assert.equal(r.status, 409);
  assert.equal(r.body.conflicto, true);
  assert.deepEqual(gh.readProps(), INITIAL);
});

test("commit still validates the data before anything else touches GitHub", async function () {
  fakeGitHub(INITIAL);
  const before = await call({ accion: "leer" });
  const r = await call({ accion: "commit", propiedades: [prop("QLM-001"), prop("QLM-001")], fotos: [], baseSha: before.body.sha });
  assert.equal(r.status, 422);
  assert.ok(r.body.problemas.some(function (p) { return /repetido/.test(p); }));
});

test("without a session nothing is read or written", async function () {
  fakeGitHub(INITIAL);
  const r = await call({ accion: "leer" }, { clientContext: {} });
  assert.equal(r.status, 401);
});
