/* "Encuadrar": choosing which part of a photo shows in the site's 4:3 frame.
   Run: node tests/e2e/photo-framing.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Photo framing");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A", login: null });
  const colorDe = (sel) => A.$eval(sel, (img) => new Promise((ok) => {
    const done = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3));
      ok({ w: img.naturalWidth, h: img.naturalHeight, top: px(c.width / 2, 5), bottom: px(c.width / 2, c.height - 5) });
    };
    if (img.complete && img.naturalWidth) done(); else img.onload = done;
  }));

  // A vertical phone photo: red on top, blue at the bottom
  const png = await A.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 900; c.height = 1600;
    const g = c.getContext("2d");
    g.fillStyle = "#d00000"; g.fillRect(0, 0, 900, 800);
    g.fillStyle = "#0000d0"; g.fillRect(0, 800, 900, 800);
    return c.toDataURL("image/png").split(",")[1];
  });

  await t.check("a new vertical photo can be framed to its bottom part, and comes out 4:3", async () => {
    await A.click("#btn-nueva");
    await A.setInputFiles("#input-fotos", { name: "vertical.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await A.waitForFunction(() => document.querySelectorAll("#fotos .foto img").length === 1);
    const antes = await colorDe("#fotos .foto img");
    expect(antes.h > antes.w, "not vertical: " + antes.w + "x" + antes.h);
    await A.click("#fotos .foto button[data-encuadrar='0']");
    await A.waitForSelector("#recorte:not([hidden])");
    // Drag the photo all the way up: the frame shows its bottom (blue) part
    const m = await A.$eval("#recorte-marco", (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await A.mouse.move(m.x, m.y);
    await A.mouse.down();
    await A.mouse.move(m.x, m.y - 2000, { steps: 8 });
    await A.mouse.up();
    await A.click("#recorte-ok");
    await A.waitForFunction(() => /Foto encuadrada/.test(document.body.innerText));
    const r = await colorDe("#fotos .foto img");
    expect(Math.abs(r.w / r.h - 4 / 3) < 0.01, "not 4:3: " + r.w + "x" + r.h);
    expect(r.top[2] > 150 && r.top[0] < 80 && r.bottom[2] > 150, "kept the wrong part: " + JSON.stringify(r));
  });

  await t.check("zooming in keeps the frame filled and the chosen spot", async () => {
    await A.click("#fotos .foto button[data-encuadrar='0']");
    await A.waitForSelector("#recorte:not([hidden])");
    await A.$eval("#recorte-zoom", (e) => { e.value = "3"; e.dispatchEvent(new Event("input")); });
    const cubre = await A.evaluate(() => {
      const m = document.getElementById("recorte-marco").getBoundingClientRect();
      const i = document.getElementById("recorte-img").getBoundingClientRect();
      return i.left <= m.left + 1 && i.top <= m.top + 1 && i.right >= m.right - 1 && i.bottom >= m.bottom - 1;
    });
    expect(cubre, "the photo no longer fills the frame");
    await A.click("#recorte-cancelar");
    expect(await A.isHidden("#recorte"), "still open");
  });

  await t.check("a published photo can be framed too: it becomes a new photo that uploads", async () => {
    await A.click("#btn-cancelar");
    await A.click("#lista button[data-accion='editar'][data-codigo='QLM-001']");
    await A.waitForFunction(() => document.querySelectorAll("#fotos .foto").length === 5);
    expect((await A.textContent("#fotos .foto:nth-child(2)")).includes("EN SITIO"), "not a published photo");
    await A.click("#fotos .foto button[data-encuadrar='1']");
    await A.waitForSelector("#recorte:not([hidden])");
    await A.$eval("#recorte-zoom", (e) => { e.value = "2"; e.dispatchEvent(new Event("input")); });
    await A.click("#recorte-ok");
    await A.waitForFunction(() => /Foto encuadrada/.test(document.body.innerText));
    expect(!(await A.textContent("#fotos .foto:nth-child(2)")).includes("EN SITIO"), "still the published file");
    expect((await A.$$eval("#fotos .foto", (e) => e.length)) === 5, "photo count changed");
    await A.click("#btn-guardar");
    await A.waitForSelector("#form", { state: "hidden" });
    const fotos = await A.evaluate(() => TE_ADMIN.obtenerProps().find((p) => p.codigo === "QLM-001").fotos);
    expect(fotos.length === 5 && fotos[1] !== "/media/QLM-001/02.webp" && /^\/media\/QLM-001\/.+\.(webp|jpg)$/.test(fotos[1]), JSON.stringify(fotos));
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
