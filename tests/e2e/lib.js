/* ============================================================
   Shared helpers for the browser tests (tests/e2e).

   startSite() runs a small fake Netlify on localhost:
     - the site's files, with the real Content-Security-Policy
       from netlify.toml
     - a fake Identity: logging in as <email> gives the token
       "ok:<email>"
     - the REAL publish function (netlify/functions/publicar.js)
       against a fake GitHub kept in memory
     - the REAL shared-data function (netlify/functions/datos.mjs)
     - the REAL waiting list form function (netlify/functions/espera.mjs)
       against an in-memory store that behaves like Netlify Blobs
       (ETags and conditional writes)
   data/propiedades.json is served from the fake GitHub, so tests
   start from tests/e2e/fixtures/propiedades.json, never from the
   client's real list.

   launch() starts headless Chrome: CHROME_PATH, a system Chrome
   or Chromium, or Playwright's own Chromium.
   ============================================================ */

"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..", "..");
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "propiedades.json"), "utf8"));
const CSP = (/Content-Security-Policy = "([^"]+)"/.exec(fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8")) || [])[1];
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".webm": "video/webm"
};

function playwright() {
  try {
    return require("playwright-core");
  } catch (e) {
    console.error("playwright-core is not installed. Run once: npm install --no-save playwright-core");
    process.exit(2);
  }
}

function launch() {
  const { chromium } = playwright();
  const exe = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]
    .filter(Boolean).find((p) => fs.existsSync(p));
  // Without one, Playwright's own Chromium: npx playwright-core install chromium
  return chromium.launch({ executablePath: exe, headless: true });
}

/* ---------- Fake GitHub: just the git data API calls publicar.js makes ---------- */

const gh = { blobs: {}, files: {}, trees: {}, commits: {}, head: null, n: 0 };

function blobSha(buf) {
  return crypto.createHash("sha1").update("blob " + buf.length + "\0").update(buf).digest("hex");
}
function putBlob(buf) { const s = blobSha(buf); gh.blobs[s] = buf; return s; }
function fakeSha(prefix) { gh.n++; return crypto.createHash("sha1").update(prefix + gh.n).digest("hex"); }

function resetGitHub(props) {
  Object.assign(gh, { blobs: {}, files: {}, trees: {}, commits: {}, head: null });
  gh.files["data/propiedades.json"] = putBlob(Buffer.from(JSON.stringify(props, null, 2) + "\n"));
  gh.files["sw.js"] = putBlob(Buffer.from('var VERSION = "te-1";\n'));
  gh.head = fakeSha("c");
  gh.commits[gh.head] = { tree: fakeSha("t"), entries: [] };
}

const realFetch = global.fetch;
global.fetch = function (url, options) {
  if (String(url).indexOf("https://api.github.com/") !== 0) return realFetch(url, options);
  const method = (options && options.method) || "GET";
  const p = new URL(url).pathname.replace("/repos/owner/repo", "");
  const body = options && options.body ? JSON.parse(options.body) : null;
  const json = (s, b) => Promise.resolve(new Response(JSON.stringify(b), { status: s }));
  if (method === "GET" && p === "/git/ref/heads/main") return json(200, { object: { sha: gh.head } });
  if (method === "GET" && p.startsWith("/git/commits/")) return json(200, { tree: { sha: gh.commits[p.split("/").pop()].tree } });
  if (method === "GET" && p === "/commits") {
    const c = gh.commits[gh.head];
    return json(200, c.message ? [{ commit: { message: c.message, committer: { date: c.date } } }] : []);
  }
  if (method === "GET" && p.startsWith("/contents/")) {
    const s = gh.files[p.replace("/contents/", "")];
    return s ? json(200, { sha: s, content: gh.blobs[s].toString("base64") }) : json(404, { message: "Not Found" });
  }
  if (method === "POST" && p === "/git/blobs") return json(201, { sha: putBlob(Buffer.from(body.content, "base64")) });
  if (method === "POST" && p === "/git/trees") { const s = fakeSha("t"); gh.trees[s] = body.tree; return json(201, { sha: s }); }
  if (method === "POST" && p === "/git/commits") {
    const s = fakeSha("c");
    gh.commits[s] = { tree: body.tree, entries: gh.trees[body.tree], message: body.message, date: new Date().toISOString() };
    return json(201, { sha: s });
  }
  if (method === "PATCH" && p === "/git/refs/heads/main") {
    gh.commits[body.sha].entries.forEach((e) => { gh.files[e.path] = e.sha; });
    gh.head = body.sha;
    return json(200, {});
  }
  return json(404, { message: "unexpected " + method + " " + p });
};

function publishedProps() {
  return JSON.parse(gh.blobs[gh.files["data/propiedades.json"]].toString("utf8"));
}

/* ---------- In-memory store that behaves like Netlify Blobs in production ---------- */

class StoreComoNetlify {
  constructor() { this.m = new Map(); this.n = 0; }
  async get(k) { const v = this.m.get(k); return v ? JSON.parse(v.data) : null; }
  async getWithMetadata(k) { const v = this.m.get(k); return v ? { data: JSON.parse(v.data), etag: v.etag } : null; }
  async setJSON(k, val, op = {}) {
    const cur = this.m.get(k);
    if (op.onlyIfNew && cur) return { modified: false };
    if (op.onlyIfMatch && (!cur || cur.etag !== op.onlyIfMatch)) return { modified: false };
    const etag = '"' + (++this.n) + '"';
    this.m.set(k, { data: JSON.stringify(val), etag });
    return { etag, modified: true };
  }
  async delete(k) { this.m.delete(k); }
}

/* ---------- The fake Netlify ---------- */

process.env.GITHUB_TOKEN = "test-token";
process.env.GITHUB_REPO = "owner/repo";
delete process.env.GITHUB_BRANCH;
delete process.env.ADMINS;

async function startSite(options) {
  const opts = options || {};
  resetGitHub(opts.props || FIXTURE);
  const publicar = require(path.join(ROOT, "netlify/functions/publicar.js")).handler;
  const datosMod = await import(path.join(ROOT, "netlify/functions/datos.mjs"));
  const trabajadorMod = await import(path.join(ROOT, "netlify/functions/trabajador.mjs"));
  const esperaMod = await import(path.join(ROOT, "netlify/functions/espera.mjs"));
  const store = new StoreComoNetlify();
  datosMod.__setStoreFactory(() => store);
  trabajadorMod.__setStoreFactory(() => store);
  esperaMod.__setStoreFactory(() => store);
  const calls = [];

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://localhost");
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString();
    const json = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    const email = (/^Bearer ok:(.+)$/.exec(req.headers.authorization || "") || [])[1];

    if (u.pathname === "/.netlify/identity/token") {
      const f = new URLSearchParams(body);
      const user = f.get("username") || (f.get("refresh_token") || "").replace(/^r:/, "") || "dueno@example.com";
      return json(200, { access_token: "ok:" + user, refresh_token: "r:" + user, expires_in: 3600 });
    }
    if (u.pathname === "/.netlify/identity/user") return email ? json(200, { email }) : json(401, {});
    if (u.pathname === "/.netlify/functions/publicar") {
      const r = await publicar({ httpMethod: req.method, body }, { clientContext: email ? { user: { email } } : {} });
      calls.push("publicar:" + (JSON.parse(body || "{}").accion) + ":" + r.statusCode);
      res.writeHead(r.statusCode, r.headers || {});
      return res.end(r.body);
    }
    if (u.pathname === "/.netlify/functions/datos") {
      const r = await datosMod.default(new Request("http://" + req.headers.host + u.pathname, { method: req.method, headers: req.headers, body: body || undefined }));
      calls.push("datos:" + (JSON.parse(body || "{}").accion) + ":" + r.status);
      res.writeHead(r.status, { "Content-Type": "application/json" });
      return res.end(await r.text());
    }
    if (u.pathname === "/.netlify/functions/trabajador") {
      const r = await trabajadorMod.default(new Request("http://" + req.headers.host + u.pathname, { method: req.method, headers: req.headers, body: body || undefined }));
      calls.push("trabajador:" + (JSON.parse(body || "{}").accion) + ":" + r.status);
      res.writeHead(r.status, { "Content-Type": "application/json" });
      return res.end(await r.text());
    }
    if (u.pathname === "/.netlify/functions/espera") {
      // The site's waiting list form: no session; the visitor is told apart by IP
      const r = await esperaMod.default(new Request("http://" + req.headers.host + u.pathname, { method: req.method, headers: req.headers, body: body || undefined }),
        { ip: req.headers["x-test-ip"] || req.socket.remoteAddress });
      calls.push("espera:" + r.status);
      res.writeHead(r.status, { "Content-Type": "application/json" });
      return res.end(await r.text());
    }
    if (u.pathname.startsWith("/.netlify/")) { res.writeHead(404); return res.end(); }
    if (u.pathname === "/data/propiedades.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(gh.blobs[gh.files["data/propiedades.json"]]);
    }
    let file = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); }
    const headers = { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" };
    if (CSP && path.extname(file) === ".html") headers["Content-Security-Policy"] = CSP;
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));

  return {
    base: "http://127.0.0.1:" + server.address().port,
    published: publishedProps,
    head: () => gh.head,
    store,
    calls,
    close: () => new Promise((r) => server.close(r))
  };
}

/* ---------- A phone ----------
   login: "seed" (already logged in), "form" (types mail and password),
   or null (taps "seguir sin conectar"). seed: localStorage to start with.
   clock: a fixed local date and time for the page, e.g. "2026-10-16T12:00:00". */
async function phone(browser, site, options) {
  const o = Object.assign({ name: "phone", email: "dueno@example.com", login: "seed", path: "/admin/" }, options || {});
  const ctx = await browser.newContext(Object.assign({
    viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, serviceWorkers: "block"
  }, o.context || {}));
  // Only localhost: fonts and CDNs are not needed and must not slow the tests
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
  await ctx.addInitScript((a) => {
    // Only the page itself: embedded frames (a blocked YouTube player) can't use storage
    if (window.top !== window) return;
    try { if (localStorage.getItem("__e2e")) return; } catch (e) { return; }
    localStorage.setItem("__e2e", "1");
    if (a.login === "seed") {
      localStorage.setItem("te_sesion", JSON.stringify({ access_token: "ok:" + a.email, refresh_token: "r:" + a.email, expira: Date.now() + 3600e3, email: a.email }));
    }
    Object.keys(a.seed || {}).forEach((k) => localStorage.setItem(k, typeof a.seed[k] === "string" ? a.seed[k] : JSON.stringify(a.seed[k])));
  }, { login: o.login, email: o.email, seed: o.seed });
  if (o.clock) {
    // A fixed "now" (local time) so today, due dates and overdue days are predictable
    await ctx.addInitScript((at) => {
      const Real = Date;
      const fixed = new Real(at).getTime();
      class Fake extends Real { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }
      window.Date = Fake;
    }, o.clock);
  }
  const page = await ctx.newPage();
  page.ctx = ctx;
  page.errors = [];
  page.dialogs = [];
  page.on("pageerror", (e) => page.errors.push(o.name + ": " + e.message));
  page.on("dialog", (d) => { page.dialogs.push(d.message()); return d.type() === "prompt" ? d.accept(o.promptAnswer || "") : d.accept(); });
  if (o.path === null) return page;
  await page.goto(site.base + o.path);
  if (o.path.startsWith("/admin")) {
    if (o.login === "form") {
      await page.fill("[data-te='mail']", o.email);
      await page.fill("[data-te='pass']", "secreto123");
      await page.click("[data-te='ok']");
    } else if (!o.login) {
      await page.click("[data-te='sin']");
    }
    if (o.login) {
      await page.waitForFunction(() => /Conectado/.test((document.querySelector(".te-barra__texto") || {}).textContent || "") &&
        !!localStorage.getItem("te_base"), null, { timeout: 30000 });   // the full suite can slow it down
    } else {
      await page.waitForSelector("#lista .item");
    }
  }
  return page;
}

/* ---------- Results ---------- */

function checker(title) {
  const results = [];
  return {
    async check(name, fn) {
      try { await fn(); results.push("PASS " + name); }
      catch (e) { results.push("FAIL " + name + "\n     " + String((e && e.message) || e).split("\n")[0]); }
    },
    expect(cond, msg) { if (!cond) throw new Error(msg); },
    done() {
      const passed = results.filter((r) => r.startsWith("PASS")).length;
      console.log((title ? "# " + title + "\n" : "") + results.join("\n") + "\n" + passed + "/" + results.length + " passed");
      process.exitCode = passed === results.length ? 0 : 1;
      return passed === results.length;
    }
  };
}

module.exports = { ROOT, FIXTURE, launch, startSite, phone, checker, StoreComoNetlify };
