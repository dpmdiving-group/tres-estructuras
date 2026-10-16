/* "Agendá tu visita" and "Compartir" on the property page.
   Run: node tests/e2e/visit-share.js */

"use strict";

const path = require("path");
const { launch, startSite, phone, checker, ROOT, FIXTURE } = require("./lib");

const t = checker("Property page: visit and share");
const expect = t.expect;
const AXE = (() => { try { return require.resolve("axe-core/axe.min.js", { paths: [ROOT] }); } catch (e) { return null; } })();

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const disp = FIXTURE.find((p) => p.estado === "disponible");

  // A visitor with the clock fixed (local time), so "today" and past slots are predictable
  async function visitor(when, props) {
    const v = await phone(browser, site, { name: "visitor " + when, path: null, context: { permissions: ["clipboard-read", "clipboard-write"] } });
    await v.ctx.addInitScript((at) => {
      const Real = Date;
      const fixed = new Real(at).getTime();
      class Fake extends Real { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }
      window.Date = Fake;
    }, when);
    if (props) await v.ctx.route("**/data/propiedades.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(props) }));
    return v;
  }
  const message = async (v) => decodeURIComponent(((await v.getAttribute("#agendar-ir", "href")) || "").split("text=")[1] || "");

  // Thursday 2026-10-15, 13:40, from a sign's QR
  const v = await visitor("2026-10-15T13:40:00");
  await v.goto(site.base + "/propiedad.html?c=" + disp.codigo + "&f=cartel");
  await v.waitForSelector("#acciones-ficha:not([hidden])");

  await t.check("both buttons show, outlined, not WhatsApp green", async () => {
    expect(await v.isVisible("#btn-agendar") && await v.isVisible("#btn-compartir"), "missing");
    const colors = await v.$eval("#btn-agendar", (e) => getComputedStyle(e).backgroundColor + " " + getComputedStyle(e).borderColor);
    expect(!/37, 211, 102/.test(colors), colors);
  });

  await t.check("the next six days are offered, without Sunday", async () => {
    await v.click("#btn-agendar");
    expect(await v.isVisible("#agendar") && (await v.getAttribute("#btn-agendar", "aria-expanded")) === "true", "panel closed");
    const days = await v.$$eval("#agendar-dias .chip", (els) => els.map((e) => e.textContent));
    expect(days.join(",") === "Hoy,Mañana,Sáb 17/10,Lun 19/10,Mar 20/10,Mié 21/10", days.join(","));
  });

  await t.check("without a day and a slot it says what is missing and goes nowhere", async () => {
    await v.click("#agendar-ir", { force: true });
    expect(/Elegí un día y un horario/.test(await v.textContent("#agendar-nota")), await v.textContent("#agendar-nota"));
  });

  await t.check("today's slots that are over can't be picked", async () => {
    await v.click("#agendar-dias .chip >> nth=0");
    const off = await v.$$eval("#agendar-franjas .chip", (els) => els.map((e) => e.disabled));
    expect(JSON.stringify(off) === "[true,false,false]", JSON.stringify(off));
  });

  await t.check("the WhatsApp message has the property, the day, the slot and the source", async () => {
    await v.click("#agendar-franjas .chip >> nth=2");
    expect((await v.getAttribute("#agendar-ir", "href")).startsWith("https://wa.me/"), "not wa.me");
    const m = await message(v);
    expect(m === "Hola Tres Estructuras, quiero visitar la propiedad " + disp.codigo + " (" + disp.titulo + "). " +
      "¿Puede ser hoy, jueves 15/10, de 15 a 18 h? Escaneé el QR del cartel.", m);
    await v.click("#agendar-dias .chip >> nth=3");
    expect(/¿Puede ser el lunes 19\/10, de 15 a 18 h\?/.test(await message(v)), await message(v));
  });

  await t.check("without the native share sheet, Compartir copies the short link", async () => {
    await v.click("#btn-compartir");
    await v.waitForFunction(() => document.getElementById("aviso-compartir").textContent);
    expect(/Link copiado/.test(await v.textContent("#aviso-compartir")), await v.textContent("#aviso-compartir"));
    expect((await v.evaluate(() => navigator.clipboard.readText())) === "https://tresestructuras.com/p/" + disp.codigo, "clipboard");
  });

  await t.check("with the native share sheet, it gets the link and the title", async () => {
    await v.evaluate(() => { navigator.share = (d) => { window.__shared = d; return Promise.resolve(); }; });
    await v.click("#btn-compartir");
    const shared = await v.evaluate(() => window.__shared);
    expect(shared && shared.url === "https://tresestructuras.com/p/" + disp.codigo && shared.text.includes(disp.codigo), JSON.stringify(shared));
  });

  if (AXE) {
    await t.check("no WCAG A/AA violations (axe) with the visit panel open", async () => {
      await v.addScriptTag({ path: AXE });
      const found = await v.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })
        .then((r) => r.violations.map((x) => x.id + ":" + x.nodes.length)));
      expect(!found.length, found.join(", "));
    });
  }

  await t.check("after the last slot of the day, it starts tomorrow; a web visitor gets the web phrase", async () => {
    const late = await visitor("2026-10-15T17:30:00");
    await late.goto(site.base + "/propiedad.html?c=" + disp.codigo);
    await late.waitForSelector("#acciones-ficha:not([hidden])");
    await late.click("#btn-agendar");
    expect((await late.textContent("#agendar-dias .chip >> nth=0")) === "Mañana", "first day");
    await late.click("#agendar-dias .chip >> nth=0");
    await late.click("#agendar-franjas .chip >> nth=0");
    expect(/mañana, viernes 16\/10, de 9 a 12 h\? La vi en la web\.$/.test(await message(late)), await message(late));
    await late.ctx.close();
  });

  await t.check("a reserved property keeps Compartir but offers no visit", async () => {
    const reserved = FIXTURE.map((p) => (p.codigo === disp.codigo ? Object.assign({}, p, { estado: "reservada" }) : p));
    const r = await visitor("2026-10-15T10:00:00", reserved);
    await r.goto(site.base + "/propiedad.html?c=" + disp.codigo);
    await r.waitForSelector("#acciones-ficha:not([hidden])");
    expect(!(await r.isVisible("#btn-agendar")) && await r.isVisible("#btn-compartir"), "buttons");
    await r.ctx.close();
  });

  await t.check("no JavaScript errors", async () => { expect(!v.errors.length, v.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
