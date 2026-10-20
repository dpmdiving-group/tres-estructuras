/* A property offered for rent and for sale at once: set up in the panel,
   published, listed under both filters, and its page switches between the
   two prices, messages and links. Run: node tests/e2e/rent-and-sale.js */

"use strict";

const { ROOT, launch, startSite, phone, checker } = require("./lib");
const AXE = (() => { try { return require.resolve("axe-core/axe.min.js", { paths: [ROOT] }); } catch (e) { return null; } })();

const t = checker("Rent and sale at once");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "panel" });

  await t.check("panel: 'También en venta' asks for the sale price, in USD by default", async () => {
    await A.click("#lista button[data-accion='editar'][data-codigo='QLM-002']");
    expect((await A.textContent("#f-tambien-texto")) === "También en venta", await A.textContent("#f-tambien-texto"));
    expect(await A.isHidden("#f-tambien-precio"), "price shown before ticking");
    await A.check("#f-tambien");
    expect(await A.isVisible("#f-tambien-precio") && (await A.inputValue("#f-tambien-moneda")) === "USD", "sale price field");
    await A.click("#btn-guardar");
    await A.waitForFunction(() => /Falta el precio de venta\./.test((document.querySelector(".aviso-flotante") || {}).textContent || ""));
    expect(await A.isVisible("#form"), "saved without the sale price");
    await A.fill("#f-tambien-precio", "85000");
    await A.click("#btn-guardar");
    await A.waitForSelector("#form", { state: "hidden" });
    const p = await A.evaluate(() => TE_ADMIN.obtenerProps().find((x) => x.codigo === "QLM-002"));
    expect(JSON.stringify(p.tambien) === '{"precio":85000,"moneda":"USD"}' && p.operacion === "alquiler" && p.precio === 520000, JSON.stringify(p.tambien));
    const fila = (await A.$eval("#lista .item:has(button[data-codigo='QLM-002'])", (e) => e.innerText)).replace(/\s+/g, " ");
    expect(/alquiler/i.test(fila) && /venta/i.test(fila) && /\$\s520\.000 · USD\s85\.000/.test(fila), fila.slice(0, 160));
  });

  await t.check("panel: a sale property can be for rent too ('También en alquiler', in pesos)", async () => {
    await A.click("#lista button[data-accion='editar'][data-codigo='BER-001']");
    expect((await A.textContent("#f-tambien-texto")) === "También en alquiler", await A.textContent("#f-tambien-texto"));
    await A.check("#f-tambien");
    expect((await A.inputValue("#f-tambien-moneda")) === "ARS", "rent currency");
    await A.fill("#f-tambien-precio", "400000");
    await A.click("#btn-guardar");
    await A.waitForSelector("#form", { state: "hidden" });
  });

  await t.check("Cobros: a new contract on a sale-and-rent property starts from its rent", async () => {
    await A.click("#tab-cobros");
    await A.click("#btn-nuevo-contrato");
    await A.selectOption("#c-codigo", "BER-001");
    expect((await A.inputValue("#c-monto")) === "400000" && (await A.inputValue("#c-moneda")) === "ARS", (await A.inputValue("#c-monto")) + " " + (await A.inputValue("#c-moneda")));
    await A.click("#btn-cancelar-contrato");
    await A.click("#tab-props");
  });

  await t.check("it publishes", async () => {
    await A.click('[data-te="publicar"]');
    await A.waitForFunction(() => /Publicado|No se pudo publicar/.test((document.querySelector(".te-capa h2") || {}).textContent || ""));
    expect((await A.textContent(".te-capa h2")) === "Publicado", await A.textContent(".te-capa"));
    const pub = site.published().find((x) => x.codigo === "QLM-002");
    expect(pub.tambien && pub.tambien.precio === 85000, JSON.stringify(pub.tambien));
  });

  const V = await phone(browser, site, { name: "visitor", path: null });
  // innerText: what the visitor reads (chips are uppercase by CSS)
  const ver = (sel) => V.$eval(sel, (e) => e.innerText.replace(/\s+/g, " ").trim());
  const tarjeta = (codigo) => V.$eval("#grilla li:has(.ficha__codigo:text-is('" + codigo + "'))", (li) => ({
    chips: [...li.querySelectorAll(".ficha__operacion")].map((c) => c.textContent),
    precio: li.querySelector(".ficha__precio").innerText.replace(/\s+/g, " ").trim(),
    otro: (li.querySelector(".ficha__otro-precio") || {}).textContent || "",
    href: li.querySelector("a").getAttribute("href")
  }));

  await t.check("home: the card has both chips and both prices", async () => {
    await V.goto(site.base + "/");
    await V.waitForSelector("#grilla li");
    const c = await tarjeta("QLM-002");
    expect(JSON.stringify(c.chips) === '["Alquiler","Venta"]', c.chips.join(","));
    expect(/^Alquiler \$ 520\.000$/i.test(c.precio) && c.otro === "Venta: USD 85.000", c.precio + " | " + c.otro);
    const solo = await tarjeta("QLM-001");
    expect(JSON.stringify(solo.chips) === '["Venta"]' && !solo.otro && solo.href === "propiedad.html?c=QLM-001", JSON.stringify(solo));
  });

  await t.check("'Venta' lists it with the sale price first; 'Alquiler' too, with the rent", async () => {
    await V.click(".chip[data-filtro='op'][data-valor='venta']");
    let c = await tarjeta("QLM-002");
    expect(JSON.stringify(c.chips) === '["Venta","Alquiler"]' && /^Venta USD 85\.000$/i.test(c.precio) && c.otro === "Alquiler: $ 520.000", JSON.stringify(c));
    expect(c.href === "propiedad.html?c=QLM-002&op=venta", c.href);
    await V.click(".chip[data-filtro='op'][data-valor='alquiler']");
    c = await tarjeta("QLM-002");
    expect(/^Alquiler \$ 520\.000$/i.test(c.precio) && c.href === "propiedad.html?c=QLM-002&op=alquiler", JSON.stringify(c));
    const ber = await tarjeta("BER-001");
    expect(/^Alquiler \$ 400\.000$/i.test(ber.precio) && ber.otro === "Venta: USD 118.000", "a sale property for rent too: " + JSON.stringify(ber));
    const codigos = await V.$$eval("#grilla .ficha__codigo", (e) => e.map((x) => x.textContent));
    expect(!codigos.includes("QLM-001"), "a sale-only property under Alquiler");
  });

  await t.check("from the 'Venta' card, the page opens on the sale", async () => {
    await V.click(".chip[data-filtro='op'][data-valor='venta']");
    await V.click("#grilla li:has(.ficha__codigo:text-is('QLM-002')) a");
    await V.waitForSelector("#selector-op:not([hidden])");
    expect((await V.getAttribute("#selector-op button[data-op='venta']", "aria-pressed")) === "true", "sale not selected");
    expect((await ver("#precio")) === "USD 85.000", await ver("#precio"));
    expect(/\+ \$ 95\.000 de expensas/.test(await ver("#expensas")), "expensas");
    expect((await ver("#boton-wa-texto")) === "Consultar por QLM-002 para comprar", await ver("#boton-wa-texto"));
    const links = await V.evaluate(() => [document.getElementById("boton-wa").href, document.getElementById("chat-flotante").href, document.getElementById("tel-header").href].map(decodeURIComponent));
    expect(links.every((l) => /me interesa la propiedad QLM-002 \([^)]*\) para comprar\. La vi en la web\./.test(l)), links[0]);
    expect(new URL(V.url()).pathname + new URL(V.url()).search === "/p/QLM-002?op=venta", V.url());
    expect(/ — Venta \| /.test(await V.title()), await V.title());
    const chips = await V.$$eval(".detalle__fila-chips .chip-operacion:not([hidden])", (e) => e.map((x) => x.textContent));
    expect(JSON.stringify(chips) === '["Alquiler","Venta"]', chips.join(","));   // textContent: as written
  });

  if (AXE) {
    await t.check("no WCAG A/AA violations (axe) with the switch", async () => {
      await V.addScriptTag({ path: AXE });
      const found = await V.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })
        .then((r) => r.violations.map((x) => x.id + ":" + x.nodes.length)));
      expect(!found.length, found.join(", "));
    });
  }

  await t.check("switching to 'Alquiler' changes the price, the messages and the address", async () => {
    await V.click("#selector-op button[data-op='alquiler']");
    expect((await ver("#precio")) === "$ 520.000", await ver("#precio"));
    expect((await ver("#boton-wa-texto")) === "Consultar por QLM-002 para alquilar", await ver("#boton-wa-texto"));
    const l = await V.evaluate(() => [document.getElementById("boton-wa").href, document.getElementById("chat-flotante").href, document.getElementById("tel-header").href].map(decodeURIComponent));
    expect(l.every((x) => /para alquilar\./.test(x)), l[1]);
    expect(new URL(V.url()).pathname + new URL(V.url()).search === "/p/QLM-002", V.url());
    expect(/ — Alquiler \| /.test(await V.title()), await V.title());
  });

  await t.check("the visit request and the shared link follow the operation shown", async () => {
    await V.click("#btn-agendar");
    await V.click("#agendar-dias .chip >> nth=1");
    await V.click("#agendar-franjas .chip:not([disabled]) >> nth=0");
    const visita = async () => decodeURIComponent(await V.getAttribute("#agendar-ir", "href"));
    expect(/quiero visitar la propiedad QLM-002 \([^)]*\) para alquilar\. ¿Puede ser/.test(await visita()), await visita());
    await V.click("#selector-op button[data-op='venta']");
    expect(/\) para comprar\. ¿Puede ser/.test(await visita()), await visita());
    await V.evaluate(() => { navigator.share = (d) => { window.__compartido = d.url; return Promise.resolve(); }; });
    await V.click("#btn-compartir");
    expect(/\/p\/QLM-002\?op=venta$/.test(await V.evaluate(() => window.__compartido)), await V.evaluate(() => window.__compartido));
  });

  await t.check("a shared sale link opens on the sale", async () => {
    await V.goto(site.base + "/propiedad.html?c=QLM-002&op=venta&f=instagram");
    await V.waitForSelector("#selector-op:not([hidden])");
    expect((await ver("#precio")) === "USD 85.000", await ver("#precio"));
    expect(new URL(V.url()).search === "?op=venta&f=instagram", V.url());
    expect(/para comprar\. La vi en Instagram\./.test(decodeURIComponent(await V.getAttribute("#boton-wa", "href"))), "source phrase");
  });

  await t.check("a property with one operation is exactly as before", async () => {
    await V.goto(site.base + "/propiedad.html?c=QLM-001&op=alquiler");
    await V.waitForSelector("#precio:not(:empty)");
    expect(await V.isHidden("#selector-op") && await V.isHidden("#chip-operacion-2"), "switch shown");
    expect((await ver("#precio")) === "USD 145.000" && (await ver("#chip-operacion")) === "VENTA", await ver("#precio"));
    expect((await ver("#boton-wa-texto")) === "Consultar por QLM-001", await ver("#boton-wa-texto"));
    expect(/me interesa la propiedad QLM-001 \([^)]*\)\. La vi/.test(decodeURIComponent(await V.getAttribute("#boton-wa", "href"))), "message changed");
  });

  await t.check("the sign says 'Alquiler y venta' with both prices", async () => {
    await V.goto(site.base + "/cartel.html?c=QLM-002");
    await V.waitForSelector("#c-precio:not(:empty)");
    expect((await ver("#c-operacion")) === "ALQUILER Y VENTA", await ver("#c-operacion"));
    const precio = await ver("#c-precio");
    expect(/\$ 520\.000/.test(precio) && /USD 85\.000/.test(precio) && /exp\./.test(precio), precio);
    await V.goto(site.base + "/cartel.html?c=QLM-001");
    await V.waitForSelector("#c-precio:not(:empty)");
    expect((await ver("#c-operacion")) === "VENTA" && (await ver("#c-precio")) === "USD 145.000", await ver("#c-operacion"));
  });

  await t.check("no JavaScript errors", async () => {
    expect(!A.errors.length && !V.errors.length, A.errors.concat(V.errors).join(" | "));
  });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
