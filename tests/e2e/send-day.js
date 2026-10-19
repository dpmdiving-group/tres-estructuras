/* Sending a worker one day's jobs by WhatsApp (not the whole month).
   Today is pinned to Tuesday 2026-10-20. Run: node tests/e2e/send-day.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Sending a worker one day's jobs");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A", login: null, clock: "2026-10-20T10:00:00", seed: {
    te_referencias: [{ codigo: "QLM-002", texto: "Mitre 1234, 2° B" }],
    te_trabajadores: [{ id: "T1", nombre: "Pancho Gómez", telefono: "11 2345-6789", categoria: "reparacion", tokenHash: "x".repeat(64) },
      { id: "T2", nombre: "Rosa", telefono: "", categoria: "limpieza" }],
    te_trabajos: [
      { id: "J1", fecha: "2026-10-19", trabajador: "T1", categoria: "limpieza", descripcion: "Ayer", estado: "pendiente" },
      { id: "J2", fecha: "2026-10-20", hora: "14:00", trabajador: "T1", categoria: "reparacion", codigo: "QLM-002", descripcion: "Arreglar la canilla", estado: "pendiente" },
      { id: "J3", fecha: "2026-10-20", hora: "09:00", trabajador: "T1", categoria: "pintura", descripcion: "Pintar la reja", estado: "pendiente", donde: "Rivadavia 450" },
      { id: "J4", fecha: "2026-10-20", trabajador: "T1", categoria: "pintura", descripcion: "Ya hecho", estado: "hecho" },
      { id: "J5", fecha: "2026-10-22", trabajador: "T1", categoria: "plomeria", codigo: "BER-001", descripcion: "Cortar pasto", estado: "pendiente" },
      { id: "J6", fecha: "2026-10-20", trabajador: "T2", categoria: "limpieza", descripcion: "De Rosa", estado: "pendiente" }
    ]
  } });
  const mensaje = (href) => decodeURIComponent(href.split("text=")[1]);

  await t.check("the worker's row offers today's jobs only when there are some, and never the month", async () => {
    await A.click("#tab-trabajos");
    await A.click("#btn-trabajadores");
    const fila = await A.textContent("#lista-trabajadores .trabajador-fila:has-text('Pancho')");
    expect(/Mandarle lo de hoy/.test(fila) && !/Mandarle lo de mañana/.test(fila) && !/mes/.test(fila), fila.replace(/\s+/g, " ").slice(0, 200));
    expect(/Sin WhatsApp cargado/.test(await A.textContent("#lista-trabajadores .trabajador-fila:has-text('Rosa')")), "Rosa without a phone");
  });

  await t.check("today's message has only today's pending jobs, in time order, with where to go", async () => {
    const href = await A.getAttribute("#lista-trabajadores .trabajador-fila:has-text('Pancho') a.lead__wa:has-text('hoy')", "href");
    expect(href.startsWith("https://wa.me/5491123456789?text="), href);
    const m = mensaje(href);
    expect(m === "Hola Pancho! Te paso los trabajos de hoy, martes 20/10:\n\n" +
      "• 09:00 hs — Pintura: Pintar la reja\n   📍 Rivadavia 450\n" +
      "• 14:00 hs — Reparación en QLM-002: Arreglar la canilla\n   📍 Mitre 1234, 2° B\n\n" +
      "Cuando termines cada uno, marcalo en tu link de trabajos. Cualquier duda escribime. — Tres Estructuras", m);
  });

  await t.check("tapping a day in the calendar offers that day's message for each worker with jobs", async () => {
    await A.evaluate(() => window.scrollTo(0, 0));
    await A.click("#calendario-trabajos button[data-iso='2026-10-22']");
    const links = await A.$$eval("#panel-dia-t-lista .envio-dia a", (e) => e.map((x) => [x.textContent, x.href]));
    expect(links.length === 1 && links[0][0] === "Mandarle a Pancho lo de este día", JSON.stringify(links.map((l) => l[0])));
    const m = mensaje(links[0][1]);
    expect(/^Hola Pancho! Te paso los trabajos del jueves 22\/10:\n\n• Plomería en BER-001: Cortar pasto\n   📍 Bernal Centro, Bernal\n/.test(m), m);
    await A.click("#calendario-trabajos button[data-iso='2026-10-19']");
    expect(/Te paso los trabajos del lunes 19\/10/.test(mensaje(await A.getAttribute("#panel-dia-t-lista .envio-dia a", "href"))), "a past day can still be sent");
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
