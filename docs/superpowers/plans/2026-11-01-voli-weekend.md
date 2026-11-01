# Voli Weekend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Webapp gratuita che mostra i voli weekend più economici da BRI/BDS (diretti e 1 scalo), aggiornata in background da GitHub Actions, con avvisi Telegram sotto gli 80 €.

**Architecture:** Script Node eseguiti da GitHub Actions interrogano Ryanair e Wizz (ogni 15 min) e Google Flights (ogni 4 h), filtrano gli itinerari e scrivono JSON su un branch `data` (un solo commit, sovrascritto con force-push). Una webapp statica PWA (HTML/JS puro, senza build) legge quei JSON da `raw.githubusercontent.com`; è pubblicata su GitHub Pages e servita in locale su `127.0.0.1:5190`.

**Tech Stack:** Node 24 (ESM, `fetch` nativo, `node:test`), `luxon` (fusi orari), `playwright` (solo Google Flights), HTML/CSS/JS vanilla, GitHub Actions, GitHub Pages, Telegram Bot API.
*Scelta di Claude: Node invece di Python, perché sul PC c'è Node 24 e Python non è installato; così gli stessi test girano in locale e su Actions.*

**Spec:** `docs/superpowers/specs/2026-11-01-voli-weekend-design.md`

## Global Constraints

- Partenze: solo `BRI`, `BDS`.
- Andata: venerdì con **partenza** ≥ `18:00`, oppure sabato a qualsiasi ora (ora locale `Europe/Rome`).
- Ritorno: domenica dello stesso weekend, **arrivo** ≤ `23:59` della domenica.
- Orizzonte: 8 weekend, finestra scorrevole.
- Prezzo: totale A/R ≤ `200` € per 1 adulto, solo bagaglio a mano piccolo (tariffa base).
- Scali: ≤ 1 per tratta, biglietto unico (no self-transfer), ogni scalo ≤ `180` minuti.
- Avvisi Telegram: totale A/R < `80` €, solo itinerari nuovi o con prezzo sceso.
- Refresh: diretti ogni 15 min (`*/15 * * * *`), scali ogni 4 h (`0 */4 * * *`).
- Costo zero; repo pubblico; nessun segreto nel codice (token Telegram solo in GitHub Secrets).
- Porta locale `5190`. **Mai** usare `5180` (gestionale SMOT).
- Tutti i tempi negli itinerari: stringhe ISO locali senza offset (`2026-11-06T18:30`), ora locale dell'aeroporto.
- Testo dell'interfaccia in italiano.

## Review Focus

1. **Fuso orario del runner (UTC)**: venerdì 18:00 e "domenica entro le 23:59" vanno valutati in ora locale, non UTC → test in Task 1 con `now` in UTC.
2. **Una fonte che fallisce** (Wizz bloccata, Google captcha): gli ultimi dati validi restano, marcati con età ed errore; le altre fonti non ne risentono → test in Task 5.
3. **Avvisi duplicati** quando lo stesso volo riappare a ogni giro allo stesso prezzo, o risale e riscende → test in Task 6.
4. **Ritorno che atterra dopo mezzanotte** (partenza domenica 23:10, arrivo lunedì 00:40): va escluso → test in Task 1.
5. **Weekend in corso**: sabato mattina il weekend corrente deve esserci ancora, ma senza voli già partiti → test in Task 1.

---

### Task 0: Repo, spike delle fonti e fixture

Prova reale degli endpoint prima di scrivere il resto. Lo spike è usa e getta, ma le risposte salvate diventano le fixture dei test.

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`
- Create: `spike/ryanair.mjs`, `spike/wizz.mjs`, `spike/google.mjs` (non testati)
- Create: `test/fixtures/ryanair-roundtrip.json`, `test/fixtures/wizz-map.json`, `test/fixtures/wizz-timetable.json`, `test/fixtures/google-explore.html`, `test/fixtures/google-detail.html` (o `.json` se lo spike trova un formato dati migliore)
- Create: `docs/sources.md`: per ogni fonte, URL, parametri, campi della risposta, limiti osservati

- [ ] **Step 1:** `git init`, branch `main`. `package.json` con `"type": "module"`, `"engines": {"node": ">=24"}`, script `"test": "node --test"`, dipendenze `luxon` e `playwright`. `.gitignore`: `node_modules/`, `data/`.
- [ ] **Step 2: Ryanair.** Chiamare `GET https://www.ryanair.com/api/farfnd/v4/roundTripFares` con `departureAirportIataCode=BRI`, `outboundDepartureDateFrom/To` = il prossimo venerdì, `outboundDepartureTimeFrom=18:00`, `outboundDepartureTimeTo=23:59`, `inboundDepartureDateFrom/To` = domenica, `priceValueTo=200`, `currency=EUR`, `adultPaxCount=1`, `market=it-it`. Verificare che la risposta contenga `fares[].outbound`, `fares[].inbound` e `summary.price`. Salvare la fixture. Se v4 non risponde, provare v3 e annotarlo.
- [ ] **Step 3: Wizz.** Leggere la versione API da `https://wizzair.com/buildnumber`, scaricare la mappa delle rotte (`/Api/asset/map`), poi la timetable (`/Api/search/timetable`) per una rotta da BRI. Salvare le fixture. Se è bloccata da protezioni anti-bot, annotarlo in `docs/sources.md` e proseguire: Wizz resta best effort.
- [ ] **Step 4: Google Flights.** Con Playwright (chromium headless, `hl=it`, `gl=IT`, `curr=EUR`) aprire la vista Esplora da BRI per un weekend con massimo 1 scalo. Trovare il modo più stabile di leggere destinazioni e prezzi (DOM o payload di rete). Poi aprire il dettaglio di una destinazione e leggere: segmenti, durata degli scali, flag di self-transfer, prezzo. Se compare la pagina di consenso cookie, scegliere "Rifiuta tutto". Salvare le fixture e documentare in `docs/sources.md` URL e selettori/percorso dei dati.
- [ ] **Step 5:** Mostrare a Bruno il riepilogo di `docs/sources.md` (cosa funziona e cosa no) prima di procedere.
- [ ] **Step 6: Commit** `chore: spike fonti e fixture`.

### Task 1: Finestra weekend e filtro itinerari

**Files:**
- Create: `src/model.js`, `src/weekends.js`, `src/filter.js`
- Test: `test/weekends.test.js`, `test/filter.test.js`

**Interfaces:**
- Produces, in `src/model.js` (JSDoc):
  ```js
  /** @typedef {{from:string,to:string,dep:string,arr:string,flight:string,airline:string}} Segment */
  /** @typedef {{segments:Segment[], selfTransfer:boolean}} Leg */
  /** @typedef {{id:string, source:'ryanair'|'wizz'|'google', origin:'BRI'|'BDS',
   *   destination:{code:string,city:string,country:string},
   *   outbound:Leg, inbound:Leg, price:number, currency:'EUR',
   *   bookingUrl:string, weekend:string, seenAt:string}} Itinerary */
  export function itineraryId(origin, outbound, inbound) // -> string
  ```
  `itineraryId` = `${origin}|${dest}|${out.segments[0].dep}|${in.segments[0].dep}|${tutti i flight uniti con '+'}`.
- Produces, in `src/weekends.js`: `upcomingWeekends(now: DateTime, count = 8) -> {friday:string, saturday:string, sunday:string}[]` (date `YYYY-MM-DD`).
- Produces, in `src/filter.js`: `CONSTRAINTS` (oggetto con i valori di Global Constraints), `isValid(it: Itinerary, now: DateTime) -> boolean`, `layoverMinutes(leg: Leg) -> number[]`.

Regola per la finestra (*scelta di Claude, raffina lo spec*): un weekend è incluso finché il suo sabato non è finito in ora `Europe/Rome`. I voli già partiti li esclude `isValid`.

- [ ] **Step 1: Test che falliscono.**
  - `upcomingWeekends` con `now = 2026-11-02T10:00Z` (lunedì) → 8 elementi, il primo `friday: '2026-11-06'`, l'ultimo `'2026-12-25'`.
  - `now = 2026-11-07T08:00Z` (sabato mattina) → il primo è ancora `'2026-11-06'`.
  - `now = 2026-11-07T23:30Z` (domenica 00:30 a Roma) → il primo è `'2026-11-13'`.
  - `isValid`: andata venerdì 18:00 → true; venerdì 17:59 → false; sabato 06:00 → true; ritorno domenica con arr `23:59` → true; ritorno partito domenica 23:10 con arrivo lunedì `00:40` → false; ritorno di sabato → false; ritorno della domenica del weekend successivo → false; prezzo `200` → true, `200.01` → false; origine `NAP` → false; 2 scali in una tratta → false; scalo di 181 minuti → false, di 180 → true; `selfTransfer: true` → false; andata già partita rispetto a `now` → false.
- [ ] **Step 2:** `npm test` → FAIL (moduli mancanti).
- [ ] **Step 3:** Implementare con `luxon`, zona `Europe/Rome` per la finestra. Gli orari degli itinerari sono già locali: confrontarli come date/ore locali.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: finestra weekend e filtro itinerari`.

### Task 2: Fonte Ryanair

**Files:**
- Create: `src/sources/ryanair.js`
- Test: `test/ryanair.test.js`

**Interfaces:**
- Consumes: `upcomingWeekends`, `itineraryId`, `Itinerary`.
- Produces: `buildRyanairQueries(weekends) -> {url:string}[]` e `parseRyanair(json, origin) -> Itinerary[]` (puri); `fetchRyanair(weekends, {fetchImpl = fetch}) -> Promise<Itinerary[]>`.

Query per ogni weekend × origine: (a) andata venerdì 18:00–23:59; (b) andata sabato 00:00–23:59; ritorno sempre domenica 00:00–23:59, `priceValueTo=200`. 8 × 2 × 2 = 32 richieste, in sequenza con pausa di 300–800 ms. `bookingUrl` = link alla ricerca ryanair.com con origine, destinazione e date precompilate (formato da `docs/sources.md`). `selfTransfer: false`, un segmento per tratta.

- [ ] **Step 1: Test che falliscono.** `buildRyanairQueries(upcomingWeekends(lunedì 2026-11-02))` → 32 URL; il primo contiene `departureAirportIataCode=BRI`, `outboundDepartureDateFrom=2026-11-06`, `outboundDepartureTimeFrom=18:00`, `inboundDepartureDateFrom=2026-11-08`. `parseRyanair(fixture,'BRI')` → itinerari con `source: 'ryanair'`, `price` uguale a `summary.price.value` della prima tariffa della fixture, `destination.code` uguale a `arrivalAirport.iataCode`. `fetchRyanair` con un `fetchImpl` finto che restituisce HTTP 500 → la promise viene rifiutata (l'errore lo gestisce il Task 5).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementare.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: fonte Ryanair`.

### Task 3: Fonte Wizz Air

**Files:**
- Create: `src/sources/wizz.js`
- Test: `test/wizz.test.js`

**Interfaces:**
- Produces: `parseWizzRoutes(mapJson, origins) -> string[]` (destinazioni servite da BRI/BDS), `pairWizzFares(outJson, inJson, origin, dest, weekends) -> Itinerary[]` (combina le andate di venerdì/sabato con i ritorni di domenica dello stesso weekend: prezzo = andata + ritorno); `fetchWizz(weekends, {fetchImpl}) -> Promise<Itinerary[]>`.

Una chiamata timetable per rotta copre tutto l'orizzonte (dal primo venerdì all'ultima domenica). Pausa di 0,5–1,5 s tra le rotte. Versione API letta a ogni esecuzione.

- [ ] **Step 1: Test che falliscono.** `parseWizzRoutes(fixture, ['BRI','BDS'])` → elenco non vuoto, senza duplicati. `pairWizzFares` con la fixture → nessuna coppia con andata e ritorno in weekend diversi; il prezzo di ogni itinerario è la somma dei due prezzi della fixture.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementare secondo `docs/sources.md`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: fonte Wizz Air`.

### Task 4: Fonte Google Flights (scali e diretti di altre compagnie)

**Files:**
- Create: `src/sources/google.js`
- Test: `test/google.test.js`

**Interfaces:**
- Produces: `parseExplore(raw) -> {destination:{code,city,country}, minPrice:number}[]`, `parseDetail(raw, origin, weekend) -> Itinerary[]` (puri, sulle fixture); `fetchGoogle(weekends, {browser}) -> Promise<Itinerary[]>`.

Flusso: per ogni weekend × origine × giorno di andata (venerdì/sabato), una pagina Esplora (max 1 scalo) → destinazioni con `minPrice ≤ 200` → una pagina di dettaglio ciascuna → itinerari. Un solo browser per esecuzione, pausa casuale di 2–5 s tra le pagine, timeout di 30 s per pagina. Se compare un captcha o un blocco, interrompere subito e lanciare `Error('google-blocked')` senza ritentare. `parseDetail` imposta `selfTransfer` dal flag "self-transfer"/"trasferimento autonomo"; a scartare ci pensa `isValid`.

- [ ] **Step 1: Test che falliscono.** `parseExplore(fixture)` → almeno una destinazione, ciascuna con `code` di 3 lettere e `minPrice` numerico. `parseDetail(fixture,'BRI','2026-11-06')` → itinerari `source: 'google'` con segmenti che hanno `dep`/`arr` in formato `YYYY-MM-DDTHH:mm`, e un itinerario con scalo con `segments.length === 2`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementare secondo `docs/sources.md`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: fonte Google Flights`.

### Task 5: Store dei dati e runner

**Files:**
- Create: `src/store.js`, `src/run.js`
- Test: `test/store.test.js`

**Interfaces:**
- Produces, in `src/store.js`: `mergeSource(prevFile|null, sourceName, result, now) -> File` con
  `result = {ok:true, itineraries} | {ok:false, error:string}` e
  `File = {generatedAt:string, sources:{[name]:{status:'ok'|'error', error:string|null, lastSuccessAt:string|null}}, itineraries:Itinerary[]}`.
  In caso di errore: si tengono gli itinerari precedenti di quella fonte, `status:'error'`, `lastSuccessAt` invariato. Gli itinerari sono deduplicati per `id` (vince il prezzo più basso), filtrati con `isValid(it, now)` e ordinati per prezzo.
- Produces, in `src/run.js`: CLI `node src/run.js direct|connections --data <dir>`. `direct` usa Ryanair + Wizz e scrive `<dir>/direct.json`; `connections` usa Google e scrive `<dir>/connections.json`. Ogni fonte gira in `try/catch` separato. Poi chiama `processAlerts` (Task 6). Esce con codice 0 anche se una fonte fallisce; con codice 1 solo se falliscono tutte.

- [ ] **Step 1: Test che falliscono.** Ryanair ok + Wizz in errore con un file precedente che contiene itinerari Wizz → gli itinerari Wizz restano, `sources.wizz.status === 'error'`, `sources.wizz.lastSuccessAt` uguale a quello precedente, `sources.ryanair.status === 'ok'`. Due itinerari con lo stesso `id` a 90 € e 85 € → ne resta uno, a 85 €. Un itinerario già partito rispetto a `now` → rimosso. Primo giro senza file precedente e fonte in errore → `itineraries: []`, `lastSuccessAt: null`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementare.
- [ ] **Step 4:** `npm test` → PASS. Poi una prova reale in locale: `node src/run.js direct --data ./data` → `data/direct.json` con itinerari Ryanair veri.
- [ ] **Step 5: Commit** `feat: store dati e runner`.

### Task 6: Avvisi Telegram

**Files:**
- Create: `src/alerts.js`, `src/telegram.js`
- Test: `test/alerts.test.js`

**Interfaces:**
- Produces: `selectAlerts(itineraries, state, threshold = 80) -> {toSend:Itinerary[], nextState}` con `state = {[id]:{price:number, alertedAt:string, weekend:string}}`; `formatAlert(it) -> string`; `sendTelegram(text, {token, chatId, fetchImpl}) -> Promise<void>`; `processAlerts(dataDir, itineraries, env, now)` legge e scrive `<dataDir>/alerts_state.json`; CLI `node src/telegram.js --test` invia `"Voli Weekend: test avvisi OK"` usando le variabili d'ambiente.

Regole: si invia se `price < 80` e (`id` non è nello stato, oppure `price < state[id].price`). Dopo l'invio lo stato prende il nuovo prezzo; un prezzo che sale aggiorna lo stato al rialzo senza inviare, così una successiva discesa viene notificata. Le voci dei weekend passati vengono eliminate. Se mancano `TELEGRAM_BOT_TOKEN` o `TELEGRAM_CHAT_ID`, si registra un log e non si invia nulla (nessun errore). `formatAlert` include città e paese, date del weekend, orari di andata e ritorno, compagnia, "diretto" oppure "1 scalo (via XXX, 1h40)", prezzo, link.

- [ ] **Step 1: Test che falliscono.** Itinerario nuovo a 79 € → inviato. Stesso itinerario ancora a 79 € → non inviato. Sceso a 70 € → inviato. Risalito a 75 € → non inviato, lo stato diventa 75. Riscende a 72 € → inviato. A 80 € esatti → non inviato. Voce dello stato con weekend passato → rimossa da `nextState`. `formatAlert` di un itinerario con scalo contiene `"1 scalo"` e il codice dell'aeroporto di scalo.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementare (`sendTelegram` con `POST https://api.telegram.org/bot<token>/sendMessage`, `parse_mode: 'HTML'`).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: avvisi Telegram`.

### Task 7: Webapp PWA

Prima di scrivere l'interfaccia usare la skill `impeccable:impeccable` per la direzione visiva. Deve essere chiara su schermo da PC e da iPhone.

**Files:**
- Create: `web/index.html`, `web/style.css`, `web/app.js`, `web/view.js`, `web/config.js`, `web/manifest.webmanifest`, `web/sw.js`, `web/icons/icon-192.png`, `web/icons/icon-512.png`, `web/icons/apple-touch-icon.png`, `web/sample/direct.json`, `web/sample/connections.json`
- Test: `test/view.test.js`

**Interfaces:**
- Consumes: il formato `File` del Task 5.
- Produces, in `web/view.js` (modulo puro, importabile anche da Node): `combine(direct:File, connections:File) -> Itinerary[]`, `groupByWeekend(its) -> {weekend:string, items:Itinerary[]}[]`, `applyFilters(its, {origin?:'BRI'|'BDS', directOnly?:boolean, maxPrice?:number, airline?:string}) -> Itinerary[]`, `freshness(source, now) -> {label:string, stale:boolean}`.
- `web/config.js`: `export const DATA_BASE_URL = 'https://raw.githubusercontent.com/<USERNAME>/voli-weekend/data/'`. Con `?sample=1` nell'URL si usa invece `./sample/`.

Comportamento: per ogni weekend, le destinazioni dalla più economica; badge "diretto" o "1 scalo"; filtri per aeroporto, diretto/scalo, prezzo massimo e compagnia, ricordati in `localStorage` dentro `try/catch`. Freschezza mostrata per ogni fonte. È `stale` se `lastSuccessAt` ha più di 45 min (diretti) o più di 9 h (scali), oppure se lo stato è `error`: in quel caso un avviso ben visibile. La pagina ricarica i dati ogni 5 minuti e quando torna in primo piano. La nota "tariffa base, solo bagaglio a mano piccolo" è sempre visibile. Il service worker mette in cache l'interfaccia (cache-first) ma **non** i JSON dei dati (sempre dalla rete, con l'ultima risposta come riserva offline). Meta iOS: `apple-mobile-web-app-capable`, `apple-touch-icon`, `theme-color`. Formato per prezzi e date: `it-IT`.

- [ ] **Step 1: Test che falliscono.** `combine` unisce e deduplica per `id` tra i due file. `groupByWeekend` ordina i weekend per data e gli itinerari per prezzo. `applyFilters({directOnly:true})` esclude gli itinerari con più di un segmento in una tratta. `freshness` con `lastSuccessAt` di 50 min fa sulla fonte `ryanair` → `stale: true`; di 10 min fa → `stale: false`, `label: 'aggiornato 10 min fa'`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementare `view.js`, poi la pagina. Generare i dati di esempio in `web/sample/` da un giro reale del Task 5.
- [ ] **Step 4:** `npm test` → PASS. Aprire `http://127.0.0.1:5190/?sample=1` (con il server del Task 8) e controllare con il browser integrato, sia a larghezza desktop sia a larghezza mobile: elenco, filtri, freschezza, nessun errore in console.
- [ ] **Step 5: Commit** `feat: webapp PWA`.

### Task 8: Server locale su 5190

**Files:**
- Create: `scripts/serve.js`, `Avvia Voli Weekend.cmd`
- Test: `test/serve.test.js`

**Interfaces:**
- Produces: `createServer({root = 'web', port = 5190, host = '127.0.0.1'}) -> http.Server`; avvio da CLI con `node scripts/serve.js`. Se `port === 5180` lancia `Error('porta 5180 riservata a SMOT')`. Se la porta è occupata, stampa un messaggio chiaro ed esce, senza ripiegare su un'altra porta. Content-Type corretti per `.webmanifest`, `.js`, `.png`. Blocca i path traversal (`..`).
- `Avvia Voli Weekend.cmd`: `cd` nella cartella del progetto, avvia il server in una finestra ridotta a icona e apre `http://127.0.0.1:5190`.

- [ ] **Step 1: Test che falliscono.** Il server su una porta di test serve `index.html` con stato 200. `/manifest.webmanifest` ha `Content-Type: application/manifest+json`. `/../package.json` → 403 o 404. `createServer({port:5180})` lancia un errore.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementare con `node:http` e `node:fs`, senza dipendenze.
- [ ] **Step 4:** `npm test` → PASS. Avviare `Avvia Voli Weekend.cmd` e verificare che `http://127.0.0.1:5190` si apra e che `http://127.0.0.1:5180` (SMOT) risponda ancora come prima.
- [ ] **Step 5: Commit** `feat: server locale su 5190`.

### Task 9: GitHub Actions, Pages e messa online

Richiede passaggi che fa Bruno, segnati con **[BRUNO]**: Claude non inserisce password né token.

**Files:**
- Create: `.github/workflows/test.yml` (su push/PR: `npm ci && npm test`)
- Create: `.github/workflows/direct.yml` (`cron: '*/15 * * * *'` + `workflow_dispatch`)
- Create: `.github/workflows/connections.yml` (`cron: '0 */4 * * *'` + `workflow_dispatch`; installa `npx playwright install --with-deps chromium`)
- Create: `.github/workflows/pages.yml` (su push a `main` con modifiche in `web/**`: pubblica `web/` con `actions/upload-pages-artifact` + `actions/deploy-pages`)
- Create: `.github/workflows/keepalive.yml` (`cron: '0 6 1 * *'`: `gh workflow enable` su `direct.yml` e `connections.yml`, permesso `actions: write`)
- Modify: `web/config.js` (username vero), `README.md` (guida d'uso in italiano)

Flusso comune di `direct.yml` e `connections.yml`: `concurrency: {group: data-branch, cancel-in-progress: false}`; checkout di `main`; checkout del branch `data` in `./data` (se non esiste, crearlo orfano); `node src/run.js <mode> --data ./data` con `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` dai Secrets; poi in `./data` `git add -A && git commit --amend` (o il primo commit) e `git push --force`. Il branch `data` ha sempre un solo commit. `permissions: contents: write`. Timeout: 10 min per `direct`, 30 per `connections`.

- [ ] **Step 1:** Scrivere i workflow. Verificare la sintassi con `npx --yes @action-validator/cli` su ogni file → nessun errore.
- [ ] **Step 2 [BRUNO]:** Creare su GitHub il repository **pubblico** `voli-weekend`, vuoto (senza README).
- [ ] **Step 3:** Impostare `web/config.js` con lo username, aggiungere il remote, `git push -u origin main`. **[BRUNO]** completa il login nella finestra di Git Credential Manager che si apre.
- [ ] **Step 4 [BRUNO]:** Su Telegram, in chat con `@BotFather`: `/newbot` e salvare il token. Scrivere un messaggio al proprio bot. Claude indica come ricavare il `chat_id` da `getUpdates`, che Bruno apre nel proprio browser.
- [ ] **Step 5 [BRUNO]:** Nel repo, **Settings → Secrets and variables → Actions**: aggiungere `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`. Poi **Settings → Pages → Source: GitHub Actions**.
- [ ] **Step 6:** Lanciare a mano `direct` e `connections` (`workflow_dispatch`) e il deploy di Pages. Verificare: esiste il branch `data` con `direct.json`, `connections.json` e `alerts_state.json`; `https://<USERNAME>.github.io/voli-weekend/` mostra dati veri; la webapp locale su 5190 mostra gli stessi dati; arriva un messaggio di prova su Telegram (`node src/telegram.js --test`, eseguito una volta da `workflow_dispatch`).
- [ ] **Step 7:** Dopo un'ora, controllare che `direct` sia girato da solo almeno 3 volte e quanto ritardo abbia avuto rispetto ai 15 minuti. Riportare a Bruno i tempi reali.
- [ ] **Step 8: Commit** `ci: workflow ricerca, pages e keepalive`.

### Task 10 (dopo l'uso su PC): installazione su iPhone

- [ ] **Step 1:** Spiegare a Bruno come aprire `https://<USERNAME>.github.io/voli-weekend/` in Safari, toccare Condividi → "Aggiungi alla schermata Home" e verificare che l'app si apra a schermo intero con l'icona.
