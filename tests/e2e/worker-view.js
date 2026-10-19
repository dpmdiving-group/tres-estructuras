/* A worker's own page: a personal link from the panel shows only their
   jobs, with where to go, and lets them mark each one done or not done
   with a note; the panel sees it. Run: node tests/e2e/worker-view.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Worker's own page");
const expect = t.expect;
// The server counts days in Argentina (UTC-3)
const dia = (n) => { const d = new Date(Date.now() - 3 * 3600e3); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "panel", email: "gerardo@example.com",
    seed: { te_referencias: [{ codigo: "QLM-002", texto: "Mitre 1234, 2° B" }] } });
  const sync = (p) => p.evaluate(() => TE_DATOS.sincronizar());

  async function nuevoTrabajo(fecha, quien, desc, codigo) {
    await A.click("#btn-nuevo-trabajo");
    await A.fill("#tr-fecha", fecha);
    await A.selectOption("#tr-trabajador", { label: quien });
    if (codigo) await A.selectOption("#tr-codigo", codigo);
    await A.fill("#tr-descripcion", desc);
    await A.click("#btn-guardar-trabajo");
  }

  let link;
  await t.check("the panel creates a personal link for a worker, shown once, with a WhatsApp button", async () => {
    await A.click("#tab-trabajos");
    await A.click("#btn-trabajadores");
    for (const [n, tel] of [["Pancho", "11 2345-6789"], ["Rosa", "11 5555-0000"]]) {
      await A.fill("#t-nuevo-nombre", n);
      await A.fill("#t-nuevo-tel", tel);
      await A.click("#btn-agregar-trabajador");
    }
    await nuevoTrabajo(dia(0), "Pancho", "Arreglar la canilla de la cocina", "QLM-002");
    await nuevoTrabajo(dia(-2), "Pancho", "Pintar la reja", null);
    await nuevoTrabajo(dia(1), "Rosa", "Trabajo de Rosa", null);
    await A.click("#lista-trabajadores .trabajador-fila:has-text('Pancho') button[data-link-trabajador]");
    await A.waitForSelector(".link-trabajador code");
    link = await A.textContent(".link-trabajador code");
    expect(/\/trabajador\/#t=[A-Za-z0-9_-]{30,}$/.test(link), link);
    const wa = await A.getAttribute(".link-trabajador a.lead__wa", "href");
    expect(wa.startsWith("https://wa.me/5491123456789?text=") && decodeURIComponent(wa).includes(link.split("#")[1]), wa);
    // A sync repaints the list a moment later: the link must stay on screen
    await A.waitForTimeout(1800);
    await sync(A);
    expect(await A.isVisible(".link-trabajador code"), "the link vanished after a sync");
    const w = await A.evaluate(() => JSON.parse(localStorage.getItem("te_trabajadores")).find((x) => x.nombre === "Pancho"));
    expect(/^[0-9a-f]{64}$/.test(w.tokenHash) && !JSON.stringify(w).includes(link.split("#t=")[1]), "the secret itself was stored");
  });

  let W;
  await t.check("the worker's page shows only their jobs: overdue first, today, with where to go", async () => {
    W = await phone(browser, site, { name: "Pancho", path: null });
    await W.goto(link.replace("https://tresestructuras.com", site.base));
    await W.waitForFunction(() => /Hola, Pancho/.test(document.getElementById("tr-hola").textContent));
    expect(!/#t=/.test(W.url()), "the secret stayed in the address bar");
    const texto = (await W.textContent("#tr-lista")).replace(/\s+/g, " ");
    expect(/Atrasados.*Pintar la reja.*Hoy.*Arreglar la canilla de la cocina/.test(texto), texto);
    expect(/📍 Mitre 1234, 2° B/.test(texto) && /QLM-002 · /.test(texto), "where to go: " + texto);
    expect(!/Rosa/.test(texto), "another worker's job shows");
    const mapa = await W.getAttribute(".tr__card:has-text('canilla') a.tr__btn", "href");
    expect(mapa.startsWith("https://www.google.com/maps/search/?api=1&query=") && decodeURIComponent(mapa).includes("Mitre 1234"), mapa);
  });

  await t.check("marking done with a note; 'no se pudo' needs a reason", async () => {
    await W.click(".tr__card:has-text('canilla') [data-marcar='hecho']");
    await W.fill("#tr-nota", "Cambié el cuerito, ya no gotea");
    await W.click("[data-guardar]");
    await W.waitForFunction(() => /Guardado/.test(document.getElementById("tr-estado").textContent));
    expect(/✔ Resuelto/.test(await W.textContent(".tr__card:has-text('canilla')")), "not shown as done");
    await W.click(".tr__card:has-text('reja') [data-marcar='no_se_pudo']");
    await W.click("[data-guardar]");
    expect(/Contá por qué/.test(await W.textContent("#tr-estado")), "no reason asked");
    await W.fill("#tr-nota", "No había nadie para abrir");
    await W.click("[data-guardar]");
    await W.waitForFunction(() => /No se pudo hacer/.test(document.getElementById("tr-lista").textContent));
  });

  await t.check("the panel sees the status, the worker's note and who marked it", async () => {
    await sync(A);
    const trabajos = await A.evaluate(() => JSON.parse(localStorage.getItem("te_trabajos")));
    const c = trabajos.find((x) => /canilla/.test(x.descripcion));
    const r = trabajos.find((x) => /reja/.test(x.descripcion));
    expect(c.estado === "hecho" && c.notaTrabajador === "Cambié el cuerito, ya no gotea" && c._por === "Pancho (trabajador)", JSON.stringify(c));
    expect(r.estado === "no_se_pudo" && r.notaTrabajador === "No había nadie para abrir", JSON.stringify(r));
    // The day panel lists what the worker wrote (the job's date may be in the local "tomorrow")
    const fecha = c.fecha;
    await A.evaluate(() => window.scrollTo(0, 0));
    await A.click("#calendario-trabajos button[data-iso='" + fecha + "']");
    await A.waitForFunction(() => /Pancho: Cambié el cuerito/.test(document.getElementById("panel-dia-t-lista").textContent), null, { timeout: 5000 });
  });

  await t.check("opening and saving a job the worker marked keeps its status and note", async () => {
    const r = (await A.evaluate(() => JSON.parse(localStorage.getItem("te_trabajos")))).find((x) => /reja/.test(x.descripcion));
    await A.evaluate(() => window.scrollTo(0, 0));
    await A.click("#calendario-trabajos button[data-iso='" + r.fecha + "']");
    await A.click("#panel-dia-t-lista button[data-editar-trabajo='" + r.id + "']");
    expect((await A.inputValue("#tr-estado")) === "no_se_pudo", "form status: " + await A.inputValue("#tr-estado"));
    expect(/No había nadie para abrir/.test(await A.textContent("#tr-nota-trabajador")), "note not shown in the form");
    await A.click("#btn-guardar-trabajo");
    const despues = (await A.evaluate(() => JSON.parse(localStorage.getItem("te_trabajos")))).find((x) => x.id === r.id);
    expect(despues.estado === "no_se_pudo" && despues.notaTrabajador === "No había nadie para abrir", JSON.stringify(despues));
  });

  await t.check("without signal a mark waits and is sent when it comes back", async () => {
    await W.click(".tr__card:has-text('canilla') [data-deshacer]");
    await W.waitForFunction(() => /Volvió a pendiente/.test(document.getElementById("tr-estado").textContent));
    await W.ctx.setOffline(true);
    await W.click(".tr__card:has-text('canilla') [data-marcar='hecho']");
    await W.click("[data-guardar]");
    await W.waitForFunction(() => /Se envía cuando haya señal/.test(document.getElementById("tr-lista").textContent));
    await W.ctx.setOffline(false);
    await W.evaluate(() => window.dispatchEvent(new Event("online")));
    await W.waitForFunction(() => JSON.parse(localStorage.getItem("te_trabajador_cola") || "[]").length === 0, null, { timeout: 10000 });
    await sync(A);
    const c = (await A.evaluate(() => JSON.parse(localStorage.getItem("te_trabajos")))).find((x) => /canilla/.test(x.descripcion));
    expect(c.estado === "hecho", c.estado);
  });

  await t.check("a new link replaces the old one", async () => {
    await A.click("#tab-trabajos");
    if (await A.isHidden("#caja-trabajadores")) await A.click("#btn-trabajadores");
    await A.click("#lista-trabajadores .trabajador-fila:has-text('Pancho') button[data-link-trabajador]");
    await A.waitForFunction((viejo) => { const c = document.querySelector(".link-trabajador code"); return c && c.textContent !== viejo; }, link);
    await A.waitForTimeout(1800);
    await sync(A);
    await W.reload();
    await W.waitForFunction(() => /Este link ya no sirve/.test(document.getElementById("tr-estado").textContent));
    expect(!(await W.textContent("#tr-lista")).trim(), "jobs still shown with an old link");
  });

  await t.check("no JavaScript errors", async () => {
    const errors = A.errors.concat(W ? W.errors : []);
    expect(!errors.length, errors.join(" | "));
  });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
