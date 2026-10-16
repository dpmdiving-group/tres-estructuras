/* Full panel backup, and a restore that only adds what is missing.
   Run: node tests/e2e/backup-restore.js */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { launch, startSite, phone, checker, FIXTURE } = require("./lib");

const t = checker("Full backup and restore");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "te-respaldo-"));
  const file = path.join(dir, "respaldo.json");
  const toast = (page, re) => page.waitForFunction((s) => new RegExp(s).test(document.body.innerText), re.source);

  const A = await phone(browser, site, { name: "A", email: "gerardo@example.com", context: { acceptDownloads: true },
    seed: {
      te_leads: [{ id: 1, fecha: "2026-10-10", fuente: "web", estado: "nuevo", nombre: "Ana" }, { id: 2, fecha: "2026-10-11", fuente: "cartel", estado: "nuevo", nombre: "Beto" }],
      te_movs: [{ id: "m1", fecha: "2026-10-01", tipo: "gasto", monto: 1000, moneda: "ARS", categoria: "pintura", descripcion: "Pintura" }],
      te_visitas: [{ id: "v1", fecha: "2026-10-20", hora: "10:00", nombre: "Ana", estado: "pendiente" }]
    } });
  await A.evaluate(() => TE_DATOS.sincronizar());

  await t.check("one file with every collection and the properties", async () => {
    const [dl] = await Promise.all([A.waitForEvent("download"), A.click("#btn-respaldo-todo")]);
    await dl.saveAs(file);
    const r = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(/^tres-estructuras-respaldo-\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    expect(r.tipo === "tres-estructuras-respaldo" && r.datos.leads.length === 2 && r.datos.movs.length === 1 && r.datos.visitas.length === 1, JSON.stringify(Object.keys(r.datos)));
    expect(r.propiedades.length === FIXTURE.length, "properties " + r.propiedades.length);
    await toast(A, /Respaldo descargado: 2 consultas, 1 visita/);
  });

  // Another phone deletes a lead and a movement, and edits the other lead
  const B = await phone(browser, site, { name: "B", email: "mauro@example.com" });
  await B.evaluate(() => TE_DATOS.sincronizar());
  await B.evaluate(() => {
    localStorage.setItem("te_leads", JSON.stringify(JSON.parse(localStorage.getItem("te_leads")).filter((l) => l.id === 1).map((l) => Object.assign(l, { nombre: "Ana editada" }))));
    localStorage.setItem("te_movs", "[]");
    return TE_DATOS.sincronizar();
  });
  await A.evaluate(() => TE_DATOS.sincronizar());

  await t.check("restoring on another phone asks first and brings back only what is missing", async () => {
    await B.setInputFiles("#input-respaldo-todo", file);
    await toast(B, /Se agregaron 1 consulta, 1 movimiento de contabilidad\. Lo demás ya estaba\./);
    expect(/Solo se agrega lo que falte/.test(B.dialogs[B.dialogs.length - 1] || ""), "no confirm");
    const leads = await B.evaluate(() => JSON.parse(localStorage.getItem("te_leads")));
    expect(leads.length === 2 && leads.find((l) => l.id === 1).nombre === "Ana editada", JSON.stringify(leads.map((l) => l.nombre)));
  });

  await t.check("the tabs show the restored items at once", async () => {
    await B.click("#tab-leads");
    expect(/Beto/.test(await B.textContent("#lista-leads")), "lead");
    await B.click("#tab-conta");
    expect(/Pintura/.test(await B.textContent("#lista-movs")), "movement");
  });

  await t.check("the restored items reach the other phones", async () => {
    await B.waitForTimeout(1500);
    await B.evaluate(() => TE_DATOS.sincronizar());
    await A.evaluate(() => TE_DATOS.sincronizar());
    const leads = await A.evaluate(() => JSON.parse(localStorage.getItem("te_leads")));
    const movs = await A.evaluate(() => JSON.parse(localStorage.getItem("te_movs")));
    expect(leads.some((l) => l.nombre === "Beto") && movs.some((m) => m.id === "m1"), "A: " + leads.map((l) => l.nombre) + " / " + movs.length);
    expect(leads.find((l) => l.id === 1).nombre === "Ana editada", "the edit was undone");
  });

  await t.check("restoring again adds nothing; another file is refused", async () => {
    await B.setInputFiles("#input-respaldo-todo", file);
    await toast(B, /No faltaba nada/);
    const bad = path.join(dir, "otro.json");
    fs.writeFileSync(bad, "[1,2]");
    await B.setInputFiles("#input-respaldo-todo", bad);
    await toast(B, /no es un respaldo completo/);
  });

  await t.check("no JavaScript errors", async () => {
    const errors = A.errors.concat(B.errors);
    expect(!errors.length, errors.join(" | "));
  });

  await browser.close();
  await site.close();
  fs.rmSync(dir, { recursive: true, force: true });
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
