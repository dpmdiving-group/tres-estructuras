/* Videos: any YouTube link works (not only the bare id), and the property
   page plays it inside the page. Run: node tests/e2e/video-links.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Video links");
const expect = t.expect;
const ID = "dQw4w9WgXcQ";

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A" });

  await t.check("every kind of YouTube link is understood, and the type is picked by itself", async () => {
    await A.click("#lista button[data-accion='editar'][data-codigo='QLM-002']");
    for (const link of [
      "https://www.youtube.com/watch?v=" + ID, "https://youtu.be/" + ID + "?si=abc123", "https://youtube.com/shorts/" + ID + "?feature=share",
      "https://m.youtube.com/watch?feature=shared&v=" + ID, "https://www.youtube.com/live/" + ID, ID
    ]) {
      await A.selectOption("#f-video-tipo", "");
      await A.fill("#f-video-valor", link);
      expect((await A.inputValue("#f-video-tipo")) === "youtube", "type for " + link);
      expect(/Video de YouTube listo/.test(await A.textContent("#f-video-estado")), "status for " + link + ": " + await A.textContent("#f-video-estado"));
    }
  });

  await t.check("a link it can't read is refused on save, with what to do", async () => {
    await A.fill("#f-video-valor", "https://vimeo.com/12345");
    expect(/No reconozco ese link/.test(await A.textContent("#f-video-estado")), await A.textContent("#f-video-estado"));
    await A.click("#btn-guardar");
    await A.waitForFunction(() => /No reconozco el link del video/.test(document.body.innerText));
    expect(await A.isVisible("#form"), "form closed with a bad link");
  });

  await t.check("only the id is saved and published", async () => {
    await A.fill("#f-video-valor", "https://youtu.be/" + ID + "?si=xyz");
    await A.click("#btn-guardar");
    await A.waitForSelector("#form", { state: "hidden" });
    await A.click('[data-te="publicar"]');
    await A.waitForFunction(() => /Publicado/.test((document.querySelector(".te-capa h2") || {}).textContent || ""));
    const v = site.published().find((p) => p.codigo === "QLM-002").video;
    expect(JSON.stringify(v) === JSON.stringify({ tipo: "youtube", id: ID }), JSON.stringify(v));
  });

  await t.check("the property page plays it inside the page; a full link saved by an old panel works too", async () => {
    const w = await phone(browser, site, { name: "visitor", path: null });
    await w.goto(site.base + "/propiedad.html?c=QLM-002");
    await w.waitForSelector("#sec-video:not([hidden]) .video-fachada");
    await w.click(".video-fachada");
    const src = await w.getAttribute(".video-marco iframe", "src");
    expect(src.startsWith("https://www.youtube-nocookie.com/embed/" + ID + "?"), src);
    const viejo = site.published().map((p) => (p.codigo === "QLM-002" ? Object.assign({}, p, { video: { tipo: "youtube", id: "https://youtu.be/" + ID } }) : p));
    await w.ctx.route("**/data/propiedades.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(viejo) }));
    await w.goto(site.base + "/propiedad.html?c=QLM-002");
    await w.waitForSelector(".video-fachada");
    expect((await w.getAttribute(".video-fachada img", "src")).includes("/vi/" + ID + "/"), await w.getAttribute(".video-fachada img", "src"));
    expect(!w.errors.length, w.errors.join(" | "));
  });

  await t.check("a phone's share link saved as MP4 shows no broken player, and the panel refuses it", async () => {
    const share = site.published().map((p) => (p.codigo === "QLM-002" ? Object.assign({}, p, { video: { tipo: "mp4", url: "https://quickshare.samsungcloud.com/r5cPhmENStPv" } }) : p));
    const w = await phone(browser, site, { name: "visitor3", path: null });
    await w.ctx.route("**/data/propiedades.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(share) }));
    await w.goto(site.base + "/propiedad.html?c=QLM-002");
    await w.waitForSelector("#encabezado:not([hidden])");
    expect(await w.isHidden("#sec-video"), "broken video section shown");
    await A.click(".te-capa .te-btn").catch(() => {});
    await A.click("#lista button[data-accion='editar'][data-codigo='QLM-002']");
    await A.selectOption("#f-video-tipo", "mp4");
    await A.fill("#f-video-valor", "https://quickshare.samsungcloud.com/r5cPhmENStPv");
    expect(/No reconozco ese link/.test(await A.textContent("#f-video-estado")), await A.textContent("#f-video-estado"));
    await A.click("#btn-guardar");
    await A.waitForFunction(() => /No reconozco el link del video/.test(document.body.innerText));
    await A.click("#btn-cancelar");
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
