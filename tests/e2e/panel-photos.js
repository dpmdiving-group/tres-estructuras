/* Photos in the panel: a cover on every listing, and a full-screen viewer
   from the list and from the form. Run: node tests/e2e/panel-photos.js */

"use strict";

const { launch, startSite, phone, checker, FIXTURE } = require("./lib");

const t = checker("Photos in the panel");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A" });
  const counter = () => A.textContent("#visor-contador");
  const loaded = (sel) => A.$eval(sel, (img) => img.complete && img.naturalWidth > 0);

  await t.check("every listing shows its cover photo and how many photos it has", async () => {
    const covers = await A.$$eval("#lista .item__foto img", (imgs) => imgs.length);
    expect(covers === FIXTURE.length, covers + " covers");
    await A.waitForFunction(() => { const i = document.querySelector("#lista .item__foto img"); return i.complete && i.naturalWidth > 0; });
    expect(/^5 fotos$/.test(await A.textContent("#lista .item__fotos-n")), await A.textContent("#lista .item__fotos-n"));
  });

  await t.check("tapping a cover opens the photos full screen, starting at the cover", async () => {
    await A.click("#lista button[data-ver-fotos='QLM-001']");
    expect(await A.isVisible("#visor"), "viewer closed");
    expect((await counter()) === "1 / 5", await counter());
    await A.waitForFunction(() => { const i = document.getElementById("visor-img"); return i.complete && i.naturalWidth > 0; });
    const box = await A.$eval("#visor-img", (i) => i.getBoundingClientRect().width);
    expect(box > 300, "image width " + box);
    expect((await A.getAttribute("#visor-original", "href")).endsWith("/media/QLM-001/01.webp"), await A.getAttribute("#visor-original", "href"));
  });

  await t.check("arrows, keyboard and swipe move between photos; it wraps around", async () => {
    await A.click("#visor-sig");
    expect((await counter()) === "2 / 5", await counter());
    await A.click("#visor-ant");
    await A.click("#visor-ant");
    expect((await counter()) === "5 / 5", "wrap: " + await counter());
    await A.keyboard.press("ArrowRight");
    expect((await counter()) === "1 / 5", "key: " + await counter());
    // One-finger swipe to the left = next photo
    await A.evaluate(() => {
      const v = document.getElementById("visor");
      const touch = (x) => new Touch({ identifier: 1, target: v, clientX: x, clientY: 400 });
      v.dispatchEvent(new TouchEvent("touchstart", { touches: [touch(300)], changedTouches: [touch(300)], bubbles: true }));
      v.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [touch(120)], bubbles: true }));
    });
    expect((await counter()) === "2 / 5", "swipe: " + await counter());
  });

  await t.check("Escape and a tap on the background close it, and the page scrolls again", async () => {
    await A.keyboard.press("Escape");
    expect(await A.isHidden("#visor"), "still open");
    expect((await A.evaluate(() => document.body.style.overflow)) === "", "page still locked");
    await A.click("#lista button[data-ver-fotos='QLM-002']");
    expect((await counter()) === "1 / 2", await counter());
    await A.mouse.click(10, 300);
    expect(await A.isHidden("#visor"), "background tap didn't close");
  });

  await t.check("in the form, tapping a photo opens that one big", async () => {
    await A.click("#lista button[data-accion='editar'][data-codigo='BER-001']");
    await A.waitForFunction(() => document.querySelectorAll("#fotos .foto img").length === 3);
    await A.click("#fotos .foto:nth-child(2) img");
    expect((await counter()) === "2 / 3", await counter());
    expect(await loaded("#visor-img") || await A.waitForFunction(() => document.getElementById("visor-img").naturalWidth > 0).then(() => true), "not loaded");
    await A.click("#visor-cerrar");
    // The move and delete buttons still do their job, without opening the viewer
    await A.click("#fotos .foto:nth-child(2) button[data-mover='-1']");
    expect(await A.isHidden("#visor"), "viewer opened from a button");
    expect((await A.$$eval("#fotos .foto", (els) => els.length)) === 3, "photo lost");
    await A.click("#btn-cancelar");
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
