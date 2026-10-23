# Tres Estructuras — notes for Claude Code

Read automatically when Claude Code starts in this folder. It holds how we work on
this project and where the work stands, so a fresh clone on another computer can
pick it up. Not served by the site (`_redirects` answers 404). Never put prices,
estimates, client phone numbers or passwords here: the client owns this repository.

## Resuming: the user says "계속" (or "continue")

The user only clones the repo and types "계속": do everything else yourself, without
asking.

0. First time on this computer (no `node_modules/@netlify/blobs` or no `playwright-core`):
   set it up as in "Setup on a new computer" below, then run `npm test` once.
1. Read "Current status" at the end of this file.
2. `git fetch` and look at the branch: uncommitted changes (finish them, test, commit),
   commits not in `origin/main` (unpushed work: give the user the push command).
3. If the last pushed work is not verified live yet, verify it live (see Workflow) and report.
4. If "Current status" lists a task in progress, continue it.
5. Otherwise tell the user, in Korean, what is live and what is open, and wait for the
   next client request.

At the end of every task, update "Current status" below and commit it with the task.

## How we work

- The user is the developer of this client project. **Reply to the user in Korean**, in
  short plain bullet lists (no tables).
- The user forwards requests from the client's WhatsApp group (screenshots, Spanish
  text). For each one, write a reply the user can paste: **Spanish (Argentine voseo)**,
  preceded in your answer by one line `Written for: the client (WhatsApp group)`.
- Everything stored lasts in **English**: code, comments, commit messages, `SPEC.md`,
  test names. `README.md` is the client's manual, in Spanish.
- **Before building a request, say whether it is within the original scope** or a
  **new feature**, and wait for the user's go-ahead on new features (the user bills them;
  give a rough size, never store it in the repo). Original scope: the public site
  (catalogue, property pages with QR signs, WhatsApp contact) and the panel with
  Propiedades, Consultas, Agenda, Trabajos, Cobros and Contabilidad with a monthly close;
  bug fixes and small copy/visual tweaks are in scope.
- Keep the vanilla stack: plain HTML/CSS/JS, no framework, no build step besides
  `herramientas/generar.js`, which Netlify runs on deploy.
- **Never push to production yourself.** Give the user the exact command:
  `git push git@github.com:dpmdiving-group/tres-estructuras.git <branch>:main`.
  The client publishes from the panel (commits "Panel: …"), so `main` moves often: if
  the push is rejected, `git fetch`, rebase onto `origin/main`, rerun the tests and give
  the same command again.
- **Never write to the client's real data** while checking: in the panel use
  "Seguir sin conectarme" with test data in the test browser's localStorage, and
  intercept form submissions. Never use, ask for or store the client's account passwords.
- Private by design, never in public files (`data/propiedades.json` is public) nor on the
  worker's page: internal references, owners, the waiting list, salaries, workers' DNI,
  address and notes. Each lives in its own shared panel collection (`datos.mjs`).

## Setup on a new computer (done by Claude, not by the user)

- Needs Node 20 or newer; if it is missing, tell the user in Korean how to install it.
- `npm install` (the functions' `@netlify/blobs`, for the unit tests).
- `npm install --no-save playwright-core axe-core` for the browser tests. If there is no
  Google Chrome at `/usr/bin/google-chrome` (or `CHROME_PATH`), run
  `npx playwright-core install chromium`; for iPhone checks `npx playwright-core install webkit`.
- `npm test` (unit, seconds) and `npm run test:e2e` (every browser test, ~10 minutes).
  `tests/e2e/shared-data.js` sometimes fails in the full run and passes alone (known, older).
- Pushing needs the user's SSH key for GitHub; deploys happen on Netlify by themselves.

## Workflow for each request

1. `git fetch`, then a branch from `origin/main` (`feat/…` or `fix/…`).
2. Build it; update `SPEC.md` (English), `README.md` (Spanish manual) and
   `tests/e2e/README.md`; add unit tests (`tests/*.test.*`) and a browser test (`tests/e2e/*.js`).
3. Run `npm test` and `npm run test:e2e`; look at screenshots at phone width (360 px) and
   on a PC, and in WebKit for iPhone.
4. Commit with an English message ending with the Co-Authored-By line in use.
5. Give the push command. Once pushed, wait until it is live (a changed `sw.js` VERSION
   at https://tresestructuras.com/sw.js, or the new file served), then check it live on a
   PC, Android (Chromium) and iPhone (WebKit) without touching real data.
6. Give the Spanish client message.

Live-check gotchas: Playwright's WebKit reports `navigator.onLine = false` and cannot route
requests that the service worker handles (use `serviceWorkers: "block"` or wrap `fetch`);
Chromium's `context.route` does see them. Set the version notice aside: an open panel
shows "Hay una versión nueva del panel" after any deploy that changes `admin/`.

## Map

- `index.html`, `propiedad.html`, `404.html`, `cartel.html`; `js/` (site), `css/estilos.css`.
- `admin/index.html` (the panel) plus `admin/*.js` modules (cobros, propietarios, espera,
  sueldos, te-datos sync, te-nube session/publish…). Pure logic with unit tests:
  `admin/te-cobros.js`, `admin/te-sueldos.js`, `admin/te-merge.js`, `admin/te-datos.js`.
- `netlify/functions/`: `publicar.js` (publish to GitHub), `datos.mjs` (shared panel data),
  `trabajador.mjs` (a worker's own page), `espera.mjs` (the public waiting-list form).
- `sw.js` (offline and updates), `herramientas/generar.js` (property pages, versions).
- `SPEC.md` is the full technical spec; `README.md` the client's manual.

## Current status (2026-10-23)

- Everything below is live in production and verified (last feature commit `d159dcb`;
  newer commits on `main` are the client's data publishes).
- Built beyond the original scope, all live: rent and sale at once; "Próximamente";
  owners' monthly statements; editable zones; the waiting list (public form);
  workers' pay ("Sueldos"); Contabilidad's year view.
- In-scope fixes, live: the panel's new-version notice; green "WhatsApp" in the header and
  the owners' block; pages, scripts and styles network-first in `sw.js`; "zona sur" removed
  from the whole site.
- In progress: nothing.
- Open, waiting on the client: uploading videos straight from the phone (needs a paid
  video service they haven't chosen); inviting Miguel to the panel (email not given);
  changing the shared account password; 10 of the 12 properties are marked "reservada"
  (the client may want to review them).
