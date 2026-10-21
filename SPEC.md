# Tres Estructuras — Full specification v3

**Property management and sales system. Based in Greater Buenos Aires; the site names no region (client request, 2026-10-20: "Argentina es grande").**
Reference document for the system as it is built and running (updated October 2026).
It is the handover spec for any developer who has to maintain, extend or rebuild it.
The user-facing manuals are `README.md` (daily use) and `INSTALACION.md` (setup), both in Spanish.

---

## 1. What it is

Two pieces that work together, hosted on Netlify with no server of our own to run:

**A. Public site** (`tresestructuras.com`) — a mobile-first catalogue of the company's own properties for rent and sale. Its single goal: turn every visit into a WhatsApp enquiry that says where it came from. The core journey: someone sees the sign on the street → scans the QR → the page of that exact property opens → taps the green button → WhatsApp opens with the message already written, including the property code and the source.

**B. Management panel** (`/admin/`) — the owners' private tool, installable on the phone. Six modules: Properties (create and edit, photos, publishing), Leads (CRM), Agenda (client visits), Jobs (maintenance by category and worker), Rent collection (contracts, payments, overdue rent and reminders) and Accounting (income/expenses with a monthly close). Each user logs in with their own email and password (Netlify Identity, invite only). Everything is saved on the phone first, so the panel works without signal, and syncs when it can.

---

## 2. Architecture decisions

1. **Static pages, vanilla code.** HTML + CSS + vanilla JavaScript, no frameworks (re-confirmed in October 2026). The only server code is two Netlify Functions (§7).
2. **`data/propiedades.json` in the GitHub repository is the single source of truth** for the catalogue. The panel publishes by committing to it through the publish function; every publish is a commit, so git history is the audit trail and the undo.
3. **The WhatsApp number lives in one field** (`js/config.js`) and **is never printed or encoded in a QR**. QRs point at the property page; if the number changes or the business moves to the WhatsApp Cloud API, signs already on the street keep working.
4. **Printed URLs never die.** Codes are never reused. A *closed* property leaves the listing but its URL still answers, with a notice and alternatives. When a property's code is changed, the old code stays in `codigosAnteriores` and keeps opening it (§6). The route scheme does not change after the first sign is printed.
5. **The message is the attribution.** Each source (sign/web/instagram/facebook/marketplace) ends the WhatsApp message with a different sentence. No cookies, no analytics: reading the incoming message tells you which property and where it came from.
6. **One build step.** On deploy Netlify runs `herramientas/generar.js` (Node, no dependencies), which writes the full property pages under `fichas/`, the `sitemap.xml`, and stamps the service worker and panel versions (§4). Local development needs no build.
7. **Nothing is lost silently.** Publishing never overwrites another device's changes (three-way merge, §5.1); shared panel data never drops one phone's changes (conditional writes, §5.6); a restore only adds.

---

## 3. Brand

### Identity
**Tres Estructuras** — real estate, rent and sale. The three structures (house, building, plot) are drawn in an architect's plan language: one solid, one hatched, one dashed, on a ground line with dimensions (`assets/logo.svg`).

### Palette: "Night Blue and Bronze"
Every text/background pair is WCAG ≥ 4.5:1.

```css
--tinta:      #182430;  /* deep night blue. Header, main text */
--cal:        #ECEFF0;  /* light bluish grey. Page background */
--papel:      #F9FAFA;  /* white of cards */
--ocre:       #A68F60;  /* bronze. Accent, RENT chip, tile pattern */
--ocre-texto: #6D5B39;  /* dark bronze for text (prices) */
--ladrillo:   #7A4646;  /* muted wine. SALE chip, alerts */
--humo:       #57616A;  /* secondary text, metadata */
--wa:         #25D366;  /* WhatsApp green. ONLY for contact: the button and the header's "WhatsApp" */
```

Golden rule: WhatsApp green is used on nothing else. It means one thing: "tap here and you talk to a person". It appears on the contact buttons (the floating one, the property's "Consultar" and the home's owners block "Hablemos por WhatsApp") and, at the client's request (the number alone wasn't read as WhatsApp), on the header's WhatsApp icon and word above the number; that header link opens WhatsApp with the same message as the button, including the property on its page. (The "Agendá tu visita" button also opens WhatsApp, but it is outlined in night blue on purpose.)

### Typography
- Display: Bricolage Grotesque — titles, prices, brand.
- Body: Public Sans — paragraphs, buttons.
- Data: IBM Plex Mono — codes, m², rooms, dates; hard data only.

### Signature element
A **cement-tile (baldosa calcárea) pattern in pure CSS**, used in only three places: the header strip, the empty state of the filters, and the strips of the printable sign.

### Copy tone
Direct and honest, in Argentine Spanish (voseo). Say what was refurbished, what is original and what is missing. Never "oportunidad única" or "coqueto". Honesty is the difference from the big portals.

---

## 4. Public site

### Home (`index.html`)
- Hero with the positioning (real-estate agency and builder; own units plus clients' properties, everything in plain sight; no region named anywhere on the site) and a counter of the listed properties (all but closed), computed from the JSON, singular or plural.
- Filters by operation (All/Rent/Sale) and zone (Quilmes/Bernal/Avellaneda/Lanús/Lomas), sticky while scrolling, **mirrored in the URL** (`?op=&zona=`) so a filter can be shared.
- Responsive grid, 1/2/3 columns. Card: photo, operation chip, code in mono, title, zone, price, expenses if any, hard data, 360 badge when relevant. The whole card is a link with a visible focus.
- Empty state with the tile pattern and a button to clear filters.
- Below the listing, a block for owners ("¿Tenés una propiedad para alquilar o vender?") with a WhatsApp button (same link as the floating one).

### Property page (`/p/{CODE}`; also `propiedad.html?c=CODE` and `/propiedad/{CODE}`)
`/p/{CODE}` is a rewrite (200) to `fichas/{code}/index.html`, the full page generated at deploy with that property's Open Graph tags, JSON-LD and code baked in: a QR scan is one request with no redirect, and it is what WhatsApp and Google read. All pages use `<base href="/">` because the page rewrites its address to `/p/CODE`.

Order mirrors how people decide:
1. **Gallery**: touch swipe, arrows, keyboard (←/→/Enter), n/m counter, fullscreen with Escape.
2. Price, operation, code, approximate location (the exact address is given over WhatsApp).
3. **WhatsApp button** with the code visible.
4. **"Agendá tu visita"** (available properties only): the visitor picks one of the next days (6 by default, no Sundays) and a time slot (morning 9–12, midday 12–15, afternoon 15–18); it opens WhatsApp with "¿Puede ser el lunes 19/10, de 15 a 18 h?" plus the source sentence. Today is offered only while a slot is still ahead; past slots are disabled. Days and slots are set in `CONFIG.visitas`.
5. **"Compartir"**: the native share sheet, or copies the short `/p/CODE` link.
6. Hard data in a mono grid (rooms, bedrooms, bathrooms, garages, m², age, expenses).
7. Description.
8. Video tour: **deferred** YouTube embed (thumbnail + play; the iframe loads on tap; it plays inside the page). The panel takes any YouTube link (watch, youtu.be, Shorts, live, embed) and stores only the id; the site also reads a full link saved by an older panel. An "MP4" must be a file on the site (the CSP blocks video from other sites); anything else, such as a phone's share link, is refused by the panel and hidden by the site.
9. **360 viewer**: YouTube 360 by default; our own three.js player for equirectangular mp4 (mouse/touch drag, latitude limited to ±85°, fullscreen, gyroscope with a permission button on iOS). Fully lazy: nothing initialises until it scrolls into view, and three.js (600 KB) downloads only on play. No video → no section.
10. Amenities with icons (extensible dictionary; an unknown key shows a generic icon, it is never dropped).
11. Approximate location (no maps API).
12. Three related properties: same building first (`edificio`, a group key set in the panel with "Mismo edificio que" — the code of one of them, never an address), then the same neighbourhood (compared ignoring case, accents and punctuation), then the same zone; within each, the same operation first and available before reserved. Closed ones never show. A reserved or closed property's page therefore offers what is next to it.

Special states: **closed** property → the URL lives on, shows "ya no está disponible" + alternatives. Unknown code → the site's 404 page, which lists what is available. An **old code** (`codigosAnteriores`) opens the property under its current code, both from the generated page and from the JavaScript lookup.

### Floating chat (whole site)
- Mobile: full-width bar fixed at the bottom. Desktop: circle bottom-right that expands on hover.
- Contextual text: "Consultar" on the home page, "Consultar por QLM-014" on a property.
- Never opens by itself. Respects `prefers-reduced-motion`.
- Source: read from `?f=` on arrival, kept in `sessionStorage` for the whole visit, and it picks the closing sentence of the message.

### QR codes and signs (`cartel.html`, `/cartel/{CODE}`)
- **One QR per property** (never "the website's QR"). It encodes the short route `{domain}/p/{CODE}?f=cartel` — short on purpose: fewer characters = less dense QR = scans from further away.
- Generated in the browser (error correction level H); no files to maintain: if the domain changes in the config, every QR changes with it.
- Three outputs: printable A4 sign (tile pattern, large operation, price, 3 facts, 62 mm QR, the literal instruction "Escaneá con la cámara del celular"), the QR alone as PNG (1024 px with quiet zone), and a sheet with the QRs of every available property with cut lines. On a phone the sign is zoomed to fit the screen.
- Its own `@media print` styles: no action bar, exact colours, `@page` A4. Copies outside the production domain show a "COPIA DE PRUEBA" banner (their QRs still point at production).

### SEO, sharing and PWA
- Generated pages carry Open Graph (title with price, 155-character description, cover photo) and `RealEstateListing` JSON-LD.
- `sitemap.xml` from the JSON (current codes only); `robots.txt` excludes `/admin/`.
- PWA: manifest, 192/512 icons, service worker (data network-first so prices are never stale; the panel network-first; pages, the site's own scripts and styles network-first too, falling back to the saved copy offline or when the network takes over 3.5 s — with cache first a returning visitor saw the previous version once more after every update; photos, the logo and `js/lib/` cache-first). Every deploy renews the cache: the generator stamps `VERSION` in `sw.js` with the deployed commit (`COMMIT_REF`), and a publish from the panel bumps it too. A panel tab left open doesn't reload by itself, so the generator also stamps the panel's version: a hash of `admin/*` and `js/config.js` (not the commit, so a property publish doesn't count as a new panel) in `<meta name="te-panel">` of `admin/index.html` and in `admin/version.json`. The open panel fetches `version.json` (no-store) on load, when the tab becomes visible or gets focus, when the connection comes back and every 10 minutes (at most once a minute; not gated on `navigator.onLine`, which some browsers get wrong: without signal the fetch fails and the next chance retries); if it differs, a bar "Hay una versión nueva del panel" offers "Actualizar", which asks first when a form is open. A local copy has no stamp and never checks.

### Performance and accessibility (measured)
- Initial load of a property page without media: **74 KB** (target < 150).
- WebP with lazy loading; deferred embeds; fonts with `font-display: swap`.
- **No WCAG 2.0 A/AA violations** (axe-core) on home, property page (including the visit panel) and sign: contrast ≥ 4.5:1, visible focus, full keyboard navigation, touch targets ≥ 44 px, `prefers-reduced-motion`.

---

## 5. Management panel (`/admin/`)

Login with email and password (Netlify Identity, invite only; users are per Netlify site). Only emails listed in the `ADMINS` environment variable can publish or read shared data. "Seguir sin conectar" works offline on the phone's own copy and publishes nothing. The session bar shows the user, the connection state, unpublished changes and photos still uploading, with the reason if an upload fails; it retries on its own every 30 s.

### 5.1 Properties and publishing
- Create/edit/duplicate with validation: code format `ZZZ-NNN`, never reused (current and old codes both count), suggested next number per zone; default currency USD for sale / ARS for rent; minimum description.
- **Code changes** are safe: the photos stay at their published paths, the old code goes to `codigosAnteriores`, the form lists it, and it can never be given to another property. The warning says exactly that.
- Photos: picked or taken with the camera, processed one at a time in picking order (the first is the cover), converted in the browser to WebP ≤ 200 KB. HEIC (iPhone, Samsung "high efficiency") is decoded by `heic-to` in a Web Worker. Photos are saved in IndexedDB and uploaded in the background as git blobs (90 s timeout each), so they survive closing the app.
- "★ Portada" on every photo but the first moves it to the first place (the cover), keeping the others' order.
- "Encuadrar" (✂ on each photo of the form): drag and zoom (two fingers, slider or mouse wheel) the photo inside the site's 4:3 frame; the chosen part, up to 1600 px wide, is compressed like any photo and replaces it as a new photo that uploads on its own (a published file is simply no longer referenced).
- The list shows each property's cover photo and photo count; tapping a photo (in the list or in the form) opens a full-screen viewer with arrows, swipe, pinch zoom and a link to the original file.
- Amenities: the built-in options come from `CONFIG.amenities`; "Elegir qué opciones aparecen" hides the ones the owners never use and adds their own, shared between phones (data collection `amenities`: `{clave, oculto}` for a built-in one, `{clave, nombre, propio: true}` for their own). An owner's own amenity is stored in the property by its exact name, so the public page shows it as typed (generic icon). A hidden option still shows, ticked, on a property that has it, so saving never drops it.
- **Editable zones** (client request, 2026-10-20; a new feature beyond the original scope). Five built-in zones (Quilmes QLM, Bernal BER, Avellaneda AVE, Lanús LAN, Lomas LOM); the owners add, rename and remove zones from the property form ("+ Nueva zona…" in the Zona select, "Editar zonas"). Shared collection `zonas`, keyed by the zone's code letters (`{clave, nombre}` adds a zone or renames a built-in one; `{clave, oculto: true}` takes a built-in one off the list). A new zone gets 3 letters no zone or code uses (Berazategui → BRZ, since BER is Bernal's), and new codes in it start with them. A property keeps its zone by name: renaming a zone renames it in its properties (then publish); a zone can be removed only when no property uses it. The home's zone buttons are built from the listed properties (built-in order first, then the rest alphabetically), so a new zone gets its button once one of its properties is published and a zone without listed properties has none (`index.html` only has "Todas", so no button shows and then disappears while the page loads).
- **Waiting list** (client request, 2026-10-21; a new feature beyond the original scope). Reserved and coming-soon property pages have a "Lista de espera" button next to the code; on a mouse its explanation shows on hover, on a phone at the top of the form. The form: name, WhatsApp and email (required), when, how many people, pets and guarantee for a rent or how they'd pay for a sale, a comment and consent to be contacted; sent to `espera.mjs`; the device remembers it signed up (`te_espera_anotado`). Panel (`admin/espera.js`, shared collection `espera`, local `te_lista_espera`): the Consultas tab lists it by property, each property shows "N en lista de espera", and a window per property shows each person with WhatsApp, email, "Marcar contactado" and delete. Setting a property to "Disponible" (list or form) opens that window if someone is waiting, with an editable message (`{nombre}`, `{codigo}`, `{titulo}`, `{link}`; the last edit is kept on the device): one tap per person on WhatsApp (wa.me can't send to many at once; automatic sending would need the WhatsApp Business API) or one email to everyone waiting (BCC). Each is marked "avisado" with the date. Never published.
- **Workers' pay** (client request, 2026-10-21; a new feature beyond the original scope). "Sueldos" next to "Trabajadores" in the Trabajos tab (`admin/sueldos.js`, pure logic in `admin/te-sueldos.js`). Shared collection `sueldos`: one `{tipo: "modalidad", trabajador, frecuencia: semanal|quincenal|mensual, dia, monto, moneda}` per worker (`dia` a weekday 0–6, or a day of the month for monthly) and `{tipo: "pago", trabajador, fecha, monto, moneda, nota, mov}` per payment. Each worker shows the pay setting, the last payment and when the next is due (a payment up to 3 days early or late counts for that pay day; overdue in red); "Registrar pago" comes with the usual amount, editable. A payment also goes to Contabilidad as an expense in the new category "Sueldos" ("Sueldo — <name> (<note>)", unless unticked) and follows it when edited or deleted. Kept apart from the `trabajadores` collection, which the worker's page reads: pay never reaches it (tested). The month's total paid is shown in the box.
- Internal reference per property (an address, or what the owners call it): never published, since `data/propiedades.json` is public. It lives in the shared panel data (collection `referencias`, `{codigo, texto}`), follows code changes, and leads every property select in the other tabs. Those selects are sorted by code (closed ones last) and show code · reference (or neighbourhood) · operation and price · short title.
- Quick status change (available/reserved/closed) from the list. Deleting suggests "closed" instead so printed QRs stay alive.
- **Publishing** ("Publicar en el sitio"): the panel reads the current list and its version (`baseSha`), merges it with its own copy, and commits. The merge is **three-way and field by field** (`admin/te-merge.js`) against the last version this device received (`te_base`): only one side changed a field → that change wins; both changed it differently → the conflict screen asks "mine" or "site" (default site), or "decide later". A renamed property is matched by its old codes. A new property whose code the site used meanwhile moves to the next free code, with its pending photos. The function refuses a stale `baseSha` (409) and the panel merges and retries; old cached panels without `baseSha` get 428. The panel also syncs on open, on reconnect and when it comes back to the front.
- "Última publicación: who · when" above the list.
- Old method kept: download `propiedades.json`, or a ZIP with the JSON and photo folders.

### 5.2 Leads (CRM)
- Created by pasting the incoming WhatsApp message: **the parser detects the property code and the source** (sign/web/instagram/facebook/marketplace). Only known prefixes count; an old code maps to the current one.
- Statuses: new → contacted → visit arranged → reserved → won / discarded. Badge with new ones not yet handled.
- Metrics: leads this week, total, by source, most requested property.
- Direct WhatsApp button to the person (phones normalised to 549…). CSV export for Excel.

### 5.3 Visit agenda
- Monthly calendar (today highlighted, navigation, "go to today"). Visits as chips per day.
- Created by hand or **from a lead** with the data prefilled.
- Statuses: pending/confirmed/done/cancelled (cancelled struck through). Badge with upcoming pending ones.
- **Prewritten WhatsApp confirmation**: name, property, date in Spanish, time, and "la dirección exacta te la pasamos por acá un rato antes".
- Print the month on A4.

### 5.4 Jobs
- Monthly maintenance calendar with chips coloured by **category**: cleaning, repair, painting, garden, electricity, plumbing + their own. "Categorías" lets the owners rename and recolour categories (jobs keep their key, so every job follows), add new ones, and remove one only when no job or worker uses it; "+ Nueva categoría…" also works from the job form and a worker's usual category.
- Manageable **workers** (name, WhatsApp, usual category, DNI, address and free notes — the last three are private to the panel and never reach the worker's page): add, edit, remove, and "+ Trabajo" starts a new job with that worker and their category. Each job: date, optional time, category, worker, property, description, status (pending/done/cancelled).
- Filters by category and worker, applied to the calendar and to printing.
- **One day's jobs by WhatsApp**: the worker's row offers "Mandarle lo de hoy" / "lo de mañana" (only days with pending jobs), and the day panel of any day offers "Mandarle a <name> lo de este día" for each worker with pending jobs that day. The message lists them in time order with where to go (the job's "Dónde", else the property's internal reference, else its neighbourhood), and reminds them to mark each job in their link if they have one. (It used to send the whole month, past days included.)
- Statuses: pending / done / couldn't be done / cancelled; a job has an optional "Dónde" (address or directions).
- **Worker's own page** (`/trabajador/`, `js/trabajador.js`, `netlify/functions/trabajador.mjs`): "Link para el celular" creates a personal link (`/trabajador/#t=<secret>`); the panel stores only its SHA-256 (`tokenHash` on the worker, shared data) and shows the link once, with a WhatsApp button; a new link replaces the old. The page keeps the secret on the phone (it can be added to the home screen) and shows only that worker's jobs (pending ones overdue first, then by day, done ones of the last 30 days apart), with where to go (the job's "Dónde", else the property's internal reference, else its neighbourhood) and a Google Maps link. The worker marks a job done (optional note) or not done (reason required) or back to pending; marks made without signal wait on the phone and are sent when it returns. The function only ever returns that worker's jobs (never cancelled ones, other workers, leads, accounting or links), writes with the same conditional writes as datos.mjs, and stamps `_por: "<name> (trabajador)"`; the panel shows the note ("Pancho: …").
- **"Cargar gasto"** on a job → Accounting with everything prefilled.

### 5.5 Rent collection ("Cobros")
- **Contracts**: property (optional), tenant, WhatsApp, how the place is named in messages, monthly rent and currency, due day (1–31; 31 falls on the last day of shorter months), start month, optional end month, optional adjustment every 3/4/6/12 months, status active/finished, note, and "al día hasta" (`alDiaHasta`): for a contract entered after it started, the last month already collected; months up to it are not debt unless a payment was recorded for them (prefilled with last month when the start is in the past). Months from the current one on that it covers are collected now, so they belong in accounting: saving the contract offers to register them as payments (and incomes), and "Para hacer hoy" shows a one-tap "Registrar los pagos" for any left without one; either way "al día hasta" then goes back to last month. Earlier months show "Al día — no figura en Contabilidad". The rent history is kept in `montos` (`[{desde, monto}]`): a new rent applies from a chosen month on and never changes what earlier months owed.
- **Owners and their monthly statement** (client request, 2026-10-20; a new feature beyond the original scope). Shared collection `propietarios` (`{id, nombre, telefono, nota, enviados: {"2026-10": "2026-10-20"}}`, never published) managed in Contabilidad ("Cierre para propietarios", `admin/propietarios.js`); a contract names its owner (`propietario` = id) in Cobros, where "+ Nuevo propietario…" adds one. The statement for the month shown in Contabilidad (`TE_COBROS.cierrePropietario`): per property of the owner's contracts (its code, or for one not on the site its contract's name), the rent payments by payment date, minus the commission, minus the Contabilidad expenses on that property unless marked `noPropietario` ("No se le descuenta al propietario"); deposits and contract fees are not included; each currency apart. `mensajeCierre` writes it as a WhatsApp message ("Total a transferirte" / "Saldo a tu cargo"), sent with wa.me to the owner's number (or to a contact picked in WhatsApp when there is none); tapping it records the month as sent. The expense form also offers the rentals not on the site ("<name> (no publicada)", saved as `etiqueta`). An owner with contracts can't be deleted.
- **Third-party rentals**: a contract may have a commission % (`comision`). Then each payment puts only the commission in Accounting (category "Comisión por administración"), and Cobros shows the owner's part per payment and "Ganancia" / "Para propietarios" per month; the payments export has both. Changing a contract's commission offers to correct the incomes of its payments already in Accounting.
- **One-time charges**: a contract may have a deposit (`deposito`) and fees for drawing up the contract (`honorarios`). They are paid as payments with a `concepto` and no month, never count toward rent, show as pending in "Para hacer hoy" (and in the month view) until paid, and appear in the payments export with their concept. The fees go to Accounting as "Honorarios por contrato"; the deposit never does (it is held, to be returned or passed to the owner) and stays visible on finished contracts.
- **Contabilidad by property for rentals**: incomes from Cobros carry the contract's property code or, for a property not on the site, its name (`etiqueta`: how it is named in messages, else "Contrato de <tenant>"), so "Resultado por propiedad" shows one line each instead of lumping them in "(sin propiedad)"; the filter lists those names and "(sin propiedad)". When a contract's property or name changes, its incomes follow; incomes recorded before this were regrouped on first load.
- **Payments** belong to a contract and a month; a month can be paid in parts (cash, transfer, deposit, other). Each new payment is also recorded as an income in Accounting (category "Alquiler cobrado", linked by `pago`/`mov`); editing or deleting the payment updates or removes that income.
- **"Para hacer hoy"**: overdue rent, one line per contract with every overdue month since the start and the total (one reminder lists them all; a payment goes to the oldest month first), rent due today or within 5 days (this month or the next), adjustments due (N months after the last rent change) and contracts ending within two months. The tab badge, and the app icon badge where the phone supports it, count overdue rent, reminders not yet sent and adjustments due.
- **Reminders and confirmations** are prewritten WhatsApp messages opened with one tap from the owner's phone (wa.me); the panel records that a reminder was sent for that month. Sending them automatically would need the WhatsApp Cloud API (roadmap). The confirmation is not a legal or tax receipt.
- **Month view**: each running contract with its status (paid / pending / due today / overdue N days, partial payments), its payments, earlier debts linking to their month, and totals per currency (to collect, collected, missing, overdue). Finished contracts are listed apart with any debt left. CSV export of every payment; printable month.
- Not included: index calculation (ICL/IPC — the owner types the new rent), late fees or interest, deposits and guarantees beyond a note.
- The calculations are pure functions in `admin/te-cobros.js` (unit-tested); the tab is `admin/cobros.js`.

### 5.6 Monthly accounting
- Entries: income/expense, category, optional property, amount in **ARS or USD (kept separately, never converted)**, detail. Currencies found in old data are shown too, never dropped.
- Monthly close: income/expenses/result per currency + **result per property** + filterable list.
- CSV export (separate Income and Expense columns, regional format) for the month or everything. Printable close.
- It does not replace the accountant: it puts the numbers in order for them.

### 5.7 Shared panel data
Leads, visits, jobs, workers, categories, rental contracts, rent payments, the amenity options and accounting are **shared between every phone that logs in** (`admin/te-datos.js` + `netlify/functions/datos.mjs`):
- Each phone saves to `localStorage` first and syncs 1.5 s after a save, on login, when back online and when the app returns to the front. `te_sync_<name>` remembers the last server version of each item, so the phone can tell its own unsent changes and deletions apart from everyone else's.
- The server keeps one JSON document per collection in Netlify Blobs; writes are conditional on the ETag just read (10 attempts with jitter), so simultaneous saves never wipe each other. The same item changed on two phones: the last save wins. Deletions are kept as tombstones for 120 days.
- The server stamps every saved item with `_u` (time) and `_por` (the editor's email from the verified session); rows show "Último cambio: name · when".
- **Full backup** ("Descargar respaldo completo", bottom of the panel): syncs first, then one file with every collection and the property list. **Restore** only adds items whose id is missing: nothing is deleted or changed, and the restored items are shared. Properties are not restored from it (they live on the site). Each tab still has its own JSON backup and import.

---

## 6. Data model

`data/propiedades.json` — array of objects:

```json
{
  "codigo": "QLM-001",              // ZZZ-NNN. Never reused.
  "codigosAnteriores": ["LAN-001"], // optional: old codes after a code change; they keep opening this property
  "titulo": "...", "zona": "Quilmes", "barrio": "...",
  "operacion": "venta|alquiler",
  "estado": "disponible|reservada|proximamente|cerrada",
  "textoProximamente": "En obra – marzo",  // optional: the sign on a coming-soon property (default "Próximamente", max 60)
  "precio": 145000, "moneda": "USD|ARS",
  "tambien": { "precio": 520000, "moneda": "ARS" },  // optional: also offered for the OTHER operation at this price
  "expensas": null, "monedaExpensas": "ARS",
  "ambientes": 3, "dormitorios": 2, "banos": 1, "cocheras": 1,
  "m2Cubiertos": 78, "m2Totales": 130, "antiguedad": 42,
  "reciclada": true, "aptoCredito": true, "aptoMascotas": true,
  "descripcion": "Honest: what was refurbished, what is original, what is missing.",
  "portada": "/media/QLM-001/a1b2c3.webp", "fotos": ["..."],
  "video":    { "tipo": "youtube|mp4", "id|url": "..." } | null,
  "video360": { "tipo": "youtube|mp4", "id|url": "..." } | null,
  "amenities": ["patio", "parrilla", "..."],   // keys without accents, extensible dictionary
  "destacada": true, "publicada": "2026-07-10"
}
```

**Rent and sale at once** (client request, 2026-10-20; a new feature beyond the original scope). `operacion`, `precio` and `moneda` stay the main operation; `tambien` (`{precio, moneda}`, price > 0) offers the other one too. Absent means one operation, exactly as before. Where it shows: the home lists the property under both filters, its card carries both chips with the filtered operation's price first and the other one below ("Venta: USD 85.000"), and the card links to `propiedad.html?c=CODE&op=<operation>`. The property page shows both chips and an "Alquiler | Venta" switch above the price; the switch (or `?op=`) sets the price, the WhatsApp button text and every WhatsApp message (button, floating chat, header, visit request: "… para alquilar" / "… para comprar"), the share link and the address (`/p/CODE?op=venta`, `op` only when it isn't the main operation). Expensas are the same for both. The printable sign says "Alquiler y venta" with both prices; the generated page title lists both ("— Alquiler $ 520.000 · Venta USD 85.000") and its JSON-LD carries two offers (LeaseOut and Sell). In the panel: "También en venta / alquiler" with the second price and currency (USD for a sale, ARS for a rent by default); Cobros treats the property as a rental and starts a contract from its rent. The publish function refuses a `tambien` without a positive numeric price or with a currency other than USD/ARS. Helpers: `TE.operaciones`, `TE.ofrece`, `TE.operacionVista`, `TE.precioDe` in `js/tarjetas.js`.

**Coming soon** (client request, 2026-10-20; a new feature beyond the original scope). `estado: "proximamente"` is a property still being finished: it may be published without photos and without a price (`precio: null` shows "Precio a confirmar"). Instead of a photo, the card and the property page show the logo on a light, framed background with a tilted white sign carrying `textoProximamente` (or "Próximamente"); once photos or renders are added, the sign sits over them (the gallery still swipes and opens). The page shows a "Próximamente" status chip, hides "Agendá tu visita", and the WhatsApp message adds "(sale próximamente)". The home lists these after the rest and counts them apart ("6 propiedades disponibles y 2 próximamente."). Generated pages use `/assets/proximamente.png` as the link preview when there are no photos, put "Próximamente · … precio a confirmar" in the title and a `PreOrder` offer (without price) in the JSON-LD; the printable sign says "Precio a confirmar". Panel: status "Próximamente (se está terminando)", the "Texto del cartel" field, and no price required for it. The publish function accepts the status, skips the price check for it, and refuses a sign text longer than 60 characters. Turning it into a normal property: set "Disponible", add photos and the price.

Photo files keep a unique name forever; order comes from the list, so moving or deleting photos never overwrites a published file. The publish function validates the list (required fields, code format, no code used twice — current or old — types and statuses, photo paths under `/media/`).

Panel data on each phone (`localStorage`): `te_leads`, `te_visitas`, `te_trabajos`, `te_trabajadores`, `te_categorias`, `te_contratos`, `te_pagos`, `te_movs`, `te_propietarios`, `te_zonas`, `te_lista_espera`, `te_sueldos`, plus `te_borrador` (property draft), `te_base` (last published version received), `te_sync_<name>` and `te_sesion`. Pending photos live in IndexedDB. Shared copy: Netlify Blobs store `panel`, keys `col/<name>`, documents `{items: {id: item}, borrados: {id: time}, rev}`.

---

## 7. Server functions

- **`netlify/functions/publicar.js`** (v1, Identity user from `context.clientContext`). Actions: `leer` (current list, its version and the last publication), `blob` (upload one photo as a git blob), `commit` (validate, then one commit with the JSON, the new photos and the bumped `sw.js`, moving the branch with `force: false`). Environment: `GITHUB_TOKEN` (fine-grained, contents read/write, expires yearly), `GITHUB_REPO`, optional `GITHUB_BRANCH`, `ADMINS`. GitHub auth errors are reported as 502 so the user isn't logged out for them.
- **`netlify/functions/trabajador.mjs`** (v2). A worker's personal link (`Authorization: Trabajador <secret>`, matched by SHA-256 against the workers' `tokenHash`): `leer` (their jobs, category names, and the internal references of those jobs' properties) and `actualizar` (done / not done with a note / pending, only on their own non-cancelled jobs).
- **`netlify/functions/espera.mjs`** (v2). The waiting list form, the only thing a site visitor can save: no session; validates and cleans the details, and adds them to the panel's collection `espera` (the same document format and conditional writes as `datos.mjs`). Against spam without captchas: a hidden field bots fill (`sitio`), a minimum time with the form open (`ms` ≥ 1.5 s), at most 5 entries per visitor per hour (the IP kept only as a salted hash under `espera-limite/`), and the same phone on the same property updates its entry (back to "esperando"). Bots are answered `ok` and nothing is saved; nothing is ever read back.
- **`netlify/functions/datos.mjs`** (v2, for strongly consistent Blobs reads). Actions: `leer`, `guardar` (up to 500 changes per call; the panel sends batches of 200). It checks the token against Identity (`/.netlify/identity/user`) and `ADMINS`.

---

## 8. Files

```
tres-estructuras/
├── index.html / propiedad.html / cartel.html / 404.html
├── admin/
│   ├── index.html              Panel (6 modules) + jszip.min.js
│   ├── te-nube.js              Login, photo uploads, sync and publishing, conflict screen
│   ├── te-merge.js             Three-way merge of the property list (also used by the tests)
│   ├── te-datos.js             Shared panel data: offline-first sync, backup and restore
│   ├── te-cobros.js            Rent collection calculations (also used by the tests)
│   └── cobros.js               The Cobros tab
├── css/estilos.css             Design system (tokens at the top)
├── js/
│   ├── config.js               ONLY place for the WhatsApp number, domain, zones, amenities, visit slots
│   ├── tarjetas.js             Shared helpers (window.TE)
│   ├── app.js / ficha.js / galeria.js / visor360.js / chat.js / qr.js / cartel.js
│   └── lib/                    three.min.js (r149), qrcode.js, heic-to.js — vendored, no CDN
├── data/propiedades.json       Source of truth of the catalogue
├── media/{code}/*.webp         Photos
├── fichas/{code}/index.html    Generated at deploy (not in git): full property pages, also for old codes
├── herramientas/generar.js     Generator (runs on every Netlify deploy)
├── netlify/functions/          publicar.js, datos.mjs
├── tests/                      Unit tests (node --test) and tests/e2e browser tests
├── assets/                     logo.svg, PWA icons, og-home.jpg
├── manifest.json / sw.js       PWA
├── _redirects / netlify.toml   Short routes, 404 for /tests/*, headers (CSP, cache), build
├── sitemap.xml / robots.txt
├── README.md                   Daily-use manual for non-programmers (Spanish)
└── INSTALACION.md              Setup: GitHub, Netlify, Identity, environment variables (Spanish)
```

Deploy: GitHub + Netlify (build `node herramientas/generar.js`, publish the root, functions from `netlify/functions`). Own domain with automatic HTTPS. The CSP allows `worker-src 'self' blob:` for the HEIC decoder. **Rule: print no QR until the site is published on its final domain.**

### Tests
- `npm test`: unit tests for the merge, the publish function (against a fake GitHub), the shared-data function (against an in-memory store that behaves like Blobs), the panel sync logic and the generator.
- `npm run test:e2e`: browser tests in headless Chrome against a local fake Netlify running the real functions (see `tests/e2e/README.md`; `playwright-core` is installed with `--no-save`).
- A staging copy on a separate Netlify site is used to test before production; it shows the "COPIA DE PRUEBA" banner.

---

## 9. Acceptance criteria (all verified ✓)

- Cold entry to a property page from a QR: fast (74 KB initial), works on mobile, one request.
- The WhatsApp button opens the app with a message that includes the code and the source.
- One QR per property, decoded and verified: it points at `/p/{CODE}?f=cartel`.
- Changing the WhatsApp number in one field without touching printed signs.
- Filters shareable by URL. Closed → URL alive. Changed code → old URL alive. Full keyboard use with visible focus.
- Pasting a link in WhatsApp shows the cover photo.
- Two devices publishing never overwrite each other; shared panel data never loses a phone's changes.
- No WCAG A/AA violations. Panel flows covered by automated unit and browser tests.

## 10. Roadmap
- If volume calls for it: WhatsApp Cloud API with a 24/7 bot, which could also send the rent reminders automatically (panel data already exports cleanly); loading listings from Google Sheets.

---

## 11. Annex for quoting: effort estimate

Estimated hours to build the original static system (the first version of this document) from scratch, with equivalent quality (tests, verified accessibility, measured performance), by one semi-senior/senior front-end developer. It does not include the publishing, login, shared-data and rent-collection work added in October 2026.

- Design system + home with filters in the URL: 25–35
- Full property page (gallery, states, related, deferred video): 30–40
- 360 viewer (three.js, lazy, gyroscope, states): 20–30
- WhatsApp + attribution + QR + A4 sign + batch sheet + print CSS: 30–40
- SEO/OG per property + generator + sitemap + PWA + redirects: 20–30
- Panel: Properties (photos → WebP, ZIP export): 30–40
- Panel: Leads with parser + metrics + CSV: 15–20
- Panel: Agenda (calendar, WhatsApp, printing): 15–20
- Panel: Jobs (categories, workers, WhatsApp sending): 20–25
- Panel: Accounting (multi-currency, closes, CSV): 15–20
- Cross-cutting QA: accessibility, performance, tests, polish, README: 25–35
- **Total: 245–335 h** (≈ 7 to 9 full-time weeks)
