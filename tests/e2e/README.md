# Browser tests

End-to-end checks of the panel and the public pages in headless Chrome.
They are not part of `npm test` (which runs the fast unit tests in `tests/`)
and they never touch GitHub, Netlify or the real data.

## What they run against

`lib.js` starts a small fake Netlify on localhost:

- the site's files, with the real Content-Security-Policy from `netlify.toml`;
- a fake Identity (logging in as any email works);
- the real publish function (`netlify/functions/publicar.js`) against a fake
  GitHub kept in memory;
- the real shared-data function (`netlify/functions/datos.mjs`) against an
  in-memory store that behaves like Netlify Blobs (ETags, conditional writes).

The published list starts from `fixtures/propiedades.json` (the original
sample listings), so the tests don't depend on the client's current data.

## Setup (once)

The browser driver is installed without adding it to `package.json`, so the
site and the functions keep their single dependency:

```sh
npm install --no-save playwright-core axe-core
```

Chrome: set `CHROME_PATH`, or have Google Chrome / Chromium installed in the
usual place, or download Playwright's own with
`npx playwright-core install chromium`. `axe-core` is optional; without it
the accessibility check is skipped. Note that `npm ci` removes both again.

## Running

```sh
npm run test:e2e                      # everything (about 3 minutes)
node tests/e2e/code-change.js         # one file
```

Each file prints PASS/FAIL per check and exits non-zero if any failed.

| File | What it covers |
| --- | --- |
| `publish-two-devices.js` | Two phones publishing: no overwrites, the conflict screen, renumbering, code changes merged with edits, "última publicación" |
| `shared-data.js` | Leads, visits, jobs and accounting shared between phones, offline saves, who changed what |
| `calendar-width.js` | The Agenda and Trabajos month calendars keep all seven days on screen on a phone |
| `code-change.js` | Changing a property's code: warning, old codes kept and reserved, old QRs and signs still work |
| `work-categories.js` | Editing job categories (rename, colour, add, remove when unused), editing workers, "+ Trabajo" from a worker |
| `worker-view.js` | A worker's personal link and page: only their jobs, where to go, done / not done with a note, offline marks, replacing the link |
| `workers.js` | Adding workers on a phone (the box comes into view) and from the job form |
| `video-links.js` | Any YouTube link works, plays inside the page; share links are refused and never show a broken player |
| `send-day.js` | Sending a worker one day's jobs by WhatsApp: today/tomorrow buttons, the day panel, the message |
| `visit-share.js` | "Agendá tu visita" and "Compartir" on the property page, plus an axe audit |
| `amenities.js` | Choosing which amenity options appear, adding the owners' own, and how they reach the property page |
| `backup-restore.js` | Full panel backup, and a restore that only adds and is shared |
| `panel-photos.js` | Cover photos on the panel's list and the full-screen photo viewer (list and form) |
| `photo-framing.js` | "Encuadrar": the chosen part of a photo, in 4:3, for new and published photos |
| `property-labels.js` | Clear property labels in every select, and the internal reference (shared, never published) |
| `related.js` | "Otras propiedades" order (same building, neighbourhood, zone) and grouping a building in the panel |
| `rent-accounting.js` | Rent marked "al día" this month reaches Contabilidad (the one-tap fix and the contract form) |
| `rent-commission.js` | Third-party rentals: only the commission reaches Contabilidad; correcting payments already loaded |
| `rent-collection.js` | The Cobros tab: contracts, payments, overdue rent, reminders, adjustments, the link with Contabilidad |

The tests folder is never served by the site (`_redirects` answers 404).
