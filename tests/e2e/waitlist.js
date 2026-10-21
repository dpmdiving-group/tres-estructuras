/* The waiting list: a visitor signs up from a reserved (or coming-soon)
   property's page; the panel shows the people by property, and setting the
   property to "Disponible" offers to tell them with an editable message.
   Run: node tests/e2e/waitlist.js */

"use strict";

const { ROOT, FIXTURE, launch, startSite, phone, checker } = require("./lib");
const AXE = (() => { try { return require.resolve("axe-core/axe.min.js", { paths: [ROOT] }); } catch (e) { return null; } })();

const t = checker("Waiting list");
const expect = t.expect;

(async function main() {
  const props = FIXTURE.map((p) => p.codigo === "QLM-002" ? Object.assign({}, p, { estado: "reservada" })
    : p.codigo === "LOM-001" ? Object.assign({}, p, { estado: "proximamente" }) : p);
  const site = await startSite({ props });
  const browser = await launch();
  const lista = async () => Object.values(((await site.store.get("col/espera")) || { items: {} }).items);

  // A visitor with a mouse sees the explanation on the button
  const PC = await phone(browser, site, { name: "pc", path: null, context: { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false } });
  await t.check("the button shows on reserved and coming-soon properties, with its explanation on hover", async () => {
    await PC.goto(site.base + "/propiedad.html?c=QLM-002");
    await PC.waitForSelector("#btn-espera:not([hidden])");
    await PC.hover("#btn-espera");
    const tip = await PC.$eval("#btn-espera", (b) => getComputedStyle(b, "::after").content);
    expect(/sé el primero en enterarte cuando la unidad esté disponible/.test(tip), tip);
    await PC.goto(site.base + "/propiedad.html?c=LOM-001");
    await PC.waitForSelector("#btn-espera:not([hidden])");
    await PC.goto(site.base + "/propiedad.html?c=QLM-001");
    await PC.waitForSelector("#precio:not(:empty)");
    expect(await PC.isHidden("#btn-espera"), "shown on an available property");
  });

  const V = await phone(browser, site, { name: "visitor", path: null });
  const anotar = async (datos) => {
    await V.goto(site.base + "/propiedad.html?c=QLM-002");
    await V.click("#btn-espera");
    for (const [campo, valor] of Object.entries(datos)) {
      if (campo === "acepto") { if (valor) await V.check("#espera-form [name=acepto]"); continue; }
      const tipo = await V.$eval("#espera-form [name=" + campo + "]", (e) => e.tagName);
      if (tipo === "SELECT") await V.selectOption("#espera-form [name=" + campo + "]", valor);
      else await V.fill("#espera-form [name=" + campo + "]", valor);
    }
    await V.waitForTimeout(1600);   // a person takes a moment
    await V.click("#espera-form button[type=submit]");
  };

  await t.check("on a phone the explanation is at the top of the form; missing details are asked for", async () => {
    await V.goto(site.base + "/propiedad.html?c=QLM-002");
    await V.click("#btn-espera");
    expect(/sé el primero en enterarte/.test(await V.textContent(".espera__texto")), "no explanation");
    expect(await V.isVisible("#espera-garantia") && await V.isHidden("#espera-pago"), "a rent asks about the guarantee");
    await V.click("#espera-form button[type=submit]");
    expect((await V.textContent("#espera-estado")) === "Falta tu nombre.", await V.textContent("#espera-estado"));
    await V.fill("#espera-form [name=nombre]", "Lucía Gómez");
    await V.fill("#espera-form [name=telefono]", "11 5555-1234");
    await V.fill("#espera-form [name=email]", "lucia@example.com");
    await V.click("#espera-form button[type=submit]");
    expect(/aceptá que te contactemos/.test(await V.textContent("#espera-estado")), await V.textContent("#espera-estado"));
    expect(!(await lista()).length, "saved with missing details");
  });

  if (AXE) {
    await t.check("no WCAG A/AA violations (axe) with the form open", async () => {
      await V.addScriptTag({ path: AXE });
      const found = await V.evaluate(() => axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })
        .then((r) => r.violations.map((x) => x.id + ":" + x.nodes.length)));
      expect(!found.length, found.join(", "));
    });
  }

  await t.check("a visitor signs up: thanked by name, and the entry reaches the panel's data", async () => {
    await anotar({ nombre: "Lucía Gómez", telefono: "11 5555-1234", email: "lucia@example.com", cuando: "1mes", personas: "2", mascotas: "si", garantia: "caucion", comentario: "Trabajo en Capital", acepto: true });
    await V.waitForSelector("#espera-ok:not([hidden])");
    expect(/¡Listo, Lucía! Te avisamos por WhatsApp o email apenas QLM-002 esté disponible\./.test(await V.textContent("#espera-ok")), await V.textContent("#espera-ok"));
    expect((await V.textContent("#btn-espera")) === "✓ En lista de espera", await V.textContent("#btn-espera"));
    const l = await lista();
    expect(l.length === 1 && l[0].codigo === "QLM-002" && l[0].garantia === "caucion" && l[0].personas === 2 && l[0].estado === "esperando", JSON.stringify(l));
    await anotar({ nombre: "Marcos Díaz", telefono: "11 4444-9876", email: "marcos@example.com", cuando: "ya", acepto: true });
    await V.waitForSelector("#espera-ok:not([hidden])");
    expect((await lista()).length === 2, "second person");
  });

  const A = await phone(browser, site, { name: "panel" });
  await t.check("panel: the Consultas tab lists the waiting list by property", async () => {
    await A.click("#tab-leads");
    await A.waitForFunction(() => /QLM-002/.test(document.getElementById("espera-resumen").textContent));
    expect(/2 esperando/.test(await A.textContent("#espera-resumen")) && /2 esperando/.test(await A.textContent("#espera-total")), await A.textContent("#espera-resumen"));
    await A.click("#espera-resumen [data-ver-espera='QLM-002']");
    const g = (await A.textContent("#espera-personas")).replace(/\s+/g, " ");
    expect(/Lucía Gómez/.test(g) && /Seguro de caución/.test(g) && /2 personas/.test(g) && /Con mascotas/.test(g) && /Trabajo en Capital/.test(g) && /Marcos Díaz/.test(g), g.slice(0, 300));
    await A.click("#espera-cerrar");
  });

  await t.check("panel: the property shows how many are waiting", async () => {
    await A.click("#tab-props");
    expect((await A.textContent("#lista .item:has(button[data-codigo='QLM-002']) [data-ver-espera]")) === "2 en lista de espera", "no button");
  });

  await t.check("setting it to Disponible offers to tell them, with an editable message", async () => {
    await A.selectOption("#lista select[data-accion='estado'][data-codigo='QLM-002']", "disponible");
    await A.waitForSelector("#espera-modal:not([hidden])");
    expect(/QLM-002 pasó a Disponible: hay 2 personas esperando\. Publicá primero/.test(await A.textContent("#espera-modal-sub")), await A.textContent("#espera-modal-sub"));
    const wa = decodeURIComponent(await A.getAttribute(".espera-persona:has-text('Lucía') a.lead__wa", "href"));
    expect(wa.startsWith("https://wa.me/5491155551234?text=Hola Lucía, te escribimos de Tres Estructuras: ") && /\(QLM-002\)/.test(wa) && /\/p\/QLM-002/.test(wa), wa);
    await A.fill("#espera-mensaje", "Hola {nombre}, ya se liberó {codigo}: {link}");
    const wa2 = decodeURIComponent(await A.getAttribute(".espera-persona:has-text('Lucía') a.lead__wa", "href"));
    expect(/text=Hola Lucía, ya se liberó QLM-002: https:\/\/tresestructuras\.com\/p\/QLM-002$/.test(wa2), wa2);
    const todos = decodeURIComponent(await A.getAttribute("#espera-mail-todos", "href"));
    // Newest first; both in BCC, and "{nombre}" left out of a message to everyone
    const bcc = (/^mailto:\?bcc=([^&]*)&/.exec(todos) || [])[1] || "";
    expect(bcc.split(",").sort().join() === "lucia@example.com,marcos@example.com" && /&subject=Ya está disponible QLM-002/.test(todos) && /body=Hola, ya se liberó QLM-002/.test(todos), todos);
  });

  await t.check("one tap per person on WhatsApp, one email to all; each is marked as told", async () => {
    const [popup] = await Promise.all([A.ctx.waitForEvent("page"), A.click(".espera-persona:has-text('Lucía') a.lead__wa")]);
    await popup.close();
    await A.waitForFunction(() => [...document.querySelectorAll(".espera-persona")].some((e) => /Lucía/.test(e.textContent) && /Avisado el/.test(e.textContent)));
    expect(/Mandar email a los que esperan \(1\)/.test(await A.textContent("#espera-mail-todos")), await A.textContent("#espera-mail-todos"));
    // Don't really open the mail app
    await A.evaluate(() => document.addEventListener("click", (e) => { if (e.target.closest("a[href^='mailto:']")) e.preventDefault(); }, true));
    await A.click("#espera-mail-todos");
    await A.waitForFunction(() => document.getElementById("espera-mail-todos").hidden);
    const l = await A.evaluate(() => JSON.parse(localStorage.getItem("te_lista_espera")));
    expect(l.every((e) => e.estado === "avisado" && e.avisado), JSON.stringify(l.map((e) => e.estado)));
  });

  await t.check("marking contacted and deleting", async () => {
    await A.click(".espera-persona:has-text('Marcos') [data-contactado]");
    await A.waitForFunction(() => /Contactado/.test(document.querySelector(".espera-persona--contactado") ? document.querySelector(".espera-persona--contactado").textContent : ""));
    await A.click(".espera-persona:has-text('Marcos') [data-borrar-espera]");
    await A.waitForFunction(() => !/Marcos/.test(document.getElementById("espera-personas").textContent));
    await A.click("#espera-cerrar");
    expect(await A.isHidden("#espera-modal"), "the window didn't close");
  });

  await t.check("the changes are shared: the server copy follows the panel", async () => {
    await A.waitForFunction(async () => {
      const r = await fetch("/.netlify/functions/datos", { method: "POST", headers: { Authorization: "Bearer " + JSON.parse(localStorage.getItem("te_sesion")).access_token, "Content-Type": "application/json" }, body: JSON.stringify({ accion: "leer" }) });
      const items = Object.values((await r.json()).colecciones.espera.items);
      return items.length === 1 && items[0].estado === "avisado";
    }, null, { timeout: 20000, polling: 1000 });
  });

  await t.check("no JavaScript errors", async () => {
    expect(!A.errors.length && !V.errors.length && !PC.errors.length, A.errors.concat(V.errors, PC.errors).join(" | "));
  });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
