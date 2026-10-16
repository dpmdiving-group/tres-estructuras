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
| `code-change.js` | Changing a property's code: warning, old codes kept and reserved, old QRs and signs still work |
| `visit-share.js` | "Agendá tu visita" and "Compartir" on the property page, plus an axe audit |
| `backup-restore.js` | Full panel backup, and a restore that only adds and is shared |

The tests folder is never served by the site (`_redirects` answers 404).
