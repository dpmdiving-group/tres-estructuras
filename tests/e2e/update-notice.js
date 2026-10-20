/* A panel left open after an update says there is a new version and reloads
   when asked. The deploy stamp (herramientas/generar.js) is simulated here:
   the panel page gets a te-panel version and version.json says which one is
   published. Run: node tests/e2e/update-notice.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("New panel version notice");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();

  // What Netlify serves: the panel stamped with the version of its deploy
  let publicada = "aaaaaaaaaaaa";
  let consultas = 0;
  const A = await phone(browser, site, { name: "A", login: null, path: null });
  await A.ctx.addInitScript(() => {
    // The panel checks at most once a minute: let the test move time forward
    const real = Date.now;
    window.__adelanto = 0;
    Date.now = () => real() + window.__adelanto;
  });
  await A.route(/\/admin\/(index\.html)?(\?.*)?$/, async (route) => {
    const r = await route.fetch();
    const html = (await r.text()).replace('<meta name="te-panel" content="">', '<meta name="te-panel" content="' + publicada + '">');
    await route.fulfill({ response: r, body: html });
  });
  await A.route(/\/admin\/version\.json/, (route) => {
    consultas++;
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ panel: publicada }) });
  });
  const abrir = async () => {
    await A.goto(site.base + "/admin/");
    if (await A.isVisible("[data-te='sin']")) await A.click("[data-te='sin']");
    await A.waitForSelector("#lista .item");
  };
  // Coming back to the tab, a minute or more later
  const volver = () => A.evaluate(() => { window.__adelanto += 61000; document.dispatchEvent(new Event("visibilitychange")); });
  const aviso = () => A.$(".aviso-version");

  await t.check("an up-to-date panel says nothing", async () => {
    await abrir();
    await volver();
    await A.waitForTimeout(300);
    expect(consultas >= 1, "the panel never asked which version is published");
    expect(!(await aviso()), "notice shown with the same version");
  });

  await t.check("after an update, coming back to the open tab shows the notice", async () => {
    publicada = "bbbbbbbbbbbb";
    await volver();
    await A.waitForSelector(".aviso-version");
    expect(/Hay una versión nueva del panel\./.test(await A.textContent(".aviso-version")), await A.textContent(".aviso-version"));
    // It doesn't cover the last buttons of a long page
    expect(await A.evaluate(() => document.body.classList.contains("con-aviso-version")), "no room left for the notice");
  });

  await t.check("checks are spaced: switching tabs again within the minute doesn't ask again", async () => {
    const antes = consultas;
    await A.evaluate(() => { window.__adelanto += 1000; window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
    await A.waitForTimeout(300);
    expect(consultas === antes, (consultas - antes) + " extra checks");
  });

  await t.check("with a form open, it warns before reloading", async () => {
    await A.click("#btn-nueva");
    await A.fill("#f-titulo", "Casa a medio cargar");
    await Promise.all([A.waitForNavigation(), A.click(".aviso-version button")]);
    const msg = A.dialogs[A.dialogs.length - 1] || "";
    expect(/Tenés un formulario abierto/.test(msg) && /se pierde lo que no guardaste/.test(msg), msg);
  });

  await t.check("after reloading, the panel is the new version and the notice is gone", async () => {
    if (await A.isVisible("[data-te='sin']")) await A.click("[data-te='sin']");
    await A.waitForSelector("#lista .item");
    expect((await A.getAttribute("meta[name='te-panel']", "content")) === "bbbbbbbbbbbb", "still the old panel");
    await volver();
    await A.waitForTimeout(300);
    expect(!(await aviso()), "notice still shown");
  });

  await t.check("without a form open, it reloads right away", async () => {
    publicada = "cccccccccccc";
    await volver();
    await A.waitForSelector(".aviso-version");
    const avisos = A.dialogs.length;
    await Promise.all([A.waitForNavigation(), A.click(".aviso-version button")]);
    expect(A.dialogs.length === avisos, "asked: " + A.dialogs[A.dialogs.length - 1]);
  });

  await t.check("without signal it doesn't try", async () => {
    if (await A.isVisible("[data-te='sin']")) await A.click("[data-te='sin']");
    await A.waitForSelector("#lista .item");
    await A.ctx.setOffline(true);
    const antes = consultas;
    await volver();
    await A.waitForTimeout(300);
    expect(consultas === antes, "checked while offline");
    await A.ctx.setOffline(false);
  });

  await t.check("a copy without the deploy stamp (local) never asks", async () => {
    const B = await phone(browser, site, { name: "B", login: null });
    let pedidos = 0;
    B.on("request", (r) => { if (/version\.json/.test(r.url())) pedidos++; });
    await B.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
    await B.waitForTimeout(300);
    expect(pedidos === 0 && !(await B.$(".aviso-version")), pedidos + " requests");
    expect(!B.errors.length, B.errors.join(" | "));
    await B.ctx.close();
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
