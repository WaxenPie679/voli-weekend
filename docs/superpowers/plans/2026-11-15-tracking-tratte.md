# Tratte seguite (tracking) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seguire tratte scelte da Bruno (date precise o finestra, N persone), controllarne i prezzi ogni 2 ore, mostrarle in una pagina «Tratte seguite» e avvisare su Telegram/iPhone quando il prezzo scende.

**Architecture:** Ogni tracking è una issue GitHub aperta da WaxenPie679 con etichetta `tracking`; il corpo ha righe `chiave: valore`. Un nuovo workflow `tracking.yml` (ogni 2 ore + evento issue) legge le issue, scarica i prezzi giornalieri Ryanair/Wizz solo dei giorni necessari, calcola le combinazioni migliori, aggiorna `tracking.json` e `airports.json` sul branch `data`, invia gli avvisi e commenta/chiude le issue. La webapp ha una pagina statica `seguite.html` che legge quei file e il riepilogo dello storico.

**Tech Stack:** Node 24, moduli ES, luxon, `node --test`; HTML/CSS/JS statico senza build; GitHub Actions; API REST di GitHub con `GITHUB_TOKEN`.

**Spec:** `docs/superpowers/specs/2026-11-15-tracking-tratte-design.md`

## Global Constraints

- Node 24, moduli ES, test con `node --test` in `test/*.test.js`, codice, commenti, log e testi in italiano.
- Fonti solo Ryanair e Wizz, voli diretti; niente Google Voli, scali, filtri orario.
- Prezzi per persona da API con 1 adulto (`adultCount: 1` per Wizz); totale gruppo = prezzo × persone. Persone da 1 a 9, predefinito 1.
- Contano solo i giorni con stato `prezzo` (niente `esaurito`, `da_verificare`, `nessun_volo`).
- Avviso quando il prezzo per persona è **≤ riferimento − 3 €** (`DROP_EUR = 3`, costante unica); il riferimento è il prezzo dell'ultimo avviso e non risale.
- Valgono solo le issue aperte con etichetta `tracking` e autore `WaxenPie679`.
- Controllo ogni 2 ore a minuto non tondo; concorrenza `group: tracking`; non toccare `direct.yml`, `connections.yml`, `history.yml` né i loro file di stato.
- Pause tra richieste: Ryanair 500–1000 ms, Wizz 2500–3500 ms; ritenti su 429/503 con `fetchRetry` di `src/history/collect.js`.
- Nessuna chiave o token nella webapp. SMOT (porta 5180) non va toccato; il server locale della webapp è sulla 5190.
- URL repo: `WaxenPie679/voli-weekend`; webapp `https://waxenpie679.github.io/voli-weekend/`.

## Review Focus

1. **Corpo issue scritto a mano o modificato male** (spazi, maiuscole, «Si» senza accento, codici minuscoli, chiavi mancanti): il parser normalizza ciò che può e, altrimenti, restituisce errori in italiano che finiscono nel commento; mai un crash del giro. → test in Task 1.
2. **Finestra che attraversa la fine del mese/anno** (es. agosto, ritorno a settembre; dicembre→gennaio): i mesi da scaricare includono il mese del ritorno. → test in Task 2.
3. **Nessuna combinazione con prezzo** (tratta stagionale non ancora in vendita, tutto esaurito): il tracking resta attivo con `best: null`, nessun avviso, la pagina dice «nessun prezzo disponibile ora». → test in Task 2 e Task 5.
4. **Fonte in errore a metà giro**: si conserva l'ultimo `best` con la sua data (`checkedAt` invariato) e si segna l'errore; nessun avviso fittizio e nessun reset del riferimento. → test in Task 5.
5. **Invio avviso fallito su tutti i canali**: lo stato degli avvisi non avanza, si riprova al giro dopo (come `processAlerts`). → test in Task 4.

---

## File Structure

| File | Responsabilità |
|---|---|
| `src/tracking/spec.js` | Leggere il corpo della issue → `Tracking` o errori; descrizione leggibile; impronta della configurazione |
| `src/tracking/combos.js` | Giorni/mesi necessari; combinazioni migliori da prezzi giornalieri; serie giornaliera |
| `src/tracking/fetch.js` | Verificare quali compagnie servono la tratta e scaricarne i prezzi giornalieri; elenco aeroporti |
| `src/tracking/github.js` | Elencare issue, commentare, chiudere (API REST) |
| `src/tracking/alerts.js` | Decidere gli avvisi e formattare Telegram/push |
| `src/tracking/run.js` | Orchestrare il giro, scrivere `tracking.json`, `alerts_state_tracking.json`, `airports.json`; CLI |
| `.github/workflows/tracking.yml` | Giro ogni 2 ore e all'evento issue |
| `src/health.js`, `.github/workflows/keepalive.yml` | Controllo e riattivazione del nuovo giro |
| `web/seguite.html`, `web/seguite.js`, `web/seguite-view.js` | Pagina «Tratte seguite»: elenco, grafico, consiglio, modulo |
| `web/index.html`, `web/storico.html`, `web/sw.js`, `web/sample/tracking.json`, `web/sample/airports.json` | Menu, cache, dati d'esempio |

---

### Task 1: Lettura del corpo della issue

**Files:**
- Create: `web/tracking-spec.js` (codice vero, usato anche dalla pagina web: niente luxon né moduli di Node, solo `Date` in UTC su stringhe ISO)
- Create: `src/tracking/spec.js` (solo `export * from '../../web/tracking-spec.js';`)
- Test: `test/tracking-spec.test.js` (importa da `src/tracking/spec.js`)

**Interfaces:**
- Produces:
  - `parseTracking(body: string, { today: string }) → { tracking: Tracking|null, errors: string[] }`
  - `type Tracking = { from: string, to: string, roundTrip: boolean, mode: 'precise'|'finestra', out?: string, back?: string, months?: string[] /* 'YYYY-MM' */, weekdays?: number[] /* 1=lun … 7=dom, luxon */, nights?: [number, number], people: number, name: string }`
  - `formatBody(t: Tracking) → string` (inverso di `parseTracking`; lo usa la pagina web per costruire la issue)
  - `describeTracking(t: Tracking) → string` es. `"Bari → Dubrovnik e ritorno · luglio 2027 · gio, ven · 5–7 notti · 6 persone"`
  - `trackingHash(t: Tracking) → string` (JSON stabile delle chiavi in ordine fisso; serve a riconoscere una modifica)
  - `bodyHash(body: string) → string` (testo del corpo con spazi e maiuscole normalizzati; serve a commentare gli errori una volta per versione)

Formato del corpo (una chiave per riga, maiuscole/minuscole e spazi indifferenti, righe sconosciute ignorate):

```
da: BRI
a: DBV
tipo: andata e ritorno        # oppure: solo andata
date: finestra                # oppure: precise
mesi: 2027-07, 2027-08        # solo finestra
giorni: gio, ven              # solo finestra; anche «tutti»
notti: 5-7                    # solo finestra con ritorno; anche «7»
andata: 2027-07-08            # solo precise
ritorno: 2027-07-15           # solo precise con ritorno
persone: 6
nome: Dubrovnik con gli amici
```

Giorni accettati: `lun mar mer gio ven sab dom` (anche nome intero, con o senza accento). Codici aeroporto: 3 lettere, resi maiuscoli.

- [ ] **Step 1: Write the failing tests**

```js
test('finestra completa', () => {
  const { tracking, errors } = parseTracking(BODY_FINESTRA, { today: '2026-11-15' });
  assert.deepEqual(errors, []);
  assert.deepEqual(tracking, { from: 'BRI', to: 'DBV', roundTrip: true, mode: 'finestra', months: ['2027-07', '2027-08'], weekdays: [4, 5], nights: [5, 7], people: 6, name: 'Dubrovnik con gli amici' });
});
test('date precise solo andata, persone predefinite 1', () => {
  const { tracking } = parseTracking('da: bri\na: dbv\ntipo: solo andata\ndate: precise\nandata: 2027-07-08', { today: '2026-11-15' });
  assert.equal(tracking.people, 1); assert.equal(tracking.roundTrip, false); assert.equal(tracking.out, '2027-07-08'); assert.equal(tracking.from, 'BRI');
});
test('scrittura libera: «Giovedì, Venerdi», «notti: 7», «tutti»', () => { /* weekdays [4,5]; nights [7,7]; tutti → [1..7] */ });
test('errori in italiano', () => {
  const r = parseTracking('da: BRI\ndate: precise\nandata: 2026-10-01\npersone: 12', { today: '2026-11-15' });
  assert.equal(r.tracking, null);
  assert.ok(r.errors.some((e) => e.includes('«a»')));            // manca la destinazione
  assert.ok(r.errors.some((e) => e.includes('già passata')));    // andata nel passato
  assert.ok(r.errors.some((e) => e.includes('da 1 a 9')));       // persone fuori intervallo
});
test('ritorno prima dell’andata e notti min > max sono errori', () => {});
test('finestra con mesi tutti passati è un errore; mese corrente ammesso', () => {});
test('formatBody → parseTracking restituisce lo stesso tracking', () => {});
test('describeTracking', () => { assert.equal(describeTracking(T), 'Bari → Dubrovnik e ritorno · luglio, agosto 2027 · gio, ven · 5–7 notti · 6 persone'); });
test('trackingHash cambia se cambiano le persone, non se cambia l’ordine delle righe', () => {});
```

Nomi città in `describeTracking`: `BRI` → Bari, `BDS` → Brindisi, altrimenti il codice (la pagina mostra la città vera da `airports.json`).

- [ ] **Step 2:** Run `node --test test/tracking-spec.test.js` — Expected: FAIL (modulo mancante).
- [ ] **Step 3:** Implement `web/tracking-spec.js` con le funzioni sopra e il re-export in `src/tracking/spec.js`.
- [ ] **Step 4:** Run `node --test test/tracking-spec.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** `git add web/tracking-spec.js src/tracking/spec.js test/tracking-spec.test.js && git commit -m "feat(tracking): lettura del corpo della issue"`

---

### Task 2: Combinazioni e serie

**Files:**
- Create: `src/tracking/combos.js`
- Test: `test/tracking-combos.test.js`

**Interfaces:**
- Consumes: `Tracking` (Task 1); `Obs` di `src/history/observe.js`.
- Produces:
  - `neededDays(t: Tracking, today: string) → { out: string[], back: string[] }` — date ISO di andata e di ritorno da controllare, mai prima di `today`.
  - `neededMonths(days: string[]) → string[]` — `'YYYY-MM'` distinti e ordinati.
  - `type DayPrice = { airline: 'ryanair'|'wizz', date: string, price: number, time: string }`
  - `cheapestByDay(obs: Obs[], from: string, to: string) → Map<string, DayPrice>` — solo stato `prezzo`, il più basso tra le compagnie per ogni giorno.
  - `type Combo = { out: DayPrice, back: DayPrice|null, price: number /* per persona, 2 decimali */, nights: number|null }`
  - `bestCombos(t: Tracking, outDays: Map<string,DayPrice>, backDays: Map<string,DayPrice>, today: string, limit = 5) → Combo[]` — ordinate per prezzo, poi data di andata.
  - `addSeriesPoint(series: [string, number][], day: string, price: number) → [string, number][]` — un punto per giorno: se l'ultimo è dello stesso giorno tiene il minimo.
  - `isExpired(t: Tracking, today: string) → boolean` — nessuna data di andata possibile da oggi in poi.

Regole: finestra = andate nei `months` con weekday in `weekdays`; ritorno = andata + n notti con n in `nights` (può cadere nel mese dopo). Precise = una sola coppia. Solo andata → `back: null`, `nights: null`.

- [ ] **Step 1: Write the failing tests**

```js
test('neededDays finestra luglio gio/ven 5–7 notti include i ritorni di agosto', () => {
  const d = neededDays(T_LUGLIO, '2026-11-15');
  assert.equal(d.out[0], '2027-07-01'); assert.ok(d.out.every((x) => [4, 5].includes(DateTime.fromISO(x).weekday)));
  assert.ok(d.back.includes('2027-08-06'));            // ven 30 lug 2027 + 7 notti
  assert.deepEqual(neededMonths(d.back), ['2027-07', '2027-08']);
});
test('finestra dicembre→gennaio attraversa l’anno', () => {});
test('neededDays salta le date già passate nel mese corrente', () => {});
test('cheapestByDay ignora esaurito/da_verificare e sceglie la compagnia più economica', () => {});
test('bestCombos mescola compagnie e rispetta le notti', () => {
  const [c] = bestCombos(T, outMap, backMap, '2026-11-15');
  assert.equal(c.price, 51.98); assert.equal(c.out.airline, 'ryanair'); assert.equal(c.back.airline, 'wizz'); assert.equal(c.nights, 6);
});
test('bestCombos senza prezzi restituisce []', () => {});
test('bestCombos date precise: una sola combinazione o nessuna', () => {});
test('addSeriesPoint tiene il minimo del giorno e aggiunge il giorno nuovo', () => {
  assert.deepEqual(addSeriesPoint([['2026-11-15', 60]], '2026-11-15', 55), [['2026-11-15', 55]]);
  assert.deepEqual(addSeriesPoint([['2026-11-15', 55]], '2026-11-16', 58), [['2026-11-15', 55], ['2026-11-16', 58]]);
});
test('isExpired', () => {});
```

(L'implementer fissa nei test le date esatte calcolate dal calendario; i casi sono quelli elencati.)

- [ ] **Step 2:** Run `node --test test/tracking-combos.test.js` — Expected: FAIL.
- [ ] **Step 3:** Implement `src/tracking/combos.js` (luxon per le date; nessuna rete).
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(tracking): combinazioni migliori e serie giornaliera"`

---

### Task 3: Prezzi dalle compagnie ed elenco aeroporti

**Files:**
- Create: `src/tracking/fetch.js`
- Test: `test/tracking-fetch.test.js` (con `fetchImpl` finto; riusa i fixture in `test/fixtures/` dove servono)

**Interfaces:**
- Consumes: `fetchRetry` (export di `src/history/collect.js`), `parseRyanairDays`, `parseWizzDays`, `parseRyanairRoutes` (`src/history/observe.js`), `wizzVersion`, `parseWizzRoutes` (`src/sources/wizz.js`), `jitter`/`sleep` (`src/util.js`), `neededMonths` (Task 2).
- Produces:
  - `createSources({ fetchImpl = fetch, pauseMs = true, retryBaseMs = 30000, log = console.log }) → Sources` — oggetto con cache per giro (elenchi tratte scaricati una volta sola per aeroporto, versione Wizz una volta):
    - `sources.airlinesFor(from: string, to: string) → Promise<('ryanair'|'wizz')[]>` — compagnie che volano la tratta nei due sensi della richiesta (Ryanair: `searchWidget/routes/it/airport/{from}`; Wizz: `asset/map`).
    - `sources.dayPrices(airline, from, to, months: string[], today: string) → Promise<Obs[]>` — Ryanair: una richiesta `cheapestPerDay` per mese; Wizz: finestre di ≤30 giorni che coprono i mesi, `adultCount: 1`, solo la direzione richiesta. Lancia se una richiesta fallisce (il chiamante decide).
    - `sources.airports() → Promise<{ code: string, city: string, country: string }[]>` — unione di `https://www.ryanair.com/api/views/locate/5/airports/it/active` (`code`, `city.name`, `country.name`) e città Wizz (`iata`, `shortName`, `countryName`), senza doppioni per codice, ordinata per città. Se una delle due fonti fallisce restituisce l'altra.

- [ ] **Step 1: Write the failing tests**

```js
test('airlinesFor: Ryanair sì, Wizz no per BRI→DBV', async () => { assert.deepEqual(await s.airlinesFor('BRI', 'DBV'), ['ryanair']); });
test('elenchi tratte scaricati una sola volta per aeroporto nello stesso giro', async () => { /* conta le chiamate a searchWidget */ });
test('dayPrices Ryanair: una richiesta per mese, osservazioni con stato', async () => {});
test('dayPrices Wizz: finestre ≤30 giorni su luglio-agosto, adultCount 1, solo outboundFlights', async () => {});
test('dayPrices lancia se un mese fallisce', async () => {});
test('airports unisce le due fonti senza doppioni e sopravvive a una fonte in errore', async () => {});
```

- [ ] **Step 2:** Run `node --test test/tracking-fetch.test.js` — Expected: FAIL.
- [ ] **Step 3:** Implement `src/tracking/fetch.js`. Pause: Ryanair `jitter(500, 1000)`, Wizz `jitter(2500, 3500)`, nessuna se `pauseMs` è falso.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(tracking): prezzi giornalieri ed elenco aeroporti"`

---

### Task 4: Avvisi

**Files:**
- Create: `src/tracking/alerts.js`
- Test: `test/tracking-alerts.test.js`

**Interfaces:**
- Consumes: `Combo` (Task 2), `describeTracking` (Task 1), `sendTelegram` (`src/telegram.js`), `sendPush` (`src/push.js`), `WEBAPP_URL` (`src/alerts.js`).
- Produces:
  - `export const DROP_EUR = 3`
  - `type AlertState = Record<string /* numero issue */, { ref: number, alertedAt: string }>`
  - `type TrackItem = { id: number, tracking: Tracking, best: Combo|null }`
  - `selectTrackingAlerts(items: TrackItem[], state: AlertState, now: DateTime) → { toSend: { item: TrackItem, kind: 'inizio'|'ribasso', drop: number }[], nextState: AlertState }` — senza stato e con `best` → `inizio`; con stato e `best.price <= ref - DROP_EUR` → `ribasso`; chiavi di issue non più in `items` rimosse.
  - `formatTrackingTelegram(entry) → string` (HTML) e `formatTrackingPush(entries) → { title, body, url }`
  - `bookingLinks(combo: Combo, from: string, to: string, people: number) → { label: string, url: string }[]` — stessa compagnia A/R: un link andata e ritorno; compagnie diverse: due link. Ryanair `https://www.ryanair.com/it/it/trip/flights/select?adults={N}&teens=0&children=0&infants=0&dateOut={out}&isReturn={true|false}&originIata={from}&destinationIata={to}` (+ `&dateIn={back}`); Wizz `https://wizzair.com/it-it/booking/select-flight/{from}/{to}/{out}/{back|null}/{N}/0/0/null`.
  - `sendTrackingAlerts(dataDir, items, env, now, { fetchImpl, pushImpl, log }) → Promise<number>` — come `processAlerts`: nessun canale → stato intatto; tutti i canali falliti → stato precedente ripristinato per gli avvisi non consegnati; file `alerts_state_tracking.json`. Un messaggio Telegram per giro con tutti gli avvisi; una notifica push (la più interessante: il ribasso maggiore, altrimenti la prima).

Testo Telegram (copia fissa, l'implementer adatta solo i valori):

```
📉 <b>Dubrovnik con gli amici</b> — <b>56 €</b> a persona (−8 €)
Bari → Dubrovnik e ritorno · 6 persone · 336 € in tutto
Andata gio 8 lug 06:25 · Ritorno gio 15 lug 21:10 · Ryanair
Per un gruppo il prezzo può essere più alto, soprattutto vicino alla partenza.
<a href="…/seguite.html">Apri</a> · <a href="…">Prenota</a>
```

Per `inizio`: prima riga `👀 Ora seguo <b>…</b> — <b>56 €</b> a persona`. La riga sul gruppo compare solo se persone > 1. Il nome è `tracking.name` o, se vuoto, `describeTracking`.

- [ ] **Step 1: Write the failing tests**

```js
test('primo giro con prezzo → inizio, riferimento = prezzo', () => {});
test('ribasso di 3 € esatti avvisa, di 2,99 no', () => {});
test('il riferimento non risale quando il prezzo sale', () => {});
test('best null → nessun avviso, stato invariato', () => {});
test('issue chiusa → chiave tolta dallo stato', () => {});
test('bookingLinks: stessa compagnia un link, compagnie diverse due, adults=6', () => {});
test('formatTrackingTelegram: riga gruppo solo con persone > 1; escape HTML del nome', () => {});
test('sendTrackingAlerts: tutti i canali falliti → stato non avanza', async () => {});
test('sendTrackingAlerts: nessun canale → stato non toccato', async () => {});
```

- [ ] **Step 2:** Run `node --test test/tracking-alerts.test.js` — Expected: FAIL.
- [ ] **Step 3:** Implement `src/tracking/alerts.js`.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(tracking): avvisi di ribasso"`

---

### Task 5: Issue GitHub e giro completo

**Files:**
- Create: `src/tracking/github.js`, `src/tracking/run.js`
- Modify: `package.json` (script `"tracking": "node src/tracking/run.js --data ./data"`)
- Test: `test/tracking-run.test.js`

**Interfaces:**
- Consumes: Task 1–4.
- Produces:
  - `github.js`: `createGitHub({ repo, token, fetchImpl = fetch }) → { listTrackingIssues(): Promise<{ number, title, body, user: { login }, html_url }[]>, comment(number, text): Promise<void>, close(number, text): Promise<void>, ensureLabel(): Promise<void> }` — `GET /repos/{repo}/issues?state=open&labels=tracking&per_page=100`; `close` commenta poi `PATCH state=closed`; `ensureLabel` crea l'etichetta `tracking` se manca (ignora 422).
  - `run.js`: `runTracking(dataDir, { now, github, sources, env, log, owner = 'WaxenPie679' }) → Promise<number /* codice uscita */>`
  - `tracking.json`:
    ```
    { generatedAt, items: [{ id, url, title, tracking, hash, status: 'attivo'|'errore',
      errors: string[], airlines: string[], best: Combo|null, top: Combo[], checkedAt: string|null,
      sourceErrors: string[], series: [day, price][], links: {label,url}[], commentedFor: string|null }] }
    ```
    `commentedFor` = `trackingHash` per cui è stata scritta la conferma (corpo valido) oppure `bodyHash` per cui è stato scritto il commento d'errore (corpo non valido); `links` = `bookingLinks(best, …)`.
  - `airports.json`: `[{ code, city, country }]`, riscritto al massimo una volta al giorno (se `generatedAt` del file esistente è di oggi, non si rifà).

Comportamento del giro, per ogni issue di `owner`:
1. `parseTracking`; con errori → `status: 'errore'`; se `commentedFor !== bodyHash(body)`, commenta gli errori e aggiorna `commentedFor`.
2. `isExpired` → `close` con commento finale (`Date passate: smetto di seguire. Prezzo più basso visto: 49 € il 3 gen 2027.`, dal minimo di `series`; senza serie: `Date passate: smetto di seguire.`), voce tolta.
3. `airlinesFor`; nessuna → errore «Nessun volo diretto Ryanair o Wizz su questa tratta».
4. Prezzi delle due direzioni per i mesi necessari; se una richiesta fallisce: `sourceErrors` aggiornato, `best/top/checkedAt` del giro precedente conservati, nessun avviso per questa voce in questo giro.
5. Altrimenti `bestCombos`, `addSeriesPoint` (giorno di Roma) se `best`, `checkedAt = now`.
6. Se `commentedFor !== trackingHash(t)` → commento di conferma con `describeTracking`, prezzo di oggi (o «nessun prezzo disponibile ora») e link alla pagina; `commentedFor = trackingHash(t)`. Se il corpo cambia la serie resta.
7. Voci di issue non più aperte: tolte da `tracking.json`.
Poi `sendTrackingAlerts` con le voci senza `sourceErrors` del giro. Uscita 1 solo se `listTrackingIssues` fallisce.

CLI: `node src/tracking/run.js --data ./data` con `GITHUB_TOKEN`, `GITHUB_REPOSITORY` e le variabili Telegram/push dall'ambiente. Opzione di sviluppo `--issue-file <file.md>`: al posto di GitHub usa un'unica issue finta (numero 1, autore `WaxenPie679`, corpo dal file) e stampa commenti e chiusure invece di inviarli; senza variabili Telegram/push gli avvisi non partono.

- [ ] **Step 1: Write the failing tests** (github e sources finti, cartella temporanea)

```js
test('issue di un altro utente ignorata', async () => {});
test('issue valida: conferma commentata una volta sola su due giri', async () => {});
test('corpo con errori: commento d’errore una volta per versione, status errore', async () => {});
test('fonte in errore: best e checkedAt del giro prima conservati, nessun avviso', async () => {});
test('nessuna combinazione: best null, status attivo, nessun avviso', async () => {});
test('date passate: issue chiusa con prezzo più basso visto, voce tolta', async () => {});
test('issue chiusa a mano: voce tolta da tracking.json', async () => {});
test('corpo modificato: nuova conferma, serie conservata', async () => {});
test('airports.json rifatto solo se non è di oggi', async () => {});
```

- [ ] **Step 2:** Run `node --test test/tracking-run.test.js` — Expected: FAIL.
- [ ] **Step 3:** Implement `github.js` e `run.js`.
- [ ] **Step 4:** Run `npm test` — Expected: tutta la suite PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(tracking): giro completo con issue GitHub"`

---

### Task 6: Workflow, controllo e riattivazione

**Files:**
- Create: `.github/workflows/tracking.yml`
- Modify: `.github/workflows/keepalive.yml` (aggiungere `tracking.yml` alla lista), `src/health.js` (+ test in `test/health.test.js`)

**Interfaces:**
- Consumes: CLI di Task 5; `scripts/prepare-data.sh`, `scripts/publish-data.sh`.
- Produces: `checkTracking(file: object|null, now: DateTime) → string[]` in `src/health.js`, inclusa in `allChecks`: nessun problema se il file non esiste o non ha voci; problema se `generatedAt` è più vecchio di **6 ore** (`TRACKING_MAX_AGE_HOURS = 6`).

`tracking.yml`:
- `on: schedule: cron '23 */2 * * *'`, `issues: types [opened, edited, closed, reopened, labeled]`, `workflow_dispatch`.
- Job con `if: github.event_name != 'issues' || contains(github.event.issue.labels.*.name, 'tracking')`.
- `concurrency: { group: tracking, cancel-in-progress: false }`, `permissions: { contents: write, issues: write }`, `timeout-minutes: 15`.
- Passi come `direct.yml`: checkout, setup-node 24 con cache npm, `npm ci`, `bash scripts/prepare-data.sh`, `node src/tracking/run.js --data ./data` con env `GITHUB_TOKEN: ${{ github.token }}`, Telegram, push; `if: always()` → `bash scripts/publish-data.sh ./data tracking.json alerts_state_tracking.json airports.json`.

- [ ] **Step 1:** Test `checkTracking` (file assente → `[]`; vecchio 7 h → un problema in italiano; 1 h → `[]`). Run `node --test test/health.test.js` — FAIL.
- [ ] **Step 2:** Implement `checkTracking` e collegarlo in `allChecks` leggendo `DATA_URL + 'tracking.json'` (404 = assente). Run — PASS.
- [ ] **Step 3:** Scrivere `tracking.yml` e aggiornare `keepalive.yml`. Verifica: `node -e "require('fs').readFileSync('.github/workflows/tracking.yml','utf8')"` e controllo a vista dell'indentazione YAML; `npm test` PASS.
- [ ] **Step 4: Commit** `git commit -m "ci(tracking): giro ogni 2 ore e controllo di salute"`

---

### Task 7: Pagina «Tratte seguite»

**Files:**
- Create: `web/seguite.html`, `web/seguite.js`, `web/seguite-view.js`, `web/sample/tracking.json`, `web/sample/airports.json`
- Modify: `web/index.html` e `web/storico.html` (link «Tratte seguite» nel `nav.topnav`), `web/sw.js` (aggiungere i tre file a `SHELL`, `CACHE = 'voli-weekend-v7'`), `web/style.css` solo se servono classi nuove
- Test: `test/seguite-view.test.js`

**Interfaces:**
- Consumes: `DATA_BASE_URL`, `HISTORY_BASE_URL` (`web/config.js`); `parseTracking`, `formatBody`, `describeTracking` da `web/tracking-spec.js` (Task 1; aggiungerlo anche a `SHELL` in `sw.js`); `riseText`, `RELIABILITY_LABEL`, `scale`, `priceDomain` da `web/storico-view.js`.
- Produces (`web/seguite-view.js`, funzioni pure):
  - `newIssueUrl(t: Tracking) → string` — `https://github.com/WaxenPie679/voli-weekend/issues/new?labels=tracking&title={encode('Segui: ' + describeTracking(t))}&body={encode(formatBody(t))}`
  - `priceLine(item) → { perPerson: string, total: string|null, drop: string|null }` — total solo se persone > 1.
  - `ageText(checkedAt: string|null, now: Date) → string` — «aggiornato 40 min fa», «mai controllato».
  - `buyAdvice(item, summaryOut|null, today: string) → string` — giorni mancanti alla prima andata migliore + `riseText` del riepilogo della direzione di andata, oppure «Storico in costruzione da quando l'hai aggiunta» se la tratta non è nello storico; aggiunge «(stima: ancora nessuna estate raccolta)» quando `reliability !== 'affidabile'`.
  - `formToTracking(fields: Record<string,string|string[]>) → { tracking: Tracking|null, errors: string[] }` — riusa `parseTracking` passando per `formatBody`.

Pagina (stile e struttura come `storico.html`, testi in italiano):
- Elenco delle voci di `tracking.json`: nome/descrizione; prezzo per persona grande, totale gruppo; voli scelti; grafico SVG a gradini della `series`; consiglio `buyAdvice` (scarica `summary/{from}-{to}.json` solo se la tratta è nell'`index.json` dello storico); età dei dati; «Altre combinazioni» (apre `top`); link di prenotazione; «Smetti di seguire» (apre `url` della issue). Voce in errore: errori in evidenza e link alla issue. `best: null`: «Nessun prezzo disponibile ora: la tratta potrebbe non essere ancora in vendita».
- Elenco vuoto: spiegazione in una riga e il modulo aperto.
- Modulo «Segui una tratta»: `da`/`a` con `<datalist>` da `airports.json` (testo «Città (CODICE)», si salva il codice); andata e ritorno / solo andata; date precise o finestra; mesi come caselle per i prossimi 12 mesi; giorni lun–dom come caselle; notti min/max; persone 1–9; nome. Errori di `formToTracking` sotto il modulo; senza errori il tasto «Segui su GitHub» apre `newIssueUrl` in una nuova scheda e mostra «Conferma la richiesta su GitHub: entro pochi minuti la tratta compare qui e ricevi un messaggio».
- Con `?sample=1` usa i dati di esempio.

- [ ] **Step 1:** Test di `newIssueUrl` (contiene `labels=tracking` e il corpo decodificato uguale a `formatBody`), `priceLine` (1 vs 6 persone), `ageText`, `buyAdvice` (con e senza riepilogo, affidabilità), `formToTracking` (finestra valida; mesi vuoti → errore). Run `node --test test/seguite-view.test.js` — FAIL.
- [ ] **Step 2:** Implement `web/seguite-view.js`; run test — PASS.
- [ ] **Step 3:** Implement `seguite.html`, `seguite.js`, dati d'esempio (un tracking finestra con 6 persone e serie di 10 giorni, uno date precise solo andata con `best: null`, uno in errore), link nei menu, `sw.js`.
- [ ] **Step 4: Verifica nel browser** con il server locale (`npm run serve`, porta 5190, mai 5180): aprire `http://127.0.0.1:5190/seguite.html?sample=1`, controllare che le tre voci si vedano, il grafico, il modulo che genera un link GitHub corretto, nessun errore in console, larghezza telefono 375 px senza scorrimento orizzontale.
- [ ] **Step 5: Commit** `git commit -m "feat(web): pagina Tratte seguite con modulo"`

---

### Task 8: Prova reale e passaggi di Bruno

- [ ] **Step 1:** Prova locale con rete vera e senza GitHub: scrivere in un file temporaneo il corpo Bari–Dubrovnik (luglio 2027, gio/ven, 5–7 notti, 6 persone) ed eseguire `node src/tracking/run.js --data <cartella temporanea> --issue-file <file>`. Atteso: commento di conferma stampato e `tracking.json` con `airlines: ['ryanair']`, `best` con prezzo numerico, `top` da 5 voci.
- [ ] **Step 2:** Verificare a mano una volta se Wizz cambia prezzo con `adultCount: 6` su una tratta Wizz da Bari (es. BRI→BUD luglio 2027). Annotare il risultato nella spec (§7). Se cambia, aprire un compito a parte: non si modifica questo piano.
- [ ] **Step 3:** `npm test` tutto PASS.
- [ ] **Step 4:** Passaggi di Bruno, spiegati passo passo: push dal Terminale (serve il permesso `workflow`); prima esecuzione manuale di `tracking.yml` (crea l'etichetta); dal telefono aprire `seguite.html`, compilare Bari–Dubrovnik e confermare la issue; attendere commento di conferma e messaggio «Ora seguo».
