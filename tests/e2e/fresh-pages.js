/* With the real service worker: after an update, a returning visitor sees
   the new page and scripts on the first visit (cache first showed the
   previous version once more: the client's PC kept the old header). Without
   signal, or with a very slow network, the saved copy opens.
   Run: node tests/e2e/fresh-pages.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Pages update on the first visit");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  // The site registers its service worker only on https or on "localhost"
  const base = site.base.replace("127.0.0.1", "localhost");
  const V = await phone(browser, site, { name: "visitor", path: null, context: { serviceWorkers: "allow" } });

  let deploy = false;     // a new version of the home page and of a script is online
  let sinRed = false;     // routed requests are answered even offline: fail them like the network would
  let lento = 0;          // ms before the home page answers
  // Chromium routes the service worker's own requests too
  await V.ctx.route(/^http:\/\/localhost:\d+\/(index\.html)?(\?.*)?$/, async (route) => {
    if (sinRed) return route.abort("internetdisconnected");
    if (lento) await new Promise((r) => setTimeout(r, lento));
    const r = await route.fetch();
    // The headline (the same words are in the <title> too)
    const html = (await r.text()).replace('hero__titulo">Propiedades para alquilar y comprar', deploy ? 'hero__titulo">Versión nueva del sitio' : "$&");
    await route.fulfill({ response: r, body: html });
  });
  await V.ctx.route(/^http:\/\/localhost:\d+\/js\/app\.js/, async (route) => {
    if (sinRed) return route.abort("internetdisconnected");
    const r = await route.fetch();
    await route.fulfill({ response: r, body: (await r.text()) + (deploy ? "\nwindow.__appNueva = true;" : "") });
  });
  const titulo = () => V.textContent(".hero__titulo");

  await t.check("the first visit installs the service worker and saves the site", async () => {
    await V.goto(base + "/");
    await V.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 });
    await V.waitForSelector("#grilla li");
    expect(/Propiedades para alquilar y comprar/.test(await titulo()), await titulo());
  });

  await t.check("after an update, the very next visit shows the new page and the new script", async () => {
    deploy = true;
    await V.reload();
    await V.waitForSelector("#grilla li");
    expect(/Versión nueva del sitio/.test(await titulo()), "still the old page: " + await titulo());
    expect(await V.evaluate(() => window.__appNueva === true), "still the old script");
  });

  await t.check("without signal, the saved copy opens with its properties", async () => {
    sinRed = true;
    await V.ctx.setOffline(true);
    await V.reload();
    await V.waitForSelector("#grilla li");
    expect(/Versión nueva del sitio/.test(await titulo()), await titulo());
    // Another filter is the same page: it opens offline too
    await V.goto(base + "/?op=venta");
    await V.waitForSelector("#grilla li");
    sinRed = false;
    await V.ctx.setOffline(false);
  });

  await t.check("with a very slow network, the saved copy opens after a few seconds instead of waiting", async () => {
    lento = 8000;
    const inicio = Date.now();
    await V.goto(base + "/", { waitUntil: "domcontentloaded" });
    await V.waitForSelector(".hero__titulo");
    const ms = Date.now() - inicio;
    lento = 0;
    expect(ms < 6500, "took " + ms + " ms");
    expect(/Versión nueva del sitio/.test(await titulo()), await titulo());
  });

  await t.check("no JavaScript errors", async () => { expect(!V.errors.length, V.errors.join(" | ")); });

  // The slow answer may still be on its way
  await V.ctx.unrouteAll({ behavior: "ignoreErrors" });
  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
