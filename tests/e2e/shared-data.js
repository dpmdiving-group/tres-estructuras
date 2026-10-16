/* Two phones sharing leads, visits, jobs and accounting through the REAL
   netlify/functions/datos.mjs. Run: node tests/e2e/shared-data.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Panel data shared between phones");
const expect = t.expect;

const sync = (page) => page.evaluate(() => TE_DATOS.sincronizar());
const local = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]"), key);
const settle = (page) => page.waitForTimeout(2200);   // te-datos sends 1.5 s after a save

(async function main() {
  const site = await startSite();
  const browser = await launch();

  // Both phones had leads before shared data existed
  const A = await phone(browser, site, { name: "A", email: "gerardo@example.com", login: "form", promptAnswer: "Albañilería",
    seed: { te_leads: [{ id: "L100", fecha: "2026-10-01", fuente: "cartel", estado: "nuevo", nombre: "Ana (teléfono A)" }] } });
  await settle(A);
  const B = await phone(browser, site, { name: "B", email: "mauro@example.com", login: "form",
    seed: { te_leads: [{ id: "L200", fecha: "2026-10-02", fuente: "web", estado: "nuevo", nombre: "Beto (teléfono B)" }] } });
  await settle(B);
  await sync(A);

  await t.check("existing leads from both phones are merged on first login", async () => {
    const la = (await local(A, "te_leads")).map((l) => l.id).sort();
    const lb = (await local(B, "te_leads")).map((l) => l.id).sort();
    expect(JSON.stringify(la) === '["L100","L200"]' && JSON.stringify(lb) === '["L100","L200"]', "A " + la + " / B " + lb);
  });

  let carla;
  await t.check("a lead added on phone A appears on phone B, first in the list", async () => {
    await B.click("#tab-leads");
    await A.click("#tab-leads");
    await A.click("#btn-nuevo-lead");
    await A.fill("#l-mensaje", "Hola Tres Estructuras, me interesa la propiedad QLM-001 (Casa). Escaneé el QR del cartel.");
    await A.fill("#l-nombre", "Carla nueva");
    await A.fill("#l-telefono", "1122334455");
    await A.click("#btn-guardar-lead");
    await settle(A);
    await sync(B);
    expect((await B.textContent("#lista-leads")).includes("Carla nueva"), "not on B");
    expect(((await B.textContent("#lista-leads .lead .lead__quien")) || "").includes("Carla"), "not first");
    carla = (await local(B, "te_leads")).find((l) => l.nombre === "Carla nueva");
  });

  await t.check("phone B shows who added it", async () => {
    const row = await B.$eval("select[data-lead='" + carla.id + "']", (s) => s.closest(".lead").querySelector(".editado").textContent);
    expect(/^Último cambio: gerardo · hoy \d\d:\d\d$/.test(row), row);
  });

  await t.check("a status changed on phone B shows on phone A, with the badge and the editor", async () => {
    await B.selectOption("select[data-lead='" + carla.id + "']", "contactado");
    await settle(B);
    await sync(A);
    expect((await A.inputValue("select[data-lead='" + carla.id + "']")) === "contactado", "status");
    expect((await A.textContent("#badge-leads")) === "2", "badge");
    const row = await A.$eval("select[data-lead='" + carla.id + "']", (s) => s.closest(".lead").querySelector(".editado").textContent);
    expect(/Último cambio: mauro · /.test(row), row);
  });

  await t.check("a lead deleted on phone A disappears on phone B", async () => {
    await A.click(".lead button[data-editar-lead='L200']");
    await A.click("#btn-eliminar-lead");
    await settle(A);
    await sync(B);
    expect(!(await local(B, "te_leads")).some((l) => l.id === "L200"), "still on B");
  });

  await t.check("a visit saved without signal stays on phone B and reaches A once back online", async () => {
    await B.click("#tab-agenda");
    await B.ctx.setOffline(true);
    await B.click("#btn-nueva-visita");
    await B.fill("#v-nombre", "Visita sin señal");
    await B.fill("#v-hora", "11:30");
    await B.click("#btn-guardar-visita");
    await settle(B);
    expect((await local(B, "te_visitas")).length === 1, "not saved offline");
    await B.ctx.setOffline(false);
    await B.evaluate(() => window.dispatchEvent(new Event("online")));
    await B.waitForTimeout(1500);
    await sync(A);
    expect((await local(A, "te_visitas")).some((v) => v.nombre === "Visita sin señal"), "not on A");
  });

  await t.check("accounting entries made on both phones at once end up on both, totals included", async () => {
    for (const [p, desc, monto] of [[A, "Alquiler A", "100000"], [B, "Materiales B", "5000"]]) {
      await p.click("#tab-conta");
      await p.click("#btn-nuevo-mov");
      await p.fill("#m-monto", monto);
      await p.fill("#m-desc", desc);
      await p.click("#btn-guardar-mov");
    }
    await Promise.all([sync(A), sync(B)]);
    await Promise.all([sync(A), sync(B)]);
    const ma = (await local(A, "te_movs")).map((m) => m.descripcion).sort();
    const mb = (await local(B, "te_movs")).map((m) => m.descripcion).sort();
    expect(JSON.stringify(ma) === '["Alquiler A","Materiales B"]' && JSON.stringify(mb) === JSON.stringify(ma), "A " + ma + " / B " + mb);
    expect(((await B.textContent("#conta-metricas")) || "").includes("105.000"), await B.textContent("#conta-metricas"));
  });

  await t.check("a worker, a new job category and the job from phone A reach phone B", async () => {
    await A.click("#tab-trabajos");
    await A.click("#btn-trabajadores");
    await A.fill("#t-nuevo-nombre", "Rosa Pérez");
    await A.click("#btn-agregar-trabajador");
    await A.click("#btn-nuevo-trabajo");
    await A.selectOption("#tr-categoria", "__nueva__");
    await A.waitForTimeout(200);
    await A.fill("#tr-descripcion", "Revoque del patio");
    await A.click("#btn-guardar-trabajo");
    await settle(A);
    await B.click("#tab-trabajos");
    await sync(B);
    expect((await local(B, "te_trabajadores")).some((x) => x.nombre === "Rosa Pérez"), "worker");
    expect(((await B.textContent("#leyenda-categorias")) || "").includes("Albañilería"), "category");
    expect((await local(B, "te_trabajos")).some((x) => x.descripcion === "Revoque del patio"), "job");
  });

  await t.check("after reloading phone B nothing is left unsent", async () => {
    await B.reload();
    await B.waitForSelector(".te-barra .te-punto--ok");
    await B.waitForTimeout(1500);
    const pend = await B.evaluate(() => ["leads", "visitas", "trabajos", "trabajadores", "categorias", "movs"].map((n) => {
      const key = { leads: "te_leads", visitas: "te_visitas", trabajos: "te_trabajos", trabajadores: "te_trabajadores", categorias: "te_categorias", movs: "te_movs" }[n];
      const list = JSON.parse(localStorage.getItem(key) || "null");
      const base = JSON.parse(localStorage.getItem("te_sync_" + n) || "{}");
      return list ? TE_DATOS.pendientes(list, base, n === "categorias" ? "clave" : "id").length : 0;
    }));
    expect(pend.every((n) => n === 0), JSON.stringify(pend));
  });

  await t.check("without logging in, leads are saved on the phone and nothing is sent", async () => {
    const C = await phone(browser, site, { name: "C", login: null });
    const before = site.calls.length;
    await C.click("#tab-leads");
    await C.click("#btn-nuevo-lead");
    await C.fill("#l-nombre", "Solo local");
    await C.click("#btn-guardar-lead");
    await C.waitForTimeout(2200);
    expect((await local(C, "te_leads")).some((l) => l.nombre === "Solo local"), "not saved");
    const sent = site.calls.slice(before).filter((c) => c.startsWith("datos:"));
    expect(!sent.length, sent.join(" "));
    await C.ctx.close();
  });

  await t.check("no JavaScript errors, and the server never answered with an error", async () => {
    const errors = A.errors.concat(B.errors);
    expect(!errors.length, errors.join(" | "));
    const bad = site.calls.filter((c) => c.startsWith("datos:") && !/:200$/.test(c));
    expect(!bad.length, bad.join(" "));
  });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
