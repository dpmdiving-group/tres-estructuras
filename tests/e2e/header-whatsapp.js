/* The header's contact: "WhatsApp" in green above the number (the number
   alone wasn't understood), opening WhatsApp with the same message as the
   green button. The home's owners block button is green WhatsApp too. Run: node tests/e2e/header-whatsapp.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("WhatsApp in the header");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  // The narrowest phone still in use: nothing may scroll sideways
  const V = await phone(browser, site, { name: "visitor", path: null, context: { viewport: { width: 320, height: 640 } } });
  const cabecera = () => V.evaluate(() => {
    const a = document.getElementById("tel-header");
    return { texto: a.innerText.replace(/\s+/g, " ").trim(), href: decodeURIComponent(a.href), target: a.target,
      verde: getComputedStyle(a.querySelector(".header__wa")).color, icono: getComputedStyle(a.querySelector("svg")).color,
      ancho: document.documentElement.scrollWidth, vista: document.documentElement.clientWidth };
  });

  await t.check("home: green \"WhatsApp\" with the number, opening WhatsApp", async () => {
    await V.goto(site.base + "/");
    await V.waitForFunction(() => /\d/.test(document.getElementById("tel-header-num").textContent));
    const c = await cabecera();
    expect(c.texto === "WhatsApp 11 5653-1063", c.texto);
    expect(c.verde === "rgb(37, 211, 102)" && c.icono === "rgb(37, 211, 102)", c.verde + " / " + c.icono);
    expect(/^https:\/\/wa\.me\/5491156531063\?text=Hola Tres Estructuras, quiero hacer una consulta/.test(c.href) && c.target === "_blank", c.href);
    expect(!/^tel:/.test(c.href), "still a phone call link");
  });

  await t.check("it fits a 320px phone without scrolling sideways", async () => {
    const c = await cabecera();
    expect(c.ancho <= c.vista, c.ancho + "px wide on a " + c.vista + "px screen");
  });

  await t.check("the owners' block button is green WhatsApp too, and fits", async () => {
    const b = await V.evaluate(() => {
      const a = document.getElementById("propietarios-wa"), r = a.getBoundingClientRect(), cs = getComputedStyle(a);
      return { texto: a.innerText.trim(), href: decodeURIComponent(a.href), fondo: cs.backgroundColor, icono: !!a.querySelector("svg"),
        derecha: r.right, fixed: cs.position, vista: document.documentElement.clientWidth };
    });
    expect(b.texto === "Hablemos por WhatsApp" && b.icono, b.texto);
    expect(b.fondo === "rgb(37, 211, 102)", b.fondo);
    expect(/^https:\/\/wa\.me\/5491156531063\?text=/.test(b.href), b.href);
    expect(b.fixed === "static" && b.derecha <= b.vista, b.fixed + " " + b.derecha + "/" + b.vista);
  });

  await t.check("on a property page it carries the property and where the visitor came from", async () => {
    await V.goto(site.base + "/propiedad.html?c=QLM-002&f=cartel");
    await V.waitForFunction(() => /QLM-002/.test(decodeURIComponent(document.getElementById("tel-header").href)));
    const c = await cabecera();
    const boton = await V.evaluate(() => decodeURIComponent((document.querySelector("#chat-flotante a, a#chat-flotante, .chat-flotante a") || {}).href || ""));
    expect(/me interesa la propiedad QLM-002/.test(c.href) && /Escaneé el QR del cartel\./.test(c.href), c.href);
    expect(!boton || boton === c.href, "the green button says something else: " + boton);
    expect(c.ancho <= c.vista, c.ancho + "px wide");
  });

  await t.check("the error page has it too", async () => {
    await V.goto(site.base + "/404.html");
    await V.waitForFunction(() => /\d/.test(document.getElementById("tel-header-num").textContent));
    expect((await cabecera()).texto === "WhatsApp 11 5653-1063", "404");
  });

  await t.check("no JavaScript errors", async () => { expect(!V.errors.length, V.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
