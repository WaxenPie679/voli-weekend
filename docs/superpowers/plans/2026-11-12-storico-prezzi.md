# Storico prezzi (tappa 1: raccolta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una raccolta giornaliera, su GitHub Actions, del prezzo più basso di ogni data di partenza (fino a 12 mesi) per tutte le tratte Ryanair e Wizz da e per BRI/BDS, salvando solo i cambiamenti sul branch `history`.

**Architecture:** Moduli puri in `src/history/` (lettura delle risposte → osservazioni; stato e differenze; raccolta con pause e gestione 429; scrittura dei file del giorno), un CLI `src/history/run.js`, un workflow `history.yml` che lavora in un worktree del branch `history` e fa un commit nuovo al giorno. Lo "stato più recente" si ricostruisce rileggendo tutti i file giornalieri (nessun file di stato riscritto ogni giorno). Il check-up esistente legge i `.meta.json` pubblicati.

**Tech Stack:** Node 24 (ES modules), `node:test`, `node:zlib` (gzip), luxon, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-12-storico-prezzi-design.md`

## Global Constraints

- Node `>=24`, moduli ES, test con `node --test "test/**/*.test.js"`; nessuna nuova dipendenza npm.
- Codice, commenti, log e messaggi in italiano, nello stile dei file esistenti (JSDoc brevi, funzioni pure esportate e testate).
- Aeroporti: `CONSTRAINTS.origins` da `src/filter.js` (BRI, BDS). Compagnie: `ryanair`, `wizz`.
- Orizzonte: dal giorno di Roma (`todayRome()` in `src/weekends.js`) a 12 mesi. Ryanair: 12 mesi di calendario a partire dal mese corrente. Wizz: finestre consecutive `from`…`from+29 giorni` a partire da oggi; l'ultima ha `to` tagliato a oggi+365 (13 finestre).
- Stati ammessi: `prezzo`, `esaurito`, `da_verificare`, `nessun_volo`. CSV: intestazione esatta `compagnia,origine,destinazione,data_partenza,stato,prezzo`; prezzo vuoto se assente.
- Wizz va chiamata col `fetch` di Node (con curl la timetable risponde vuota). Pause: Ryanair 500–1000 ms, Wizz 500–1500 ms (`jitter` da `src/util.js`); 0 nei test.
- Non modificare `data`, `direct.yml`, `connections.yml`, `scripts/publish-data.sh`. Niente porta 5180.
- Branch `history`: commit che si accumulano (mai `--amend`, mai force push).

## Review Focus

1. **Tratta che fallisce a metà** (es. 3 mesi su 12 in errore): le date dei mesi falliti non devono diventare `nessun_volo`; solo i mesi riusciti entrano nella copertura. → test in Task 2 (`diffState` con copertura parziale) e Task 3.
2. **429 ripetuti**: la compagnia si ferma, le tratte restanti risultano non raccolte, l'altra compagnia continua, il giro salva quanto raccolto. → test in Task 3.
3. **Secondo giro nello stesso giorno** (avvio manuale): non perde le righe del primo giro e non duplica cambiamenti già scritti. → test in Task 4.
4. **Primo giro in assoluto** (branch `history` inesistente, cartella vuota): scrive tutte le osservazioni come cambiamenti. → test in Task 4; script in Task 5 crea il branch orfano.
5. **Date già passate nello stato**: non generano righe `nessun_volo` né vengono riemesse. → test in Task 2.

---

### Task 1: Lettura delle risposte in osservazioni

**Files:**
- Create: `src/history/observe.js`
- Test: `test/history-observe.test.js`

**Interfaces:**
- Consumes: niente.
- Produces:
  - `/** @typedef {{airline:'ryanair'|'wizz', origin:string, dest:string, date:string, state:'prezzo'|'esaurito'|'da_verificare'|'nessun_volo', price:number|null}} Obs */`
  - `parseRyanairRoutes(json: any[], origin: string): {airline:'ryanair', origin:string, code:string, city:string, country:string}[]` — esclude le voci con `connectingAirport` non nullo; `code = arrivalAirport.code`, `city = arrivalAirport.city.name`, `country = arrivalAirport.country.name`.
  - `parseRyanairDays(json, origin: string, dest: string, today: string): Obs[]` — da `outbound.fares[]`, salta `day < today`.
  - `parseWizzDays(list: any[], origin: string, dest: string, today: string): Obs[]` — `list` è `outboundFlights` o `returnFlights`; data = `departureDate.slice(0,10)`, salta `< today`.

- [ ] **Step 1: Write the failing tests**

```js
// test/history-observe.test.js
test('parseRyanairDays: prezzo, esaurito, nessun volo; salta i giorni passati', () => {
  const json = { outbound: { fares: [
    { day: '2026-11-11', price: { value: 20 }, soldOut: false, unavailable: false },
    { day: '2026-11-12', price: { value: 35.51 }, soldOut: false, unavailable: false },
    { day: '2026-11-13', price: { value: 50 }, soldOut: true, unavailable: false },
    { day: '2026-11-14', price: null, soldOut: false, unavailable: true },
    { day: '2026-11-15', price: null, soldOut: false, unavailable: false },
  ] } };
  assert.deepEqual(parseRyanairDays(json, 'BDS', 'TRN', '2026-11-12'), [
    { airline: 'ryanair', origin: 'BDS', dest: 'TRN', date: '2026-11-12', state: 'prezzo', price: 35.51 },
    { airline: 'ryanair', origin: 'BDS', dest: 'TRN', date: '2026-11-13', state: 'esaurito', price: null },
    { airline: 'ryanair', origin: 'BDS', dest: 'TRN', date: '2026-11-14', state: 'nessun_volo', price: null },
    { airline: 'ryanair', origin: 'BDS', dest: 'TRN', date: '2026-11-15', state: 'nessun_volo', price: null },
  ]);
});

test('parseWizzDays: prezzo, da verificare con prezzo indicativo, zero senza voli', () => {
  const day = (d, amount, priceType, original, deps) => ({ departureDate: `${d}T00:00:00`, price: { amount }, priceType,
    originalPrice: original == null ? null : { amount: original }, departureDates: deps });
  const list = [day('2026-11-12', 29.99, 'price', 29.99, ['2026-11-12T15:20:00']),
    day('2026-11-13', 0, 'checkPrice', 105.99, ['2026-11-13T15:35:00']),
    day('2026-11-14', 0, 'checkPrice', null, ['2026-11-14T15:35:00']),
    day('2026-11-15', 0, 'price', null, [])];
  assert.deepEqual(parseWizzDays(list, 'BRI', 'BUD', '2026-11-12').map((o) => [o.date, o.state, o.price]), [
    ['2026-11-12', 'prezzo', 29.99], ['2026-11-13', 'da_verificare', 105.99],
    ['2026-11-14', 'da_verificare', null], ['2026-11-15', 'nessun_volo', null]]);
});

test('parseWizzDays sul fixture reale: BRI→BUD 2026-11-08 è da verificare a 105.99', () => {
  const tt = JSON.parse(readFileSync(new URL('./fixtures/wizz-timetable.json', import.meta.url)));
  const o = parseWizzDays(tt.outboundFlights, 'BRI', 'BUD', '2026-11-01').find((x) => x.date === '2026-11-08');
  assert.deepEqual([o.state, o.price], ['da_verificare', 105.99]);
});

test('parseRyanairRoutes esclude le tratte con scalo', () => {
  const r = (code, connectingAirport = null) => ({ arrivalAirport: { code, city: { name: code + ' città' }, country: { name: 'Italia' } }, connectingAirport });
  assert.deepEqual(parseRyanairRoutes([r('TRN'), r('XXX', { code: 'BGY' })], 'BDS'),
    [{ airline: 'ryanair', origin: 'BDS', code: 'TRN', city: 'TRN città', country: 'Italia' }]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/history-observe.test.js`
Expected: FAIL (modulo `src/history/observe.js` non trovato).

- [ ] **Step 3: Implement the three functions in `src/history/observe.js`**

Regole degli stati. Ryanair: `soldOut` → `esaurito`; `unavailable` o `price` nullo → `nessun_volo`; altrimenti `prezzo` con `price.value`. Wizz: `price.amount > 0` → `prezzo`; importo 0 con `departureDates` non vuoto → `da_verificare` con `originalPrice?.amount || null`; importo 0 senza partenze → `nessun_volo`.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/history-observe.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/history/observe.js test/history-observe.test.js
git commit -m "feat(storico): lettura dei prezzi giornalieri di Ryanair e Wizz"
```

---

### Task 2: Stato, differenze e file CSV compressi

**Files:**
- Create: `src/history/store.js`
- Test: `test/history-store.test.js`

**Interfaces:**
- Consumes: `Obs` (Task 1).
- Produces:
  - `/** @typedef {{airline:string, origin:string, dest:string, from:string, to:string}} Coverage */` — intervallo di date (incluso) che una richiesta riuscita ha coperto per una tratta e direzione.
  - `obsKey(o): string` → `${airline}|${origin}|${dest}|${date}`.
  - `encodeCsv(rows: Obs[]): Buffer` (gzip) e `decodeCsv(buf: Buffer): Obs[]` — intestazione `compagnia,origine,destinazione,data_partenza,stato,prezzo`; prezzo come numero o `null`.
  - `replayState(rowsInOrder: Obs[]): Map<string, Obs>` — l'ultima riga per chiave vince.
  - `diffState(state: Map<string,Obs>, observations: Obs[], coverage: Coverage[], today: string): Obs[]` — righe da scrivere, ordinate per chiave.

- [ ] **Step 1: Write the failing tests**

```js
// test/history-store.test.js
const o = (date, state, price = null, dest = 'TRN') => ({ airline: 'ryanair', origin: 'BDS', dest, date, state, price });
const cov = (from, to, dest = 'TRN') => ({ airline: 'ryanair', origin: 'BDS', dest, from, to });

test('encodeCsv/decodeCsv: andata e ritorno identici, intestazione esatta', () => {
  const rows = [o('2026-12-01', 'prezzo', 35.51), o('2026-12-02', 'esaurito')];
  const buf = encodeCsv(rows);
  assert.equal(gunzipSync(buf).toString().split('\n')[0], 'compagnia,origine,destinazione,data_partenza,stato,prezzo');
  assert.deepEqual(decodeCsv(buf), rows);
});

test('replayState: vince l’ultima riga per chiave', () => {
  const s = replayState([o('2026-12-01', 'prezzo', 30), o('2026-12-01', 'prezzo', 40)]);
  assert.equal(s.get('ryanair|BDS|TRN|2026-12-01').price, 40);
});

test('diffState: scrive solo nuovi e cambiati', () => {
  const state = replayState([o('2026-12-01', 'prezzo', 30), o('2026-12-02', 'prezzo', 30)]);
  const rows = diffState(state, [o('2026-12-01', 'prezzo', 30), o('2026-12-02', 'prezzo', 45), o('2026-12-03', 'esaurito')], [cov('2026-12-01', '2026-12-31')], '2026-11-12');
  assert.deepEqual(rows.map((r) => [r.date, r.state, r.price]), [['2026-12-02', 'prezzo', 45], ['2026-12-03', 'esaurito', null]]);
});

test('diffState: data sparita in un intervallo coperto → nessun_volo; fuori copertura → niente', () => {
  const state = replayState([o('2026-12-05', 'prezzo', 30), o('2027-01-05', 'prezzo', 30)]);
  const rows = diffState(state, [], [cov('2026-12-01', '2026-12-31')], '2026-11-12');
  assert.deepEqual(rows.map((r) => [r.date, r.state, r.price]), [['2026-12-05', 'nessun_volo', null]]);
});

test('diffState: già nessun_volo non si riscrive; date passate ignorate', () => {
  const state = replayState([o('2026-12-05', 'nessun_volo'), o('2026-11-10', 'prezzo', 30)]);
  assert.deepEqual(diffState(state, [], [cov('2026-11-01', '2026-12-31')], '2026-11-12'), []);
});

test('diffState: una tratta non osservata oggi non genera righe', () => {
  const state = replayState([o('2026-12-05', 'prezzo', 30, 'MXP')]);
  assert.deepEqual(diffState(state, [], [cov('2026-12-01', '2026-12-31', 'TRN')], '2026-11-12'), []);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/history-store.test.js` → FAIL (modulo mancante).

- [ ] **Step 3: Implement the functions in `src/history/store.js`**

`encodeCsv` con `gzipSync`, `decodeCsv` con `gunzipSync`; i campi non contengono virgole (codici IATA, date, stati), niente escaping. `diffState` segue questo algoritmo:

```
righe = []
per ogni osservazione: prev = state[chiave]; se !prev o stato/prezzo diversi → righe += osservazione
visti = chiavi delle osservazioni
per ogni prev nello stato:
  se prev.date < today, o prev.state == 'nessun_volo', o visti ha la chiave → salta
  se esiste una copertura con stessa compagnia/origine/destinazione e from <= prev.date <= to
    → righe += {…prev, state:'nessun_volo', price:null}
ordina per chiave
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/history-store.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/history/store.js test/history-store.test.js
git commit -m "feat(storico): stato, differenze e CSV compressi"
```

---

### Task 3: Raccolta da Ryanair e Wizz con pause e gestione dei 429

**Files:**
- Create: `src/history/collect.js`
- Test: `test/history-collect.test.js`

**Interfaces:**
- Consumes: `parseRyanairRoutes`, `parseRyanairDays`, `parseWizzDays` (Task 1); `wizzVersion`, `parseWizzRoutes` da `src/sources/wizz.js`; `jitter` da `src/util.js`; `CONSTRAINTS.origins`.
- Produces:
  - `/** @typedef {{routesExpected:number, routesOk:number, requestsOk:number, requestsFailed:number, missing:string[], stoppedReason:string|null}} AirlineMeta */` — `missing` voci come `"BRI-TRN 2027-02"` (Ryanair, una per direzione e mese) o `"BRI-BUD 2026-12-01"` (Wizz, una per finestra), oppure `"BRI-TRN"` per tratte non tentate dopo uno stop. Una tratta conta in `routesOk` se tutte le sue richieste (entrambe le direzioni) sono riuscite.
  - `/** @typedef {{airline:string, origin:string, code:string, city:string, country:string}} RouteInfo */`
  - `collectRyanair(today: string, opts): Promise<{observations:Obs[], coverage:Coverage[], routes:RouteInfo[], meta:AirlineMeta}>`
  - `collectWizz(today: string, opts): Promise<…stessa forma…>`
  - `opts = { fetchImpl = fetch, pauseMs = true, log = console.log, maxRoutes = Infinity, retryBaseMs = 30000 }` — `pauseMs:false` nei test; `maxRoutes` limita le tratte per le prove locali.
  - `fetchRetry(fetchImpl, url, init, { retries = 3, baseMs = 30000 }): Promise<any>` — su HTTP 429 attende `baseMs × 2^tentativo` e riprova; esauriti i tentativi lancia un errore con `err.rateLimited = true`; altri status non ok lanciano subito `HTTP <status>`.

- [ ] **Step 1: Write the failing tests**

Usare un `fetchImpl` finto che risponde per URL (`routes/it/airport/BRI`, `cheapestPerDay`, `asset/map`, `search/timetable`, home Wizz) e conta le chiamate.

```js
test('collectRyanair: entrambe le direzioni, 12 mesi, copertura per mese riuscito', async () => {
  // 1 tratta BRI-TRN, nessuna da BDS; ogni cheapestPerDay restituisce 1 giorno con prezzo 40
  const r = await collectRyanair('2026-11-12', { fetchImpl: fake, pauseMs: false, log: () => {} });
  assert.equal(calls.filter((u) => u.includes('cheapestPerDay')).length, 24);           // 2 direzioni × 12 mesi
  assert.ok(calls.some((u) => u.includes('/BRI/TRN/') && u.includes('2026-11-01')));
  assert.ok(calls.some((u) => u.includes('/TRN/BRI/') && u.includes('2027-10-01')));
  assert.deepEqual(r.coverage.find((c) => c.origin === 'TRN' && c.from === '2026-11-12'), { airline: 'ryanair', origin: 'TRN', dest: 'BRI', from: '2026-11-12', to: '2026-11-30' });
  assert.deepEqual([r.meta.routesExpected, r.meta.routesOk, r.meta.requestsFailed], [1, 1, 0]);
});

test('collectRyanair: un mese in errore → niente copertura per quel mese, tratta non ok', async () => {
  // il fake restituisce HTTP 500 per /BRI/TRN/ con outboundMonthOfDate=2027-02-01
  const r = await collectRyanair('2026-11-12', { fetchImpl: fake500, pauseMs: false, log: () => {} });
  assert.ok(!r.coverage.some((c) => c.origin === 'BRI' && c.from.startsWith('2027-02')));
  assert.deepEqual(r.meta.missing, ['BRI-TRN 2027-02']);
  assert.deepEqual([r.meta.routesOk, r.meta.requestsFailed], [0, 1]);
});

test('collectRyanair: 429 continui → stop della compagnia, tratte restanti in missing', async () => {
  // 2 tratte (TRN, MXP); ogni cheapestPerDay risponde 429
  const r = await collectRyanair('2026-11-12', { fetchImpl: fake429, pauseMs: false, retryBaseMs: 0, log: () => {} });
  assert.equal(r.meta.stoppedReason, '429');
  assert.ok(r.meta.missing.includes('BRI-MXP'));
  assert.equal(r.meta.routesOk, 0);
});

test('collectRyanair: elenco tratte non scaricabile → routesExpected 0 e motivo', async () => {
  const r = await collectRyanair('2026-11-12', { fetchImpl: fakeRoutes500, pauseMs: false, log: () => {} });
  assert.equal(r.meta.routesExpected, 0);
  assert.match(r.meta.stoppedReason, /elenco tratte/);
});

test('collectWizz: finestre di 30 giorni fino a oggi+365, andata e ritorno nella stessa richiesta', async () => {
  const r = await collectWizz('2026-11-12', { fetchImpl: fakeWizz, pauseMs: false, log: () => {} });
  const bodies = timetableBodies.map((b) => b.flightList);
  assert.equal(bodies.length, 13);
  assert.deepEqual(bodies[0].map((f) => [f.departureStation, f.arrivalStation, f.from, f.to]),
    [['BRI', 'BUD', '2026-11-12', '2026-12-11'], ['BUD', 'BRI', '2026-11-12', '2026-12-11']]);
  assert.ok(bodies.at(-1)[0].to <= '2027-11-12');
  assert.equal(r.coverage.length, 26);                                                    // 13 finestre × 2 direzioni
});

test('fetchRetry: 429 poi 200 → risultato; 404 → errore subito', async () => { /* … */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/history-collect.test.js` → FAIL.

- [ ] **Step 3: Implement `fetchRetry`, `collectRyanair`, `collectWizz` in `src/history/collect.js`**

Endpoint (dalla spec, sezione 6): Ryanair `https://www.ryanair.com/api/views/locate/searchWidget/routes/it/airport/{origin}` e `https://www.ryanair.com/api/farfnd/v4/oneWayFares/{da}/{a}/cheapestPerDay?outboundMonthOfDate=YYYY-MM-01&currency=EUR`; Wizz come `fetchWizz` esistente (versione, `asset/map?languageCode=it-it`, `POST search/timetable` con `priceType:'regular', adultCount:1, childCount:0, infantCount:0`). Copertura Ryanair per mese: `from = max(primo del mese, today)`, `to = ultimo del mese`. Copertura Wizz per finestra: `from`…`to` della richiesta, una per direzione. Una tratta con lo stesso codice da BRI e BDS sono due tratte distinte. Un errore `rateLimited` interrompe la compagnia (`stoppedReason: '429'`) e mette in `missing` le tratte non ancora tentate; gli altri errori saltano solo quella richiesta. Log di riepilogo per compagnia.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/history-collect.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/history/collect.js test/history-collect.test.js
git commit -m "feat(storico): raccolta giornaliera da Ryanair e Wizz con gestione dei limiti"
```

---

### Task 4: Giro giornaliero: file del giorno, meta, tratte e CLI

**Files:**
- Create: `src/history/run.js`
- Modify: `package.json` (script `"history": "node src/history/run.js --dir ./history"`), `.gitignore` (aggiungere `history/`)
- Test: `test/history-run.test.js`

**Interfaces:**
- Consumes: `collectRyanair`, `collectWizz` (Task 3); `encodeCsv`, `decodeCsv`, `replayState`, `diffState` (Task 2); `todayRome`.
- Produces (usato dal Task 6 e dal workflow):
  - Layout della cartella (= radice del branch `history`): `YYYY/MM/YYYY-MM-DD.csv.gz`, `YYYY/MM/YYYY-MM-DD.meta.json`, `routes.json`.
  - Meta: `{ day:'YYYY-MM-DD', startedAt:ISO, finishedAt:ISO, rowsWritten:number, airlines:{ ryanair:AirlineMeta & {notListed:string[]}, wizz:… } }` — `notListed`: tratte (`"BRI-TRN"`) presenti in `routes.json` ma assenti dall'elenco di oggi, solo se l'elenco di quella compagnia è stato scaricato (spec 7.2: "non osservata").
  - `routes.json`: oggetto con chiave `${airline}|${origin}|${code}` → `{airline, origin, code, city, country, firstSeen:'YYYY-MM-DD', lastSeen:'YYYY-MM-DD'}`; si riscrive solo se cambia.
  - `runHistory(dir: string, { now = DateTime.now(), collectors = { ryanair: collectRyanair, wizz: collectWizz }, collectOpts = {}, log = console.log } = {}): Promise<number>` — codice d'uscita: 1 se nessuna compagnia ha `routesOk > 0`, altrimenti 0.
  - CLI: `node src/history/run.js --dir <cartella> [--max-routes N]`.

- [ ] **Step 1: Write the failing tests** (cartella temporanea con `mkdtemp`, collettori finti che restituiscono osservazioni fisse)

```js
test('runHistory primo giro: scrive tutte le osservazioni, meta e tratte', async () => {
  const code = await runHistory(dir, { now: NOW /* 2026-11-12T04:00Z */, collectors: fakeCollectors([obsA, obsB]), log: () => {} });
  assert.equal(code, 0);
  assert.deepEqual(decodeCsv(readFileSync(join(dir, '2026/11/2026-11-12.csv.gz'))), [obsA, obsB]);
  const meta = JSON.parse(readFileSync(join(dir, '2026/11/2026-11-12.meta.json')));
  assert.equal(meta.day, '2026-11-12'); assert.equal(meta.rowsWritten, 2); assert.ok(meta.airlines.ryanair && meta.airlines.wizz);
  assert.equal(JSON.parse(readFileSync(join(dir, 'routes.json')))['ryanair|BRI|TRN'].firstSeen, '2026-11-12');
});

test('runHistory giorno dopo: solo i cambiamenti, i file del giorno prima non cambiano', async () => {
  // giro 1 il 12 con obsA(40 €), giro 2 il 13 con obsA(45 €)
  const before = readFileSync(join(dir, '2026/11/2026-11-12.csv.gz'));
  await runHistory(dir, { now: NOW.plus({ days: 1 }), collectors: fakeCollectors([{ ...obsA, price: 45 }]), log: () => {} });
  assert.deepEqual(readFileSync(join(dir, '2026/11/2026-11-12.csv.gz')), before);
  assert.deepEqual(decodeCsv(readFileSync(join(dir, '2026/11/2026-11-13.csv.gz'))).map((r) => r.price), [45]);
});

test('runHistory secondo giro nello stesso giorno: conserva le righe del primo e aggiunge solo le nuove', async () => {
  // giro 1: obsA 40; giro 2 stesso giorno: obsA 40, obsB nuovo → file del giorno = [obsA, obsB], senza duplicati
});

test('runHistory: nessuna compagnia riuscita → codice 1, meta scritto comunque', async () => { /* … */ });

test('runHistory: tratta sparita dall’elenco → in notListed, nessuna riga, lastSeen invariato', async () => { /* … */ });
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/history-run.test.js` → FAIL.

- [ ] **Step 3: Implement `runHistory` and the CLI in `src/history/run.js`**

Ordine: elenca tutti i `*.csv.gz` della cartella ordinati per nome (il nome è la data), li decodifica in ordine e fa `replayState` (incluso il file di oggi, se esiste da un giro precedente dello stesso giorno); esegue i collettori uno dopo l'altro (se un collettore lancia, la sua meta diventa `routesExpected:0, stoppedReason:<messaggio>`); `diffState` con osservazioni e coperture unite; scrive il file di oggi come righe esistenti di oggi + nuove righe (l'unico caso in cui un file giornaliero si riscrive: stesso giorno); scrive il meta (sostituito dal giro più recente; `rowsWritten` = righe totali del file di oggi); aggiorna `routes.json` (`lastSeen = oggi` per le tratte elencate oggi, `firstSeen` alla prima volta). Se le nuove righe sono zero e il file di oggi non esiste, non crearlo vuoto: il meta basta. Il blocco CLI segue lo schema di `src/run.js` (`process.argv[1]?.endsWith('run.js')` non basta qui perché anche `src/run.js` termina così: controllare `endsWith('history/run.js')`).

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/history-run.test.js` → PASS. Poi `npm test` → tutti PASS.

- [ ] **Step 5: Prova reale ridotta**

Run: `node src/history/run.js --dir "$TMPDIR/storico-prova" --max-routes 2`
Expected: log con richieste riuscite per entrambe le compagnie, un `.csv.gz` e un `.meta.json` con `routesOk` 2 per compagnia (salvo errori delle API, da riportare). Ripetere il comando subito: il secondo giro scrive poche o zero righe nuove.

- [ ] **Step 6: Commit**

```bash
git add src/history/run.js test/history-run.test.js package.json .gitignore
git commit -m "feat(storico): giro giornaliero con file del giorno, riepilogo e tratte"
```

---

### Task 5: Workflow GitHub e pubblicazione sul branch `history`

**Files:**
- Create: `.github/workflows/history.yml`, `scripts/prepare-history.sh`, `scripts/publish-history.sh`
- Modify: `.github/workflows/keepalive.yml` (aggiungere `history.yml` al ciclo), `README.md` (riga in tabella "Come funziona" e comando `npm run history` in "Sviluppo")

**Interfaces:**
- Consumes: CLI del Task 4.
- Produces: branch `history` aggiornato ogni giorno con un commit `Storico YYYY-MM-DD`.

- [ ] **Step 1: `scripts/prepare-history.sh`** — come `prepare-data.sh` ma per `history` nella cartella `./history`: worktree di `origin/history` (fetch `--depth 1`) se esiste, altrimenti `--orphan -b history`.

- [ ] **Step 2: `scripts/publish-history.sh <cartella>`** — `git add -A`; se non ci sono modifiche esce 0; altrimenti `git commit -m "Storico $(date -u +%F)"` (identità `github-actions[bot]` come `publish-data.sh`) e `git push origin HEAD:refs/heads/history`; in caso di rifiuto, `git pull --rebase origin history` e riprova fino a 3 volte. **Mai** `--amend` né `--force`.

- [ ] **Step 3: `.github/workflows/history.yml`**

```yaml
name: Storico prezzi (Ryanair, Wizz)
on:
  schedule:
    - cron: '41 3 * * *'   # minuto non tondo, vedi direct.yml
  workflow_dispatch:
concurrency: { group: history, cancel-in-progress: false }
permissions: { contents: write }
jobs:
  collect:
    runs-on: ubuntu-latest
    timeout-minutes: 75
    steps: checkout, setup-node 24 con cache npm, npm ci,
           bash scripts/prepare-history.sh,
           node src/history/run.js --dir ./history,
           if: always() → bash scripts/publish-history.sh ./history
```

- [ ] **Step 4: Verify**

Run: `bash -n scripts/prepare-history.sh && bash -n scripts/publish-history.sh`, poi un parse YAML del workflow (`python3 -c "import yaml;yaml.safe_load(open('.github/workflows/history.yml'))"`; se PyYAML manca, confronto a vista con `direct.yml`). Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/history.yml .github/workflows/keepalive.yml scripts/prepare-history.sh scripts/publish-history.sh README.md
git commit -m "ci(storico): raccolta giornaliera sul branch history"
```

---

### Task 6: Controllo dello storico nel check-up giornaliero

**Files:**
- Modify: `src/health.js`
- Test: `test/health.test.js`

**Interfaces:**
- Consumes: formato meta del Task 4; URL `https://raw.githubusercontent.com/WaxenPie679/voli-weekend/history/` + `YYYY/MM/YYYY-MM-DD.meta.json`.
- Produces:
  - `export const HISTORY_URL` (costante come `DATA_URL`).
  - `checkHistory(metas: Meta[], now: DateTime): string[]` — `metas` dal più recente, solo quelli trovati.
  - Voce `'Storico prezzi'` in `allChecks`, che scarica i meta di oggi, ieri e l'altro ieri (data di Roma; 404 = assente) e chiama `checkHistory`.

- [ ] **Step 1: Write the failing tests**

```js
const meta = (day, finishedH, r = [10, 10], w = [5, 5]) => ({ day, finishedAt: ago(finishedH),
  airlines: { ryanair: { routesExpected: r[0], routesOk: r[1] }, wizz: { routesExpected: w[0], routesOk: w[1] } } });

test('checkHistory: raccolta recente e completa → nessun problema', () => {
  assert.deepEqual(checkHistory([meta('2026-11-02', 4)], NOW), []);
});
test('checkHistory: nessuna raccolta da più di 30 ore', () => {
  assert.match(checkHistory([meta('2026-11-01', 31)], NOW)[0], /storico.*31 ore/i);
  assert.match(checkHistory([], NOW)[0], /nessuna raccolta/i);
});
test('checkHistory: meno di metà tratte per 2 giorni di fila → problema; per 1 giorno → no', () => {
  assert.match(checkHistory([meta('2026-11-02', 4, [10, 4]), meta('2026-11-01', 28, [10, 3])], NOW).join('\n'), /ryanair/);
  assert.deepEqual(checkHistory([meta('2026-11-02', 4, [10, 4]), meta('2026-11-01', 28)], NOW), []);
});
test('checkHistory: elenco tratte vuoto (routesExpected 0) conta come sotto la metà', () => {
  assert.match(checkHistory([meta('2026-11-02', 4, [0, 0]), meta('2026-11-01', 28, [0, 0])], NOW).join('\n'), /ryanair/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/health.test.js` → FAIL (`checkHistory` non esportata).

- [ ] **Step 3: Implement `checkHistory` and the `'Storico prezzi'` check in `src/health.js`**

Soglie dalla spec (7.4): età dell'ultimo `finishedAt` > 30 ore; per compagnia, `routesOk / routesExpected < 0.5` (o `routesExpected` 0) nei due meta più recenti con giorni consecutivi. Messaggi in italiano come gli altri (`fmtHours`).

- [ ] **Step 4: Run to verify they pass**

Run: `npm test` → tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add src/health.js test/health.test.js
git commit -m "feat(storico): il check-up giornaliero controlla anche lo storico"
```

---

### Task 7: Messa in produzione (richiede l'ok di Bruno)

- [ ] **Step 1:** `npm test` → tutti PASS; prova reale ridotta del Task 4 ripetuta con esito riportato.
- [ ] **Step 2:** Chiedere a Bruno l'ok per il push su `main`; poi `git push origin main`.
- [ ] **Step 3:** Bruno avvia a mano "Storico prezzi" da GitHub → Actions (gh non è installato sul Mac). Attendere la fine (~25–40 min).
- [ ] **Step 4:** Verificare sul branch `history` (`git fetch origin history` e `git show --stat origin/history`): presenti `routes.json`, il `.csv.gz` e il `.meta.json` del giorno; leggere il meta e riportare `routesOk/routesExpected` per compagnia, richieste fallite, durata e dimensione del file.
- [ ] **Step 5:** Avvio manuale del check-up (`health.yml`, "Invia il resoconto anche se è tutto OK") e verifica della riga "✅ Storico prezzi" su Telegram.
- [ ] **Step 6:** Aggiornare la memoria del progetto (storico attivo dal giorno X; tappa 2 da progettare dopo qualche settimana di dati).
