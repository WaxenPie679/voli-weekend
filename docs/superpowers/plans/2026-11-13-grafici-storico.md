# Grafici dello storico prezzi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un riepilogo per tratta calcolato ogni notte sul branch `history` e una nuova pagina della webapp che lo mostra in due grafici SVG (quando comprare, singoli voli).

**Architecture:** `src/history/summary.js` rigioca i file giornalieri dello storico, aggrega i prezzi per settimana mancante alla partenza (istogrammi → percentili) e per volo (lista dei cambi), e scrive `summary/index.json` + `summary/<DA>-<A>.json` in modo atomico. Il workflow lo esegue dopo la raccolta, senza bloccare la pubblicazione. La pagina `web/storico.html` legge quei file; la logica pura (scale, percorsi SVG, testi) sta in `web/storico-view.js`, testata con `node --test`; `web/storico.js` fa solo DOM.

**Tech Stack:** Node 24, moduli ES, luxon, `node:zlib`, `node --test`; HTML/CSS/JS statici senza build, SVG scritto a mano.

**Spec:** `docs/superpowers/specs/2026-11-13-grafici-storico-design.md`

## Global Constraints

- Codice, commenti, messaggi e testi dell'interfaccia in italiano, come il resto del progetto.
- Nessuna dipendenza nuova (né npm né CDN); grafici in SVG scritto a mano.
- Solo osservazioni con stato `prezzo` entrano nella curva; settimana mancante = `floor((p − g) / 7)` in giorni, con `p ≥ g`, settimane > 52 confluiscono nella 52.
- Affidabilità sui giorni raccolti (numero di file giornalieri): `< 28` → `prima`, `28–89` → `crescita`, `≥ 90` → `affidabile`. Testi: «prima stima», «in crescita», «affidabile».
- Punto di salita: per compagnia, solo con affidabilità ≥ `crescita`, settimane con ≥ 5 punti, almeno 8 settimane usabili; regola del §7.2 della spec, soglia 1,10.
- Voli singoli: partenze future e partite da ≤ 30 giorni (rispetto all'ultimo giorno raccolto).
- Un file per coppia di aeroporti e direzione: `summary/BDS-TRN.json`, `summary/TRN-BDS.json`.
- Il riepilogo non deve mai impedire la pubblicazione dei dati del giorno, né pubblicare file a metà.
- La pagina principale cambia solo per il link «Storico prezzi» nella barra in alto.
- Stile da `DESIGN.md` / variabili in `web/style.css` (`--hue` per Ryanair, un secondo colore distinto per Wizz), iPhone 375 px prima.
- Non toccare SMOT (porta 5180).

## Review Focus

1. **Direzione di ritorno** (es. `TRN-BDS`): `routes.json` ha sempre l'origine BRI/BDS; città e paese vanno presi dall'aeroporto estero anche per il ritorno → test in Task 1.
2. **Giorni saltati** nello storico (un file mancante): `daysCollected` conta i file, la curva non inventa giorni → test in Task 1.
3. **Compagnia o tratta senza prezzi** (solo `esaurito`/`nessun_volo`): curva vuota, nessun crash né nel riepilogo né nella pagina → test in Task 1 e Task 3.
4. **Riepilogo che fallisce a metà**: nessun file parziale pubblicato, `summary/` del giorno prima intatto, pubblicazione dei dati comunque → test in Task 2.
5. **Un solo giorno di dati** (situazione di oggi): grafico dei voli con un solo punto, curva con poche settimane, nessun punto di salita, testi coerenti → test in Task 3.

---

### Task 1: Calcolo del riepilogo (funzioni pure)

**Files:**
- Create: `src/history/summary.js`
- Test: `test/history-summary.test.js`

**Interfaces:**
- Consumes: righe `Obs` `{airline, origin, dest, date, state, price}` come da `decodeCsv` in `src/history/store.js`; `obsKey` da lì.
- Produces (tutte esportate da `src/history/summary.js`):
  - `quantile(hist: Map<number, number>, q: number) -> number` — istogramma prezzo→conteggio; interpolazione lineare tipo 7 (come Excel `PERCENTILE.INC`), arrotondata ai centesimi.
  - `reliability(daysCollected: number) -> 'prima'|'crescita'|'affidabile'`
  - `risePoint(curve: CurveRow[], rel) -> number|null` con `CurveRow = [week, median, p25, p75, n]`.
  - `buildSummary(days: {day: string, rows: Obs[]}[], routes: object, { generatedAt: string }) -> { index: Index, files: Map<string, RouteSummary> }`
  - Formati:
    - `Index = { generatedAt, firstDay, lastDay, daysCollected, reliability, routes: [{ from, to, city, country, airlines: string[] }] }` — `routes` ordinate per `from`, poi `city`.
    - `RouteSummary = { from, to, city, country, lastDay, daysCollected, reliability, airlines: { [airline]: { curve: CurveRow[], rise: number|null, flights: [date, [[day, state, price|null], ...]][] } } }` — `curve` ordinata per settimana crescente, solo settimane con almeno un punto; `flights` ordinati per data.

- [ ] **Step 1: Scrivere i test che falliscono**

Test con dati costruiti a mano (helper `row(airline, from, to, date, state, price)`):
- `quantile`: istogramma di `[10,20,30,40]` → q 0,5 = 25, q 0,25 = 17,5, q 0,75 = 32,5; un solo valore 50 → 50 per ogni q.
- `reliability`: 1 → `prima`, 27 → `prima`, 28 → `crescita`, 89 → `crescita`, 90 → `affidabile`.
- `risePoint`:
  - affidabilità `prima` → `null` anche con una curva valida;
  - curva di 10 settimane (n=5 ciascuna) con mediane per settimana 0..9 = `[90, 80, 70, 50, 50, 50, 50, 50, 50, 50]` e `crescita` → minimo 50, la più lontana a parità è la 9; la settimana `s` più lontana < 9 tale che tutte le settimane da `s` a 0 abbiano mediana ≥ 55 è la 2 → `2`;
  - stessa curva ma mediane tutte 50 → `null`; minimo nella settimana 0 → `null`; solo 7 settimane usabili → `null`; settimane con n=4 escluse dal conteggio.
- `buildSummary`, due giorni `2026-11-12` e `2026-11-13`:
  - giorno 1: `ryanair BDS TRN 2026-11-20 prezzo 30`, `ryanair BDS TRN 2026-12-20 prezzo 60`, `ryanair TRN BDS 2026-11-22 prezzo 40`, `wizz BDS TRN 2026-11-20 esaurito`;
  - giorno 2: `ryanair BDS TRN 2026-11-20 prezzo 35` (solo il cambio);
  - `routes`: `{ 'ryanair|BDS|TRN': { airline:'ryanair', origin:'BDS', code:'TRN', city:'Torino', country:'Italia' }, 'wizz|BDS|TRN': {…stesso…} }`.
  - Atteso: `index.daysCollected` 2, `firstDay` `2026-11-12`, `lastDay` `2026-11-13`, `reliability` `prima`; `index.routes` contiene `{from:'BDS', to:'TRN', city:'Torino', country:'Italia', airlines:['ryanair','wizz']}` e `{from:'TRN', to:'BDS', city:'Torino', country:'Italia', airlines:['ryanair']}`.
  - `files.get('BDS-TRN').airlines.ryanair.curve`: settimana 1 (giorno 1: 2026-11-20 − 2026-11-12 = 8 giorni → 30; giorno 2: 7 giorni → 35) = `[1, 32.5, 31.25, 33.75, 2]`; settimana 5 (38 e 37 giorni → 60 due volte) = `[5, 60, 60, 60, 2]`.
  - `files.get('BDS-TRN').airlines.ryanair.flights` contiene `['2026-11-20', [['2026-11-12','prezzo',30], ['2026-11-13','prezzo',35]]]`.
  - `files.get('BDS-TRN').airlines.wizz.curve` è `[]` e i suoi `flights` contengono la riga `esaurito` con prezzo `null`.
- Giorni saltati: giorni `2026-11-12` e `2026-11-14` (il 13 manca) → `daysCollected` 2; i punti del 14 usano lo stato rigiocato (la riga del 12 vale ancora il 14).
- Partenze passate: una riga con data di partenza `2026-10-01` vista il `2026-11-12` non entra né nella curva (p < g) né nei `flights` (partita da più di 30 giorni rispetto a `lastDay`); una partita `2026-11-01` con `lastDay` `2026-11-13` resta nei `flights`.
- Tratta assente da `routes` (dati vecchi): `city` e `country` sono il codice aeroporto e `''`.

- [ ] **Step 2: Eseguire e vedere fallire**

Run: `node --test test/history-summary.test.js`
Expected: FAIL (modulo inesistente).

- [ ] **Step 3: Implementare `src/history/summary.js`**

Algoritmo (vincolante per la memoria, lo storico crescerà a ~60k chiavi × 365 giorni):
- Rigiocare i giorni in ordine tenendo uno `state` `Map(obsKey → Obs)` aggiornato riga per riga (non ricostruire da zero ogni giorno).
- Dopo aver applicato il giorno `g`, scorrere `state` e per ogni voce con `state === 'prezzo'` e `date ≥ g` incrementare l'istogramma `Map(prezzo → conteggio)` del gruppo `(from-to, airline, settimana)`. Niente array di punti.
- Per i `flights`, appendere ogni riga del giorno alla lista del suo volo; alla fine scartare i voli con `date < lastDay − 30 giorni` (luxon).
- Città/paese: cercare `routes[\`${airline}|${from}|${to}\`]` e, per il ritorno, `routes[\`${airline}|${to}|${from}\`]`; il primo trovato tra le compagnie della tratta.

- [ ] **Step 4: Eseguire e vedere passare**

Run: `node --test test/history-summary.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/history/summary.js test/history-summary.test.js
git commit -m "feat(storico): calcolo del riepilogo per tratta (curva, voli, salita)"
```

---

### Task 2: Scrittura del riepilogo, comando e workflow

**Files:**
- Modify: `src/history/run.js` (esportare `listDayFiles`, `readDayFile`)
- Modify: `src/history/summary.js` (aggiungere `writeSummary` e il comando)
- Modify: `.github/workflows/history.yml`, `scripts/publish-history.sh`, `package.json`, `README.md`
- Test: `test/history-summary.test.js`

**Interfaces:**
- Consumes: `buildSummary` (Task 1); `listDayFiles(dir) -> Promise<{name, path}[]>` e `readDayFile(dir, rel) -> Promise<Obs[]>` da `src/history/run.js` (oggi interne: vanno solo esportate, senza cambiarle).
- Produces: `writeSummary(dir: string, { now?: DateTime, log? }) -> Promise<{ routes: number, bytes: number }>`; comando `node src/history/summary.js --dir <dir>` (guardia come in run.js: `process.argv[1]?.endsWith('history/summary.js')`); script npm `"summary": "node src/history/summary.js --dir ./history"`.

- [ ] **Step 1: Test che falliscono** (cartella temporanea con `mkdtemp`, file giornalieri scritti con `encodeCsv` nei percorsi `YYYY/MM/YYYY-MM-DD.csv.gz`, più `routes.json`):
  - dopo `writeSummary`: esistono `summary/index.json` e `summary/BDS-TRN.json` con il contenuto atteso; non esiste `summary.tmp`; il valore restituito ha `routes` uguale al numero di file di tratta.
  - un `summary/VECCHIO-XXX.json` presente prima sparisce (la cartella viene sostituita intera).
  - con un file giornaliero corrotto (`'non gzip'`): `writeSummary` rifiuta con un messaggio che contiene il percorso del file; `summary/index.json` precedente è ancora identico; `summary.tmp` non esiste.

- [ ] **Step 2: Run** `node --test test/history-summary.test.js` → FAIL.

- [ ] **Step 3: Implementare `writeSummary`**: legge tutti i file con `listDayFiles`/`readDayFile`, `routes.json` (assente → `{}`), chiama `buildSummary` con `generatedAt` = `now.toUTC().toISO()`, scrive tutti i JSON (compatti, senza indentazione) in `<dir>/summary.tmp/`, poi rimuove `summary/` e rinomina `summary.tmp/` in `summary/`. In caso di errore rimuove `summary.tmp/` e rilancia. Il comando stampa `riepilogo: N tratte, X KB` ed esce con 1 in caso di errore.

- [ ] **Step 4: Run** `node --test test/history-summary.test.js` → PASS.

- [ ] **Step 5: Workflow e pubblicazione**
  - `history.yml`, tra il passo di raccolta e quello di pubblicazione:
    ```yaml
      # Riepilogo per i grafici: se fallisce, i dati del giorno si pubblicano lo stesso
      - if: always()
        run: node src/history/summary.js --dir ./history
        timeout-minutes: 5
        continue-on-error: true
    ```
  - `publish-history.sh`: prima del commit, `rm -rf summary.tmp` (resto di un passo ucciso a metà), accanto alla pulizia dei `.tmp`.
  - `README.md`: una riga nella sezione dello storico su `summary/` e sul comando `npm run summary`.

- [ ] **Step 6: Prova sui dati veri**
Run: `git worktree add /tmp/hist-check origin/history` (o in scratchpad), poi `node src/history/summary.js --dir <quella cartella>`.
Expected: `riepilogo: ~105 tratte`, file della tratta più grande sotto 300 KB; `npm test` verde tranne i 2 test noti di `test/ryanair.test.js`. Rimuovere il worktree.

- [ ] **Step 7: Commit**

```bash
git add src/history/run.js src/history/summary.js test/history-summary.test.js .github/workflows/history.yml scripts/publish-history.sh package.json README.md
git commit -m "feat(storico): riepilogo notturno in summary/ senza bloccare la pubblicazione"
```

---

### Task 3: Logica della pagina (funzioni pure)

**Files:**
- Create: `web/storico-view.js`
- Test: `test/storico-view.test.js`

**Interfaces:**
- Consumes: i formati `Index` e `RouteSummary` del Task 1.
- Produces (esportate da `web/storico-view.js`, senza DOM):
  - `RELIABILITY_LABEL = { prima: 'prima stima', crescita: 'in crescita', affidabile: 'affidabile' }`
  - `statusLine(index) -> string` — es. `'Storico dal 12 nov · 2 giorni · prima stima · aggiornato alle 06:05'` (data in italiano senza anno, ora di Roma da `generatedAt`; «1 giorno» al singolare).
  - `riseText(rise: number|null, reliability) -> string` — `prima` → `'Ancora pochi dati per dire quando sale: servono circa 4 settimane.'`; numero N → `'Di solito il prezzo inizia a salire circa N settimane prima della partenza.'` (N=1 → «1 settimana»); `null` → `'Nessuna salita chiara finora.'`.
  - `scale(d0, d1, r0, r1) -> (v) => number` lineare.
  - `priceDomain(series: number[]) -> [min, max]` — arrotondati a multipli di 10 verso l'esterno, minimo 0, intervallo di almeno 20 €.
  - `curvePaths(curve, sx, sy) -> { line: string, band: string }` — attributi `d` SVG: linea sulle mediane, fascia chiusa p25→p75; curva vuota → stringhe vuote.
  - `stepPoints(changes, lastDay) -> [day, price|null][]` — dai cambi a una serie a gradini fino a `lastDay`; stati diversi da `prezzo` danno `null` (buco nella linea).
  - `upcomingDepartures(flights, lastDay) -> string[]` — date ≥ `lastDay` con almeno un prezzo, crescenti.
  - `routeLabel(route) -> string` — andata `'Brindisi → Torino'`, ritorno `'Torino → Brindisi'` (BRI = Bari, BDS = Brindisi).

- [ ] **Step 1: Test che falliscono** per ogni funzione con i valori sopra, più: `curvePaths([], …)` → `{ line: '', band: '' }`; `stepPoints([['2026-11-12','prezzo',30]], '2026-11-12')` → `[['2026-11-12', 30]]` (un solo giorno: un punto); `stepPoints([['2026-11-12','prezzo',30],['2026-11-14','esaurito',null]], '2026-11-15')` → `[['2026-11-12',30],['2026-11-13',30],['2026-11-14',null],['2026-11-15',null]]`; `priceDomain([32, 61])` → `[30, 70]`; `priceDomain([50])` → `[40, 60]`.

- [ ] **Step 2: Run** `node --test test/storico-view.test.js` → FAIL.

- [ ] **Step 3: Implementare** `web/storico-view.js` come modulo ES importabile sia dal browser sia da Node (niente luxon: date con `Date` e `Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome' })`).

- [ ] **Step 4: Run** `node --test test/storico-view.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/storico-view.js test/storico-view.test.js
git commit -m "feat(web): logica dei grafici dello storico"
```

---

### Task 4: Pagina «Storico prezzi»

**Files:**
- Create: `web/storico.html`, `web/storico.js`, `web/sample/summary/index.json`, `web/sample/summary/<2 tratte>.json`
- Modify: `web/config.js`, `web/index.html` (solo link), `web/style.css`, `web/sw.js`, `test/serve.test.js`

**Interfaces:**
- Consumes: tutto `web/storico-view.js` (Task 3); formati del Task 1.
- Produces: `HISTORY_BASE_URL` in `web/config.js` = con `?sample` `'./sample/summary/'`, altrimenti `'https://raw.githubusercontent.com/WaxenPie679/voli-weekend/history/summary/'`.

- [ ] **Step 1: Test che fallisce** in `test/serve.test.js`: `GET /storico.html` → 200, `text/html`, contiene `Storico prezzi`.

- [ ] **Step 2: Run** `node --test test/serve.test.js` → FAIL.

- [ ] **Step 3: Costruire la pagina** secondo §7.3 della spec:
  - stessa testata di `index.html` (marchio che porta a `./`), titolo `Storico prezzi`, link «Offerte»; in `index.html` link «Storico prezzi» nella barra in alto, nient'altro cambia;
  - scelta: partenza (Bari/Brindisi), destinazione (`<select>` dalle tratte di `index.json` per quella base, con città), direzione (Andata/Ritorno); ultima scelta in `localStorage` dentro try/catch;
  - riga di stato (`statusLine`), testo della salita (`riseText`, una riga per compagnia se volano entrambe);
  - grafico «Quando comprare»: SVG con `viewBox`, larghezza fluida, asse x settimane 52→0 (partenza a destra, tacche ogni 4 settimane sul telefono), asse y € da `priceDomain`, fascia + linea per compagnia (Ryanair `--hue`, Wizz secondo colore), legenda, linea verticale tratteggiata sulla settimana di salita;
  - grafico «I singoli voli»: `<select>` delle partenze (`upcomingDepartures`), linea a gradini (`stepPoints`) per compagnia; con un solo punto, punto visibile e frase «la linea si allunga ogni giorno»;
  - tocco/passaggio: riquadro con i valori (settimana, mediana, n; oppure giorno e prezzo);
  - stati vuoti: tratta senza prezzi → «Nessun prezzo raccolto per questa tratta»; errore di rete → messaggio e pulsante «Riprova»;
  - una riga sotto il primo grafico: «Le prime settimane la curva confronta voli diversi visti lo stesso giorno: con il tempo segue gli stessi voli giorno dopo giorno e diventa più precisa.»
  - `sw.js`: cache `voli-weekend-v4`, aggiungere `storico.html`, `storico.js`, `storico-view.js` a `SHELL`.
  - dati di esempio: generare con `writeSummary` dallo storico vero (Task 2, step 6) e copiare `index.json` filtrato a 2 tratte (una con entrambe le compagnie se esiste, altrimenti `BDS-TRN` e il suo ritorno).

- [ ] **Step 4: Run** `npm test` → verde tranne i 2 test noti di `test/ryanair.test.js`.

- [ ] **Step 5: Verifica nel browser** con `preview_start` `voli-weekend` su `/storico.html?sample=1`: nessun errore in console; a 375 px niente scorrimento orizzontale, assi leggibili; cambio di tratta e di partenza aggiorna i grafici; link avanti e indietro tra le due pagine; la pagina principale invariata a parte il link. Screenshot da allegare al report.

- [ ] **Step 6: Commit**

```bash
git add web/ test/serve.test.js
git commit -m "feat(web): pagina Storico prezzi con i grafici per tratta"
```
