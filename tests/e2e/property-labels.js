/* Picking a property in the other tabs: clear labels, and an internal
   reference that is shared between phones but never published.
   Run: node tests/e2e/property-labels.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Property labels and internal reference");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A", email: "gerardo@example.com" });
  const opciones = (page, sel) => page.$$eval(sel + " option", (els) => els.map((e) => e.textContent));

  await t.check("without a reference, a job's property list shows neighbourhood, operation and price, sorted by code", async () => {
    await A.click("#tab-trabajos");
    await A.click("#btn-nuevo-trabajo");
    const o = await opciones(A, "#tr-codigo");
    expect(o[0] === "— Sin propiedad —", o[0]);
    const codes = o.slice(1).map((x) => x.split(" · ")[0]);
    expect(JSON.stringify(codes) === JSON.stringify(codes.slice().sort()), "not sorted: " + codes.join(","));
    const qlm2 = o.find((x) => x.startsWith("QLM-002"));
    expect(/^QLM-002 · .+ · Alquiler \$ 520\.000 · /.test(qlm2), qlm2);
    await A.click("#btn-cancelar-trabajo");
  });

  await t.check("the internal reference is saved from the property form and shown in the list", async () => {
    await A.click("#tab-props");
    await A.click("#lista button[data-accion='editar'][data-codigo='QLM-002']");
    await A.fill("#f-referencia", "Mitre 1234, 2° B");
    await A.click("#btn-guardar");
    await A.waitForSelector("#form", { state: "hidden" });
    expect(/Ref\.: Mitre 1234, 2° B/.test(await A.textContent("#lista")), "list");
  });

  await t.check("every property list in the panel leads with the reference", async () => {
    const lists = [["#tab-trabajos", "#btn-nuevo-trabajo", "#tr-codigo", "#btn-cancelar-trabajo"],
      ["#tab-agenda", "#btn-nueva-visita", "#v-codigo", "#btn-cancelar-visita"],
      ["#tab-leads", "#btn-nuevo-lead", "#l-codigo", "#btn-cancelar-lead"],
      ["#tab-conta", "#btn-nuevo-mov", "#m-codigo", "#btn-cancelar-mov"],
      ["#tab-cobros", "#btn-nuevo-contrato", "#c-codigo", "#btn-cancelar-contrato"]];
    for (const [tab, abrir, sel, cerrar] of lists) {
      await A.click(tab);
      await A.click(abrir);
      const o = (await opciones(A, sel)).find((x) => x.startsWith("QLM-002"));
      expect(o === "QLM-002 · Mitre 1234, 2° B · Alquiler $ 520.000", sel + ": " + o);
      if (sel === "#c-codigo") {
        await A.selectOption("#c-codigo", "QLM-002");
        expect((await A.inputValue("#c-referencia")) === "Mitre 1234, 2° B", "contract message name: " + await A.inputValue("#c-referencia"));
      }
      await A.click(cerrar);
    }
    await A.click("#tab-props");
  });

  await t.check("the reference is never published", async () => {
    await A.click('[data-te="publicar"]');
    await A.waitForFunction(() => /Publicado/.test((document.querySelector(".te-capa h2") || {}).textContent || ""));
    await A.click(".te-capa .te-btn");
    const json = JSON.stringify(site.published());
    expect(!/Mitre 1234/.test(json), "the reference reached the public data!");
  });

  await t.check("it follows a code change", async () => {
    await A.click("#lista button[data-accion='editar'][data-codigo='QLM-002']");
    await A.fill("#f-codigo", "QLM-009");
    await A.click("#btn-guardar");
    await A.waitForSelector("#form", { state: "hidden" });
    const refs = await A.evaluate(() => JSON.parse(localStorage.getItem("te_referencias") || "[]"));
    expect(refs.length === 1 && refs[0].codigo === "QLM-009" && refs[0].texto === "Mitre 1234, 2° B", JSON.stringify(refs));
    // Other phones see the new code once it is published
    await A.click('[data-te="publicar"]');
    await A.waitForFunction(() => /Publicado/.test((document.querySelector(".te-capa h2") || {}).textContent || ""));
    await A.click(".te-capa .te-btn");
  });

  await t.check("another phone sees it", async () => {
    await A.waitForTimeout(1800);
    await A.evaluate(() => TE_DATOS.sincronizar());
    const B = await phone(browser, site, { name: "B", email: "mauro@example.com" });
    await B.evaluate(() => TE_DATOS.sincronizar());
    await B.waitForFunction(() => /Ref\.: Mitre 1234/.test(document.getElementById("lista").textContent));
    expect(!B.errors.length, B.errors.join(" | "));
    await B.ctx.close();
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
