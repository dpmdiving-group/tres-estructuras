/* Coming-soon properties ("Próximamente"): loaded in the panel without photos
   or price, they show the logo with a sign carrying the owners' own text, on
   the card and on the property page. Run: node tests/e2e/coming-soon.js */

"use strict";

const { ROOT, launch, startSite, phone, checker } = require("./lib");
const AXE = (() => { try { return require.resolve("axe-core/axe.min.js", { paths: [ROOT] }); } catch (e) { return null; } })();

const t = checker("Coming-soon properties");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "panel" });
  let codigo = "";

  await t.check("panel: 'Próximamente' shows the sign text and saves without photos or price", async () => {
    await A.click("#btn-nueva");
    expect(await A.isHidden("#f-proximo-fila"), "sign text shown for an available property");
    await A.selectOption("#f-estado", "proximamente");
    expect(await A.isVisible("#f-texto-proximo"), "no sign text field");
    codigo = await A.inputValue("#f-codigo");
    await A.fill("#f-titulo", "Dúplex a estrenar en Quilmes Oeste");
    await A.fill("#f-barrio", "Quilmes Oeste");
    await A.selectOption("#f-operacion", "alquiler");
    await A.fill("#f-ambientes", "3");
    await A.fill("#f-m2c", "70");
    await A.fill("#f-descripcion", "Dúplex nuevo, en terminaciones. Patio y cochera.");
    await A.fill("#f-texto-proximo", "En obra – marzo");
    await A.click("#btn-guardar");
    await A.waitForSelector("#form", { state: "hidden" });
    const p = await A.evaluate((c) => TE_ADMIN.obtenerProps().find((x) => x.codigo === c), codigo);
    expect(p.estado === "proximamente" && p.precio === null && p.textoProximamente === "En obra – marzo" && !p.fotos.length, JSON.stringify(p).slice(0, 200));
    const fila = (await A.$eval("#lista .item:has(button[data-codigo='" + codigo + "'])", (e) => e.innerText)).replace(/\s+/g, " ");
    expect(/Precio a confirmar/.test(fila), fila.slice(0, 200));
  });

  await t.check("panel: an available property still needs its price", async () => {
    await A.click("#btn-nueva");
    await A.fill("#f-titulo", "Prueba sin precio");
    await A.fill("#f-barrio", "Centro");
    await A.fill("#f-ambientes", "2");
    await A.fill("#f-m2c", "40");
    await A.fill("#f-descripcion", "Descripción de prueba con más de veinte letras.");
    await A.click("#btn-guardar");
    await A.waitForFunction(() => /Falta el precio\./.test((document.querySelector(".aviso-flotante") || {}).textContent || ""));
    await A.click("#btn-cancelar");
  });

  await t.check("panel: a property with photos can be set to 'próximamente' from the list", async () => {
    await A.selectOption("#lista select[data-accion='estado'][data-codigo='LOM-001']", "proximamente");
    const p = await A.evaluate(() => TE_ADMIN.obtenerProps().find((x) => x.codigo === "LOM-001"));
    expect(p.estado === "proximamente", p.estado);
  });

  await t.check("it publishes", async () => {
    await A.click('[data-te="publicar"]');
    await A.waitForFunction(() => /Publicado|No se pudo publicar/.test((document.querySelector(".te-capa h2") || {}).textContent || ""));
    expect((await A.textContent(".te-capa h2")) === "Publicado", (await A.textContent(".te-capa")).slice(0, 300));
  });

  const V = await phone(browser, site, { name: "visitor", path: null });
  const ver = (sel) => V.$eval(sel, (e) => e.innerText.replace(/\s+/g, " ").trim());
  const tarjeta = (c) => V.$eval("#grilla li:has(.ficha__codigo:text-is('" + c + "'))", (li) => ({
    foto: !!li.querySelector(".ficha__foto"), logo: !!li.querySelector(".proximo__logo"),
    cartel: (li.querySelector(".proximo__cartel") || {}).textContent || "", sobreFoto: !!li.querySelector(".proximo--sobre-foto"),
    precio: li.querySelector(".ficha__precio").innerText.replace(/\s+/g, " ").trim()
  }));

  await t.check("home: the logo with the sign and its text instead of a photo, and no price yet", async () => {
    await V.goto(site.base + "/");
    await V.waitForSelector("#grilla li");
    const c = await tarjeta(codigo);
    expect(!c.foto && c.logo && c.cartel === "En obra – marzo" && /^Precio a confirmar$/i.test(c.precio), JSON.stringify(c));
    expect(await V.$eval("#grilla li:has(.ficha__codigo:text-is('" + codigo + "')) .proximo__cartel", (e) => getComputedStyle(e).transform !== "none"), "the sign isn't tilted");
  });

  await t.check("home: with photos, the sign goes over the photo; coming soon is listed last and counted apart", async () => {
    const c = await tarjeta("LOM-001");
    expect(c.foto && c.sobreFoto && c.cartel === "Próximamente", JSON.stringify(c));
    const codigos = await V.$$eval("#grilla .ficha__codigo", (e) => e.map((x) => x.textContent));
    expect(codigos.slice(-2).sort().join() === [codigo, "LOM-001"].sort().join(), codigos.join(","));
    expect((await V.textContent("#contador")) === "6 propiedades disponibles y 2 próximamente.", await V.textContent("#contador"));
  });

  await t.check("property page: the big sign instead of the gallery, 'Próximamente', no visit button", async () => {
    await V.goto(site.base + "/propiedad.html?c=" + codigo);
    await V.waitForSelector(".galeria__cuadro--proximo .proximo__cartel");
    expect((await V.textContent(".galeria__cuadro--proximo .proximo__cartel")) === "En obra – marzo", "sign text");
    expect((await ver("#chip-estado")) === "PRÓXIMAMENTE" && (await ver("#precio")) === "Precio a confirmar", (await ver("#chip-estado")) + " / " + (await ver("#precio")));
    expect(await V.isHidden("#btn-agendar") && await V.isHidden("#galeria-ant") && await V.isHidden("#galeria-contador"), "visit button or gallery arrows shown");
    const wa = decodeURIComponent(await V.getAttribute("#boton-wa", "href"));
    expect(new RegExp("me interesa la propiedad " + codigo + " \\([^)]*\\) \\(sale próximamente\\)\\. La vi en la web\\.").test(wa), wa);
  });

  if (AXE) {
    await t.check("no WCAG A/AA violations (axe) on the coming-soon page", async () => {
      await V.addScriptTag({ path: AXE });
      const found = await V.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })
        .then((r) => r.violations.map((x) => x.id + ":" + x.nodes.length)));
      expect(!found.length, found.join(", "));
    });
  }

  await t.check("property page with photos: the sign sits over them and the gallery still works", async () => {
    await V.goto(site.base + "/propiedad.html?c=LOM-001");
    await V.waitForSelector("#galeria .proximo--sobre-foto");
    const antes = await V.textContent("#galeria-contador");
    await V.click("#galeria-sig");
    expect((await V.textContent("#galeria-contador")) !== antes, "the arrow is blocked by the sign: " + antes);
  });

  await t.check("the printable sign says 'Precio a confirmar'", async () => {
    await V.goto(site.base + "/cartel.html?c=" + codigo);
    await V.waitForSelector("#c-precio:not(:empty)");
    expect(/Precio a confirmar/i.test(await ver("#c-precio")), await ver("#c-precio"));
  });

  await t.check("no JavaScript errors", async () => {
    expect(!A.errors.length && !V.errors.length, A.errors.concat(V.errors).join(" | "));
  });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
