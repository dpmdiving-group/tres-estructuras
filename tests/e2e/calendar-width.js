/* The month calendars (Agenda and Trabajos) keep all seven days on screen on a
   phone, even with long job texts. Run: node tests/e2e/calendar-width.js */

"use strict";

const { launch, startSite, phone, checker } = require("./lib");

const t = checker("Calendar width on a phone");
const expect = t.expect;

(async function main() {
  const site = await startSite();
  const browser = await launch();
  const A = await phone(browser, site, { name: "A", login: null, clock: "2026-10-20T10:00:00", seed: {
    te_trabajadores: [{ id: "T1", nombre: "pacho", telefono: "", categoria: "reparacion" }],
    te_trabajos: [
      { id: "J1", fecha: "2026-10-19", trabajador: "T1", categoria: "electricidad", codigo: "QLM-002", descripcion: "a", estado: "pendiente" },
      { id: "J2", fecha: "2026-10-19", trabajador: "T1", categoria: "reparacion", descripcion: "b", estado: "pendiente" },
      { id: "J3", fecha: "2026-10-21", trabajador: "T1", categoria: "reparacion", codigo: "DPX-002", descripcion: "c", estado: "pendiente" },
      { id: "J4", fecha: "2026-10-26", trabajador: "T1", categoria: "plomeria", codigo: "DPX-002", descripcion: "d", estado: "pendiente" },
      { id: "J5", fecha: "2026-10-27", trabajador: "T1", categoria: "pintura", codigo: "DPX-004", descripcion: "e", estado: "pendiente" }
    ],
    te_visitas: [{ id: "V1", fecha: "2026-10-22", hora: "10:00", nombre: "Una persona con un nombre bastante largo", codigo: "QLM-002", estado: "pendiente" }]
  } });

  async function todosVisibles(sel) {
    return A.$$eval(sel + " .calendario__fila", (filas) => {
      const ancho = document.documentElement.clientWidth;
      return filas.map((f) => Array.from(f.children).map((d) => {
        const r = d.getBoundingClientRect();
        return r.left >= -1 && r.right <= ancho + 1 && r.width > 30;
      }).every(Boolean)).every(Boolean);
    });
  }

  await t.check("Trabajos: every day of every week is on screen, columns equal", async () => {
    await A.click("#tab-trabajos");
    expect(await todosVisibles("#calendario-trabajos"), "a day is off screen");
    const anchos = await A.$$eval("#calendario-trabajos .calendario__fila:nth-child(4) > *", (e) => e.map((d) => Math.round(d.getBoundingClientRect().width)));
    expect(Math.max(...anchos) - Math.min(...anchos) <= 1, "unequal columns: " + anchos.join(","));
    expect((await A.$$eval("#calendario-trabajos button[data-iso]", (e) => e.length)) === 31, "not all 31 days");
  });

  await t.check("tapping a day still shows its jobs in full", async () => {
    await A.click("#calendario-trabajos button[data-iso='2026-10-19']");
    expect(/Reparación/.test(await A.textContent("#panel-dia-t-lista")) && /pacho/.test(await A.textContent("#panel-dia-t-lista")), "day panel");
  });

  await t.check("Agenda: the same", async () => {
    await A.click("#tab-agenda");
    expect(await todosVisibles("#calendario-cuerpo"), "a day is off screen");
  });

  await t.check("no JavaScript errors", async () => { expect(!A.errors.length, A.errors.join(" | ")); });

  await browser.close();
  await site.close();
  t.done();
})().catch(function (e) { console.error("CRASH", e); process.exit(2); });
