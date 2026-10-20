/* Editable zones: a new zone from the property form (with its own code
   letters), renaming one renames it in its properties, an unused one can be
   removed, and the home's zone buttons come from the published properties.
   Run: node tests/e2e/zones.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Editable zones");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "panel", promptAnswer: "Berazategui", seed: {
    te_zonas: [{ clave: "FVA", nombre: "Florencio Varela" }]   // added on another phone, never used
  } });
  const opciones = () => A.$$eval("#f-zona option", (o) => o.map((x) => x.textContent));
  const prop = (codigo) => A.evaluate((c) => TE_ADMIN.obtenerProps().find((x) => x.codigo === c), codigo);

  await t.check("the zone list has the built-in zones, the shared ones and '+ Nueva zona…'", async () => {
    await A.click("#btn-nueva");
    expect(JSON.stringify(await opciones()) === '["Quilmes","Bernal","Avellaneda","Lanús","Lomas","Florencio Varela","+ Nueva zona…"]', (await opciones()).join(","));
  });

  await t.check("'+ Nueva zona…' adds it, selects it, and codes get its own letters", async () => {
    await A.selectOption("#f-zona", "__nueva");
    expect((await A.inputValue("#f-zona")) === "Berazategui", await A.inputValue("#f-zona"));
    // BER is Bernal's: Berazategui gets BRZ
    expect((await A.inputValue("#f-codigo")) === "BRZ-001", await A.inputValue("#f-codigo"));
    await A.fill("#f-titulo", "Casa en Berazategui");
    await A.fill("#f-barrio", "Centro");
    await A.fill("#f-precio", "90000");
    await A.fill("#f-ambientes", "3");
    await A.fill("#f-m2c", "80");
    await A.fill("#f-descripcion", "Casa de prueba en una zona nueva para el sitio.");
    await A.click("#btn-guardar");
    await A.waitForSelector("#form", { state: "hidden" });
    const p = await prop("BRZ-001");
    expect(p && p.zona === "Berazategui", JSON.stringify(p && p.zona));
    const z = await A.evaluate(() => JSON.parse(localStorage.getItem("te_zonas")));
    expect(z.some((x) => x.clave === "BRZ" && x.nombre === "Berazategui"), JSON.stringify(z));
  });

  await t.check("'Editar zonas': renaming a zone renames it in its properties", async () => {
    await A.click("#lista button[data-accion='editar'][data-codigo='LOM-001']");
    await A.click("#btn-editar-zonas");
    const filas = await A.$$eval("#lista-zonas .zona-fila", (f) => f.map((x) => x.innerText.replace(/\s+/g, " ").trim() + "|" + x.querySelector("input").value));
    expect(filas.some((f) => /BRZ 1 propiedad/.test(f) && /Berazategui$/.test(f)) && filas.some((f) => /FVA sin propiedades/.test(f)), filas.join(" / "));
    await A.fill("#lista-zonas input[data-zona='LOM']", "Lomas de Zamora");
    await A.press("#lista-zonas input[data-zona='LOM']", "Tab");   // leaving the field saves it
    await A.waitForFunction(() => /1 propiedad cambió/.test((document.querySelector(".aviso-flotante") || {}).textContent || ""));
    expect((await prop("LOM-001")).zona === "Lomas de Zamora", (await prop("LOM-001")).zona);
    expect((await A.inputValue("#f-zona")) === "Lomas de Zamora", "the open form keeps the renamed zone");
  });

  await t.check("a zone in use can't be removed; an unused one can", async () => {
    expect(await A.isDisabled("#lista-zonas button[data-quitar-zona='AVE']"), "Avellaneda is used by AVE-001");
    await A.click("#lista-zonas button[data-quitar-zona='FVA']");
    expect(!(await opciones()).includes("Florencio Varela"), (await opciones()).join(","));
    expect(!(await A.textContent("#lista-zonas")).includes("FVA"), "still in the box");
    await A.click("#btn-guardar");
    await A.waitForSelector("#form", { state: "hidden" });
  });

  await t.check("it publishes", async () => {
    await A.click('[data-te="publicar"]');
    await A.waitForFunction(() => /Publicado|No se pudo publicar/.test((document.querySelector(".te-capa h2") || {}).textContent || ""));
    expect((await A.textContent(".te-capa h2")) === "Publicado", (await A.textContent(".te-capa")).slice(0, 300));
  });

  const V = await phone(browser, site, { name: "visitor", path: null });
  const zonasHome = () => V.$$eval(".chip[data-filtro='zona']", (c) => c.map((x) => x.textContent));

  await t.check("home: the zone buttons come from the published properties", async () => {
    await V.goto(site.base + "/");
    await V.waitForSelector("#grilla li");
    expect(JSON.stringify(await zonasHome()) === '["Todas","Quilmes","Bernal","Avellaneda","Lanús","Berazategui","Lomas de Zamora"]', (await zonasHome()).join(","));
  });

  await t.check("a new zone's button filters, and a link to it opens filtered", async () => {
    await V.click(".chip[data-filtro='zona']:text-is('Berazategui')");
    let codigos = await V.$$eval("#grilla .ficha__codigo", (e) => e.map((x) => x.textContent));
    expect(JSON.stringify(codigos) === '["BRZ-001"]' && /zona=berazategui/.test(V.url()), codigos.join(",") + " " + V.url());
    expect((await V.getAttribute(".chip[data-filtro='zona']:text-is('Berazategui')", "aria-pressed")) === "true", "not pressed");
    await V.goto(site.base + "/?zona=" + encodeURIComponent("lomas de zamora"));
    await V.waitForSelector("#grilla li");
    codigos = await V.$$eval("#grilla .ficha__codigo", (e) => e.map((x) => x.textContent));
    expect(JSON.stringify(codigos) === '["LOM-001"]', codigos.join(","));
    await V.click(".chip[data-filtro='zona'][data-valor='']");
    expect((await V.$$eval("#grilla li", (e) => e.length)) === 8, "Todas");
  });

  await t.check("no JavaScript errors", async () => {
    expect(!A.errors.length && !V.errors.length, A.errors.concat(V.errors).join(" | "));
  });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
