/* Safe publishing from two phones: real panel, real publish function, fake GitHub.
   Run: node tests/e2e/publish-two-devices.js */

"use strict";

const { launch, startSite, phone, checker, FIXTURE } = require("./lib");

const t = checker("Publishing from two devices");
const expect = t.expect;

async function editPrice(page, code, price) {
  await page.click('button[data-accion="editar"][data-codigo="' + code + '"]');
  await page.fill("#f-precio", String(price));
  await page.click("#btn-guardar");
  await page.waitForSelector("#form", { state: "hidden" });
}

async function newProperty(page, title) {
  await page.click("#btn-nueva");
  await page.fill("#f-barrio", "Centro");
  await page.fill("#f-titulo", title);
  await page.fill("#f-precio", "99000");
  await page.fill("#f-ambientes", "2");
  await page.fill("#f-m2c", "50");
  await page.fill("#f-descripcion", "Descripcion de prueba con mas de veinte caracteres.");
  const code = await page.inputValue("#f-codigo");
  await page.click("#btn-guardar");
  await page.waitForSelector("#form", { state: "hidden" });
  return code;
}

async function capaTitle(page, pattern) {
  await page.waitForFunction((re) => {
    const h = document.querySelector(".te-capa h2");
    return h && new RegExp(re).test(h.textContent);
  }, pattern.source);
  return page.textContent(".te-capa h2");
}

async function publish(page) {
  await page.click('[data-te="publicar"]');
  return capaTitle(page, /Publicado|Hay cambios para revisar|No se pudo publicar/);
}

async function closeCapa(page) {
  await page.click(".te-capa .te-btn");
  await page.waitForSelector(".te-capa", { state: "detached" });
}

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const remote = (code) => site.published().find((p) => p.codigo === code);
  const local = (page, code) => page.evaluate((c) => TE_ADMIN.obtenerProps().find((p) => p.codigo === c), code);

  const A = await phone(browser, site, { name: "A" });
  const B = await phone(browser, site, { name: "B" });

  await t.check("both devices load the list from GitHub", async function () {
    expect((await A.evaluate(() => TE_ADMIN.obtenerProps().length)) === FIXTURE.length, "A list size");
    expect((await B.evaluate(() => TE_ADMIN.obtenerProps().length)) === FIXTURE.length, "B list size");
  });

  await t.check("A changes a price and publishes", async function () {
    await editPrice(A, "QLM-001", 150001);
    expect((await publish(A)) === "Publicado", "A publish");
    await closeCapa(A);
    expect(remote("QLM-001").precio === 150001, "price on GitHub");
  });

  await t.check("THE BUG: B (old copy) changes another property and publishes; A's change survives", async function () {
    await B.selectOption('select[data-accion="estado"][data-codigo="BER-001"]', "reservada");
    const bar = await B.textContent(".te-barra__texto");
    expect(/1 cambio sin publicar/.test(bar), "unpublished counter, got: " + bar);
    expect((await publish(B)) === "Publicado", "B publish");
    await closeCapa(B);
    expect(remote("QLM-001").precio === 150001, "A's price was overwritten!");
    expect(remote("BER-001").estado === "reservada", "B's status missing");
  });

  await t.check("same field on both devices: conflict screen, 'mine' wins when chosen", async function () {
    await editPrice(A, "QLM-002", 1111);
    expect((await publish(A)) === "Publicado", "A publish");
    await closeCapa(A);
    expect(remote("BER-001").estado === "reservada", "A wiped B's status");

    await editPrice(B, "QLM-002", 2222);
    expect((await publish(B)) === "Hay cambios para revisar", "expected conflict screen");
    const shown = await B.textContent(".te-conflicto");
    expect(/1\.111/.test(shown) && /2\.222/.test(shown), "both values shown, got: " + shown);
    await B.check('.te-conflicto input[value="local"]');
    await B.click('[data-te="aplicar"]');
    expect((await capaTitle(B, /Publicado|No se pudo publicar/)) === "Publicado", "B publish after choosing");
    await closeCapa(B);
    expect(remote("QLM-002").precio === 2222, "mine should win");
    expect(remote("QLM-001").precio === 150001 && remote("BER-001").estado === "reservada", "other changes lost");
  });

  await t.check("'Decidir despues' publishes nothing", async function () {
    await editPrice(A, "QLM-002", 3333);
    const headBefore = site.head();
    expect((await publish(A)) === "Hay cambios para revisar", "expected conflict screen");
    await A.click('[data-te="despues"]');
    expect((await capaTitle(A, /No se pudo publicar/)) === "No se pudo publicar", "should not publish");
    await closeCapa(A);
    expect(site.head() === headBefore && remote("QLM-002").precio === 2222, "something was published");
    // Resolve it now in favour of the site so A is clean again
    await A.click('[data-te="publicar"]');
    await capaTitle(A, /Hay cambios para revisar/);
    await A.click('[data-te="aplicar"]');
    await capaTitle(A, /Publicado/);
    await closeCapa(A);
    expect(remote("QLM-002").precio === 2222, "site value should stay");
  });

  await t.check("'Traer lo ultimo del sitio' updates a device with no local changes", async function () {
    await editPrice(B, "LAN-001", 133333);
    expect((await publish(B)) === "Publicado", "B publish");
    await closeCapa(B);
    await A.click("#btn-traer");
    await A.waitForFunction(() => TE_ADMIN.obtenerProps().find((p) => p.codigo === "LAN-001").precio === 133333);
  });

  await t.check("the same new code created on two devices: the second becomes the next code", async function () {
    const codeA = await newProperty(A, "Nueva desde A");
    const codeB = await newProperty(B, "Nueva desde B");
    expect(codeA === codeB, "both should suggest the same code, got " + codeA + " / " + codeB);
    expect((await publish(A)) === "Publicado", "A publish");
    await closeCapa(A);
    expect((await publish(B)) === "Publicado", "B publish");
    await closeCapa(B);
    const all = site.published();
    const fromA = all.find((p) => p.titulo === "Nueva desde A");
    const fromB = all.find((p) => p.titulo === "Nueva desde B");
    expect(fromA && fromA.codigo === codeA, "A keeps " + codeA);
    expect(fromB && fromB.codigo !== codeA && /^QLM-\d{3}$/.test(fromB.codigo), "B renamed, got " + (fromB && fromB.codigo));
  });

  await t.check("reopening the panel on an old draft brings in the other device's changes", async function () {
    await editPrice(A, "LOM-001", 777777);
    expect((await publish(A)) === "Publicado", "A publish");
    await closeCapa(A);
    await B.reload();
    await B.waitForFunction(() => /Conectado/.test(document.querySelector(".te-barra__texto").textContent));
    await B.waitForFunction(() => TE_ADMIN.obtenerProps().find((p) => p.codigo === "LOM-001").precio === 777777);
  });

  await t.check("a brand-new device starts from GitHub's list", async function () {
    const C = await phone(browser, site, { name: "C" });
    const list = await C.evaluate(() => TE_ADMIN.obtenerProps());
    expect(JSON.stringify(list) === JSON.stringify(site.published()), "C differs from GitHub");
    await C.ctx.close();
  });

  await t.check("publishing is blocked while a property form is open", async function () {
    await A.click('button[data-accion="editar"][data-codigo="QLM-001"]');
    await A.click('[data-te="publicar"]');
    await capaTitle(A, /No se pudo publicar/);
    const msg = await A.textContent(".te-capa .te-error");
    expect(/editando/.test(msg), "message: " + msg);
    await closeCapa(A);
    await A.click("#btn-cancelar");
  });

  await t.check("a code change on one device and a price change on another both survive", async function () {
    await A.click('button[data-accion="editar"][data-codigo="AVE-001"]');
    await A.fill("#f-codigo", "AVE-005");
    await A.click("#btn-guardar");
    await A.waitForSelector("#form", { state: "hidden" });
    expect((await publish(A)) === "Publicado", "A publish");
    await closeCapa(A);
    await editPrice(B, "AVE-001", 55555);
    expect((await publish(B)) === "Publicado", "B publish");
    await closeCapa(B);
    const p = remote("AVE-005");
    expect(!remote("AVE-001"), "AVE-001 should be gone");
    expect(p && p.precio === 55555, "B's price lost: " + JSON.stringify(p && p.precio));
    expect(p && JSON.stringify(p.codigosAnteriores) === '["AVE-001"]', "old code: " + JSON.stringify(p && p.codigosAnteriores));
    expect(JSON.stringify(await local(B, "AVE-005")) === JSON.stringify(p), "B shows the merged property");
    await B.click("#btn-nueva");
    await B.selectOption("#f-zona", "Avellaneda");
    const suggested = await B.inputValue("#f-codigo");
    await B.click("#btn-cancelar");
    expect(suggested === "AVE-006", "suggested " + suggested);
  });

  await t.check("the properties tab says who published last", async function () {
    expect(/^Última publicación: dueno · hoy \d\d:\d\d$/.test(await B.textContent("#ultima-publicacion")), await B.textContent("#ultima-publicacion"));
  });

  await t.check("no JavaScript errors on any device", async function () {
    const errors = A.errors.concat(B.errors);
    expect(!errors.length, errors.join(" | "));
  });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
