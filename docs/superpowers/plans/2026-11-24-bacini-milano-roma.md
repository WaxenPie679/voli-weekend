# Raccolta per gruppi (Milano, Bergamo, Roma) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raccogliere prezzi (Ryanair, Wizz, Google, storico) anche da MXP, LIN, BGY, FCO, CIA, divisi in gruppi paralleli, senza cambiare nulla per la Puglia.

**Architecture:** Un modulo `src/gruppi.js` definisce i gruppi; la variabile d'ambiente `GRUPPO` (assente = `puglia`) sceglie gli aeroporti, che finiscono in `CONSTRAINTS.origins` all'avvio, così tutte le fonti esistenti funzionano senza modifiche. Nomi dei file dati e branch dello storico derivano dal gruppo. I workflow lanciano un job per gruppo con una matrice.

**Tech Stack:** Node 24 (ESM), `node:test`, luxon, GitHub Actions, bash.

**Spec:** `docs/superpowers/specs/2026-11-24-bacini-milano-roma-design.md`

## Global Constraints

- Gruppi: `puglia` = BRI, BDS · `milano` = MXP, LIN · `bergamo` = BGY · `roma` = FCO, CIA. Bacini: puglia → «Puglia», milano e bergamo → «Milano e Bergamo», roma → «Roma».
- Puglia invariata: file `direct.json`, `connections.json`, `alerts_state_*.json`, branch `history` e `summary`, webapp, tracking.
- Altri gruppi: `direct-<gruppo>.json`, `connections-<gruppo>.json` sul branch `data`; storico sul branch `history-<gruppo>`; nessun riepilogo `summary`.
- Avvisi Telegram/push solo dal gruppo `puglia`.
- Limiti: diretti 10 min, scali 60 min, storico passo 65 min (job 75).
- Testi per Bruno e messaggi in italiano, come nel resto del codice.

## Review Focus

1. `GRUPPO` scritto male nel workflow (es. `Milano`) → deve fallire subito con errore chiaro, mai raccogliere la Puglia dentro un file di un altro gruppo. Test nel Task 1.
2. Job non-Puglia che ripubblica un `alerts_state_*.json` vecchio (era nel checkout del branch `data`) → riporterebbe indietro lo stato avvisi Puglia e farebbe ripartire avvisi doppi. Il workflow passa il file di stato solo per `puglia`. Verifica nel Task 4.
3. Elenco tratte Ryanair 404 per un aeroporto (LIN) → zero tratte per quell'aeroporto, le altre continuano. Test nel Task 3.
4. Un gruppo che fallisce non deve annullare gli altri job (`fail-fast: false`) né la pubblicazione della Puglia. Verifica nel Task 4.
5. Il controllo giornaliero non deve scrivere «Bari o Brindisi» per un gruppo diverso, e ogni problema deve dire il gruppo. Test nel Task 5.

---

### Task 1: Gruppi e scelta del gruppo

**Files:**
- Create: `src/gruppi.js`
- Modify: `src/filter.js:4-12` (`origins` dal gruppo)
- Test: `test/gruppi.test.js`

**Interfaces:**
- Produces:
  - `GRUPPI: Readonly<Record<string, {aeroporti: string[], bacino: string}>>`
  - `gruppoDaEnv(env: Record<string,string|undefined>): string`: `env.GRUPPO` assente o vuoto → `'puglia'`; nome sconosciuto → `throw new Error('gruppo sconosciuto: <nome> (usa puglia, milano, bergamo, roma)')`
  - `GRUPPO: string` = `gruppoDaEnv(process.env)`, calcolato all'import
  - `dataFile(mode: 'direct'|'connections', gruppo: string): string`: `'direct.json'` per puglia, `'direct-milano.json'` per milano
  - `historyBranch(gruppo: string): string`: `'history'` per puglia, `'history-roma'` per roma
  - `CONSTRAINTS.origins` = `GRUPPI[GRUPPO].aeroporti`

- [ ] **Step 1: Write the failing tests** in `test/gruppi.test.js`:
  - `gruppoDaEnv({})` e `gruppoDaEnv({ GRUPPO: '' })` → `'puglia'`; `gruppoDaEnv({ GRUPPO: 'bergamo' })` → `'bergamo'`
  - `assert.throws(() => gruppoDaEnv({ GRUPPO: 'Milano' }), /gruppo sconosciuto: Milano/)`
  - `GRUPPI.milano.aeroporti` deepEqual `['MXP', 'LIN']`, `GRUPPI.bergamo.aeroporti` `['BGY']`, `GRUPPI.roma.aeroporti` `['FCO', 'CIA']`, `GRUPPI.puglia.aeroporti` `['BRI', 'BDS']`; `GRUPPI.bergamo.bacino === GRUPPI.milano.bacino`
  - `dataFile('direct','puglia') === 'direct.json'`, `dataFile('connections','roma') === 'connections-roma.json'`
  - `historyBranch('puglia') === 'history'`, `historyBranch('milano') === 'history-milano'`
  - nessun aeroporto in due gruppi
  - `CONSTRAINTS.origins` deepEqual `['BRI','BDS']` (test eseguiti senza `GRUPPO`)
- [ ] **Step 2: Run** `node --test test/gruppi.test.js`: atteso FAIL (modulo mancante)
- [ ] **Step 3: Implement** `src/gruppi.js` (oggetti congelati) e in `src/filter.js` `origins: GRUPPI[GRUPPO].aeroporti`
- [ ] **Step 4: Run** `npm test`: atteso tutto PASS
- [ ] **Step 5: Commit** `feat(gruppi): gruppi di raccolta scelti con GRUPPO`

### Task 2: File dati per gruppo e avvisi solo Puglia

**Files:**
- Modify: `src/run.js` (file da `dataFile`, avvisi condizionati)
- Test: `test/run.test.js`

**Interfaces:**
- Consumes: `GRUPPO`, `dataFile` dal Task 1
- Produces: `runMode(mode, dataDir, { sources, now, env, log, gruppo = GRUPPO })`. Scrive `dataFile(mode, gruppo)`; chiama `processAlerts` solo se `gruppo === 'puglia'`. `MODES[mode].file` resta il nome Puglia (lo usa già il test esistente).

- [ ] **Step 1: Write the failing tests** in `test/run.test.js`:
  - `runMode('direct', dir, { ...quiet, gruppo: 'roma', sources: { ryanair: async () => [fareFCO], wizz: async () => [] } })`:
    - esiste `direct-roma.json` con 1 itinerario;
    - non esistono `direct.json` né `alerts_state_direct.json`.

    `fareFCO` è `fare` con origine e segmenti da/per `FCO` e `id` ricalcolato con `itineraryId('FCO', …)`, prezzo 60.
  - Avvisi solo Puglia: prezzo 60 (sotto 80), `env: {}`.
    - Con `gruppo: 'puglia'` → `alerts_state_direct.json` esiste (`processAlerts` scrive lo stato anche senza credenziali Telegram: controllalo leggendo `src/alerts.js`; se non lo scrive, verifica con uno stub di `log` che compaia la riga degli avvisi).
    - Con `gruppo: 'roma'` → il file non esiste.
  - Il test esistente «ogni modalità ha il proprio file dati…» resta valido.
- [ ] **Step 2: Run** `node --test test/run.test.js`: atteso FAIL
- [ ] **Step 3: Implement.** `isValid` controlla `CONSTRAINTS.origins` (gli aeroporti del processo), ma nei test `gruppo` cambia senza cambiare l'env. Quindi:
  - `isValid(it, now, origins = CONSTRAINTS.origins)` in `src/filter.js`;
  - `mergeSource(prevFile, sourceName, result, now, origins = CONSTRAINTS.origins)` in `src/store.js`, che lo passa a `isValid`;
  - `runMode` passa `GRUPPI[gruppo].aeroporti`.

  Google chiama `isValid(it, now)` da solo e resta così: in produzione gira nel processo del gruppo.
- [ ] **Step 4: Run** `npm test`: atteso tutto PASS
- [ ] **Step 5: Commit** `feat(run): file dati per gruppo, avvisi solo dalla Puglia`

### Task 3: Storico: aeroporto senza tratte Ryanair

**Files:**
- Modify: `src/history/collect.js:94-98` (`collectRyanair`, elenco tratte)
- Test: `test/history-collect.test.js`

**Interfaces:**
- Produces: in `collectRyanair` un 404 sull'elenco tratte di un aeroporto vale zero tratte da quell'aeroporto. Gli altri errori restano come oggi (`stoppedReason = 'elenco tratte non scaricabile: …'`).

- [ ] **Step 1: Write the failing test** `collectRyanair: elenco tratte 404 per un aeroporto (es. LIN) → zero tratte da lì, le altre proseguono`. Lo stub `fetchImpl` risponde 404 per `/airport/BDS` e con le tratte del fixture per `/airport/BRI`. Asserzioni: `r.meta.stoppedReason === null`, ogni elemento di `r.routes` ha `origin === 'BRI'`, `r.meta.routesExpected > 0`.
- [ ] **Step 2: Run** `node --test test/history-collect.test.js`: atteso FAIL
- [ ] **Step 3: Implement.** `fetchRetry` lancia `HTTP 404 …` per gli status non ok. Aggiungi a quell'errore `err.status = res.status` e in `collectRyanair` salta l'aeroporto quando `err.status === 404`, con una riga di log `storico ryanair <IATA>: nessuna tratta (404)`.
- [ ] **Step 4: Run** `npm test`: atteso tutto PASS
- [ ] **Step 5: Commit** `fix(storico): aeroporto senza tratte Ryanair non ferma la raccolta`

### Task 4: Workflow e script con matrice dei gruppi

**Files:**
- Modify: `scripts/prepare-history.sh`, `scripts/publish-history.sh` (branch come secondo argomento, default `history`)
- Modify: `.github/workflows/direct.yml`, `connections.yml`, `history.yml`

**Interfaces:**
- Consumes: `GRUPPO` (env), `dataFile`, `historyBranch` (Task 1)
- Produces: `scripts/prepare-history.sh [branch]` crea il worktree `./history` dal branch indicato (orfano se non esiste). `scripts/publish-history.sh <dir> [branch]` pubblica su quel branch. Con il branch assente si comportano come oggi.

- [ ] **Step 1: Script.** In entrambi sostituisci `history` (nome del branch, non della cartella) con `branch="${N:-history}"`. La cartella del worktree resta `history`.
- [ ] **Step 2: Matrice** in tutti e tre i workflow, a livello di job:
  ```yaml
  strategy:
    fail-fast: false
    matrix:
      include:
        - { gruppo: puglia, suffix: '', state: alerts_state_direct.json, branch: history }
        - { gruppo: milano, suffix: '-milano', state: '', branch: history-milano }
        - { gruppo: bergamo, suffix: '-bergamo', state: '', branch: history-bergamo }
        - { gruppo: roma, suffix: '-roma', state: '', branch: history-roma }
  ```
  In `connections.yml` `state` vale `alerts_state_connections.json` per puglia. In `history.yml` servono solo `gruppo` e `branch`.
  - `env: GRUPPO: ${{ matrix.gruppo }}` sul passo `node …`.
  - Pubblicazione dati: `bash scripts/publish-data.sh ./data direct${{ matrix.suffix }}.json ${{ matrix.state }}`. Per i gruppi non Puglia `state` è vuoto, quindi lo stato degli avvisi non si ripubblica mai (Review Focus 2).
  - Storico: `bash scripts/prepare-history.sh ${{ matrix.branch }}` e `bash scripts/publish-history.sh ./history ${{ matrix.branch }}`. Il passo `summary` e `publish-summary` girano solo con `matrix.gruppo == 'puglia'` (aggiungi la condizione all'`if`).
  - `name` del job con il gruppo: `name: ${{ matrix.gruppo }}`. Il `concurrency` resta a livello di workflow com'è.
- [ ] **Step 3: Verify syntax.** Per i tre workflow esegui `ruby -ryaml -e 'YAML.load_file(ARGV[0])' <file>` (nessun output = ok). Per gli script esegui `bash -n scripts/prepare-history.sh scripts/publish-history.sh`.
- [ ] **Step 4: Verify script locally**, in una cartella temporanea con `git init --bare` come origin finto: `prepare-history.sh history-prova` crea un worktree orfano su `history-prova`, un file lì dentro, poi `publish-history.sh ./history history-prova`. Il branch remoto `history-prova` deve esistere e `history` no.
- [ ] **Step 5: Commit** `ci: un job per gruppo nelle ricerche e nello storico`

### Task 5: Controllo giornaliero per gruppo

**Files:**
- Modify: `src/health.js`
- Test: `test/health.test.js`

**Interfaces:**
- Consumes: `GRUPPI`, `dataFile`, `historyBranch` (Task 1)
- Produces:
  - `checkData(file, mode, now, fileName = LIMITS[mode].file)`: il messaggio «non trovati» usa `fileName`
  - `allChecks()` aggiunge per ogni gruppo diverso da `puglia`:
    - `'Dati voli diretti · <bacino o gruppo>'`
    - `'Dati voli con scalo · <…>'`
    - `'Storico prezzi · <…>'`

    Etichette: `Milano`, `Bergamo`, `Roma`, cioè il nome del gruppo con l'iniziale maiuscola. Leggono `DATA_URL + dataFile(mode, g)` e `https://raw.githubusercontent.com/WaxenPie679/voli-weekend/<historyBranch(g)>/…`. Le voci Puglia esistenti restano con i nomi di oggi.
  - `probeWizz` resta sulla Puglia; il testo «nessuna rotta da Bari o Brindisi» resta valido perché usa `CONSTRAINTS.origins` del processo di health, cioè la Puglia.

- [ ] **Step 1: Write the failing tests:**
  - le chiavi di `allChecks({ now, env: {}, fetchImpl })` includono `'Dati voli diretti · Milano'`, `'Dati voli con scalo · Roma'` e `'Storico prezzi · Bergamo'`, e contengono ancora `'Dati voli diretti'` e `'Storico prezzi'`
  - `'Storico prezzi · Roma'` chiama URL che contengono `/voli-weekend/history-roma/2026/11/` (stile del test esistente a riga 103)
  - `'Dati voli diretti · Milano'` con stub 404 → un problema che contiene `direct-milano.json`
- [ ] **Step 2: Run** `node --test test/health.test.js`: atteso FAIL
- [ ] **Step 3: Implement.** `historyProblems(now, fetchImpl, baseUrl = HISTORY_URL)` e `dataProblems(mode, now, fetchImpl, gruppo = 'puglia')`
- [ ] **Step 4: Run** `npm test`: atteso tutto PASS
- [ ] **Step 5: Commit** `feat(health): il check-up controlla anche Milano, Bergamo e Roma`

### Task 6: Prova vera su GitHub (dopo push del ramo)

Non è codice: lo fa chi coordina, dopo la revisione.

- [ ] Push del ramo; lanciare a mano `direct.yml`, `connections.yml` e `history.yml` sul ramo con `gh workflow run <file> --ref feat/bacini-milano-roma`.

  Attenzione: la pubblicazione scrive sui branch veri `data` e `history-*`. È voluto: i file Puglia non cambiano nome e i gruppi nuovi scrivono file propri.
- [ ] Controllare:
  - ogni job è verde e la durata sta sotto i limiti;
  - il branch `data` ha `direct-{milano,bergamo,roma}.json` e `connections-*.json` con voli;
  - esistono `history-{milano,bergamo,roma}` con il file del giorno e il meta (`routesOk` vicino a `routesExpected`);
  - `alerts_state_direct.json` non è cambiato per colpa dei job non Puglia.
- [ ] Lanciare `health.yml` con `always: true` e leggere il resoconto.
