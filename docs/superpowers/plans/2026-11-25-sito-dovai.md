# Sito DoVai · primo pezzo · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sito statico dovaivoli.it (home esploratore, 3 bacini, biglietto aperto, Premium finto, pagine di fiducia) preparato ogni ora dai dati del ramo `data`.

**Architecture:** `sito/build.js` scarica i `direct*.json`, li riduce (`sito/dati.js`), scrive HTML completo con template string (`sito/parti/`, `sito/pagine/`) e un `voli.json` leggero in `sito/dist/`. Nel browser `esplora.js` filtra `voli.json` usando la stessa logica pura (`sito/statico/js/logica.js`) testata in Node. GitHub Action oraria pubblica con `wrangler pages deploy`.

**Tech Stack:** Node ≥ 24, ES modules, `luxon` (già presente), `node:test`; nel browser JS semplice senza framework; CSS a mano coi token Limonaia; `wrangler` solo via `npx` nella Action.

**Spec:** `docs/superpowers/specs/2026-11-25-sito-dovai-design.md` (leggerlo per intero: testi, regole, scelte dopo la revisione).

## Global Constraints

- Testi da `~/Progetti/Voli Weekend Servizio/testi/` (HOME, BACINI, SCHEDA-VOLO, SERVIZIO, PRIVACY); voce GUIDA §3: frasi intere, il tu, niente punti esclamativi in serie; prezzi `69 € a/r`; tratte `Bari → Parigi`; frecce solo nel carattere mono.
- Email pubblica **info@dovaivoli.it** (mai ciao@).
- Linate (LIN) non compare mai: bacino Milano e Bergamo = «Malpensa e Orio al Serio» (MXP, BGY).
- Solo **Weekend**, solo **prossimi 3 mesi**, solo voli diretti; Weekend lungo e mesi oltre → lucchetto Premium.
- Filtro prezzo: 30–400 € a/r, all'apertura **100 € a/r**. Ordine: dal più economico. «Mostra altri voli» a blocchi di 12. Riquadro canale dopo il 6° biglietto (home), dopo il 3° (bacino).
- Nessun cookie, nessuna richiesta a terzi tranne Cloudflare Web Analytics; caratteri Gabarito / JetBrains Mono / DM Sans serviti da `dist/caratteri/` (woff2, OFL).
- Palette: `brand/token/colori.css` (carta #FBF5E9, moro #2A1A14, limone #FFDD45 solo fondo, ruggine #A6401F, foglia #B5D095). Contrasto WCAG AA.
- «Vedi su Kiwi» = bottone pieno ruggine; «Vedi su {compagnia}» = solo contorno; entrambi `target="_blank" rel="noopener"`. Mai «link affiliato» finché `KIWI_AFFILIATO` è vuoto. Mai «costa uguale».
- Ogni punto da contare porta `data-conta="…"` (valori: `kiwi`, `compagnia`, `premium-passa`, `premium-lucchetto`, `canale`, `email`, `filtro`).
- Nessuna nuova dipendenza npm.
- Lingua dei messaggi di commit e dei commenti: italiano, come il resto del repo.

## Review Focus

1. **Bacino senza dati o con dati vecchi (> 24 h):** la pagina dice «Stiamo iniziando a seguire i voli da qui. I primi prezzi arrivano a giorni.», ha `noindex`, non va in sitemap; la preparazione non fallisce. Se mancano *tutti* i bacini, la preparazione esce con errore. → Task 1 e Task 6.
2. **«visto alle» a cavallo della mezzanotte e del fuso:** `seenAt` è UTC; si mostra in ora di Roma; «ieri» se il giorno di Roma è quello prima di oggi; oltre ieri → «visto il 22 nov alle 9:30». → Task 2.
3. **Filtri senza risultati e indirizzi strani:** `?max=abc`, `?da=napoli`, `?mese=2030-01` non rompono nulla (si torna ai valori iniziali); zero voli → «Con questi filtri non c'è niente.» + «Togli i filtri». → Task 7.
4. **Ricerca destinazione con accenti e maiuscole:** «malaga» trova «Málaga», «LISBONA» trova «Lisbona». → Task 7.
5. **Tempo sul posto con voli notturni:** andata sab 06:45 arrivo 07:40, ritorno dom 06:00 → «22 ore a Tirana» (sotto un giorno si dice in ore); arrivo ven 23:50 ritorno dom 23:00 → «1 giorno e 23 ore». → Task 2.

---

## File Structure

```
sito/
  config.js            URL dati, bacini, costanti (KIWI_AFFILIATO, prezzi, blocchi)
  titolare.js          nome e città del titolare (vuoti) + titolareCompleto()
  dati.js              scarica e riduce i dati, numeri dei bacini (puro tranne scarica)
  formati.js           date, durate, «visto alle», prezzo, link Kiwi, chiave volo (puro; usato anche nel browser)
  parti/html.js        h`` (escape) e utilità
  parti/testa.js parti/piede.js parti/biglietto.js parti/filtri.js parti/riquadri.js parti/lucchetto.js
  pagine/home.js pagine/bacino.js pagine/premium.js pagine/servizio.js pagine/errore.js
  build.js             orchestra: dati → pagine → dist/
  statico/css/sito.css statico/js/logica.js statico/js/esplora.js statico/caratteri/*.woff2 statico/img/*
test/sito/             dati.test.js formati.test.js pagine.test.js logica.test.js build.test.js fixtures/
.github/workflows/sito.yml
```

`formati.js` e `logica.js` non importano luxon né moduli Node: girano identici nel browser (copiati in `dist/js/`). Per il fuso usano `Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome' })`.

---

### Task 1: Riduzione dei dati e numeri dei bacini

**Files:**
- Create: `sito/config.js`, `sito/dati.js`, `test/sito/dati.test.js`, `test/sito/fixtures/direct-mini.json` (6–10 itinerari presi da `git show origin/data:direct.json`, ritoccati per coprire i casi)

**Interfaces:**
- Produces:
  - `config.js`: `BACINI = [{ slug:'puglia', nome:'Puglia', aeroporti:['BRI','BDS'], file:['direct.json'] }, { slug:'milano-bergamo', nome:'Milano e Bergamo', aeroporti:['MXP','BGY'], file:['direct-milano.json','direct-bergamo.json'] }, { slug:'roma', nome:'Roma', aeroporti:['FCO','CIA'], file:['direct-roma.json'] }]`; `DATI_URL = 'https://raw.githubusercontent.com/WaxenPie679/voli-weekend/data/'`; `PREZZO_INIZIALE = 100`, `PREZZO_MIN = 30`, `PREZZO_MAX = 400`, `BLOCCO = 12`, `VECCHIO_ORE = 24`, `KIWI_AFFILIATO = ''`, `SITO = 'https://dovaivoli.it'`, `EMAIL = 'info@dovaivoli.it'`, `AEROPORTI_NOMI = { BRI:'Bari', BDS:'Brindisi', MXP:'Malpensa', BGY:'Orio al Serio', FCO:'Fiumicino', CIA:'Ciampino' }`.
  - `dati.js`: `async scaricaDati({ cartella?: string }) → { [file]: object|null }` (da cartella locale se data, altrimenti da `DATI_URL`; file mancante/illeggibile → `null`)
  - `riduci(grezzi, { adesso: Date }) → { voli: Volo[], bacini: { [slug]: StatoBacino } }`
  - `Volo = { k, o, d, citta, paese, va:[dep,arr], ri:[dep,arr], cia, p, url, w, visto, resta }` (`k` = chiave da `chiaveVolo`, `resta` = minuti dall'arrivo andata alla partenza ritorno, `p` prezzo arrotondato all'euro per eccesso)
  - `StatoBacino = { pronto: boolean, aggiornato: string|null, numero: number, piuBasso: Volo|null, mete: [{ citta, d, p }] }` (`numero` = voli con `p ≤ PREZZO_INIZIALE`; `mete` = le 8 città più economiche del bacino, una volta ciascuna)

- [ ] **Step 1: test che falliscono** in `test/sito/dati.test.js`:
  - `riduci tiene per origine+destinazione+weekend al più un volo per fascia di permanenza`: con 5 itinerari BRI→TIA stesso weekend (permanenze 20h, 30h, 50h, 50h più caro, 80h) → restano 4 (`resta` < 1440, ≥ 1440, ≥ 2880, ≥ 4320 ciascuno il più economico della propria fascia; quello da 50h più caro sparisce).
  - `riduci scarta LIN e i prezzi oltre 400`: un itinerario `origin:'LIN'` e uno a 401 € non compaiono.
  - `riduci ordina dal più economico`.
  - `bacino senza file → pronto false`; `bacino con generatedAt di 25 ore prima di adesso → pronto false`; `bacino aggiornato → numero e piuBasso corretti`.
  - `mete: una sola volta per città, max 8, dalla più economica`.
- [ ] **Step 2:** `node --test test/sito/dati.test.js` → FAIL (modulo mancante).
- [ ] **Step 3:** implementare `config.js` e `dati.js` (permanenza calcolata con `Date.parse` sugli orari locali come stringhe ISO senza fuso, trattate entrambe come ora locale: la differenza è giusta perché andata e ritorno sono nello stesso fuso della destinazione per l'arrivo e la partenza).
- [ ] **Step 4:** `node --test test/sito/dati.test.js` → PASS.
- [ ] **Step 5:** commit `feat(sito): riduzione dei dati e numeri dei bacini`.

### Task 2: Formati (date, durate, «visto alle», link Kiwi)

**Files:**
- Create: `sito/formati.js`, `test/sito/formati.test.js`

**Interfaces:**
- Produces (tutte pure, senza import):
  - `giornoBreve('2026-12-12T18:40') → 'ven 12 dic'`; `ora('2026-12-12T18:40') → '18:40'`
  - `permanenza(minuti, citta) → '2 giorni e 1 ora a Parigi'` (sotto 24 h: `'22 ore a Tirana'`; singolari: `1 giorno`, `1 ora`; ore 0 → solo giorni: `'2 giorni a Parigi'`)
  - `visto(seenAtIso, adesso: Date) → 'visto alle 9:30' | 'visto ieri alle 22:10' | 'visto il 22 nov alle 9:30'` (ora di Roma, ora senza zero iniziale)
  - `prezzo(69) → '69 € a/r'`
  - `chiaveVolo({ o, d, va }) → 'bri-cdg-2026-12-12-1840'` (minuscolo)
  - `linkKiwi(volo, affiliato = '') → 'https://www.kiwi.com/it/search/results/{o}/{d}/{dataAndata}/{dataRitorno}?adults=1'` (+ `&affilid={affiliato}` solo se non vuoto)
  - `normalizza(testo) → testo senza accenti, minuscolo` (per la ricerca)
- [ ] **Step 1: test che falliscono**, con questi casi esatti: `permanenza(1500,'Parigi')==='1 giorno e 1 ora a Parigi'`; `permanenza(1320,'Tirana')==='22 ore a Tirana'`; `permanenza(2880,'Parigi')==='2 giorni a Parigi'`; `permanenza(2820,'Lisbona')==='1 giorno e 23 ore a Lisbona'`; `visto('2026-11-25T08:30:00Z', new Date('2026-11-25T12:00:00Z'))==='visto alle 9:30'`; `visto('2026-11-24T21:10:00Z', new Date('2026-11-25T08:00:00Z'))==='visto ieri alle 22:10'`; `visto('2026-11-24T23:30:00Z', new Date('2026-11-25T08:00:00Z'))==='visto alle 0:30'` (già oggi a Roma); `visto('2026-11-22T08:30:00Z', new Date('2026-11-25T08:00:00Z'))==='visto il 22 nov alle 9:30'`; `normalizza('Málaga')==='malaga'`; `linkKiwi` senza affiliato non contiene `affilid`.
- [ ] **Step 2:** `node --test test/sito/formati.test.js` → FAIL.
- [ ] **Step 3:** implementare con `Intl.DateTimeFormat('it-IT', { timeZone:'Europe/Rome', … })` per `visto`; `giornoBreve` e `ora` lavorano sulla stringa locale (nessun fuso: è l'ora dell'aeroporto).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(sito): formati di date, permanenza, visto alle e link Kiwi`.

### Task 3: Titolare e blocco della pubblicazione

**Files:**
- Create: `sito/titolare.js`, aggiungere test in `test/sito/dati.test.js` (o `test/sito/titolare.test.js`)

**Interfaces:**
- Produces: `TITOLARE = { nome: '', citta: '' }`; `titolareCompleto(t = TITOLARE) → boolean`; `testoTitolare(t) → 'Nome Cognome, Città'` oppure `'[Nome e cognome], [città]'` se vuoti.
- [ ] **Step 1:** test: vuoto → `false` e segnaposto; pieno → `true` e testo.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(sito): titolare in un solo file`.

### Task 4: Aspetto e parti della pagina (con impeccable)

Prima di scrivere CSS e markup, invocare la skill `impeccable:impeccable` con: palette e caratteri dai Global Constraints, GUIDA (`brand/GUIDA.md` §3 e regole visive), logo `brand/logo/ufficiale/dovai-moro.svg`, favicon `favicon.svg`/`favicon.ico`, biglietto disegnato in HOME §3 e SCHEDA-VOLO. Telefono prima (375 px): un biglietto per riga; computer: griglia 2–3 colonne, larghezza massima del contenuto ~1100 px.

**Files:**
- Create: `sito/parti/html.js`, `testa.js`, `piede.js`, `biglietto.js`, `filtri.js`, `riquadri.js`, `lucchetto.js`, `sito/statico/css/sito.css`, `sito/statico/caratteri/` (woff2 latin di Gabarito 700/800, JetBrains Mono 400/700, DM Sans 400/500/700 scaricati da Google Fonts), `sito/statico/img/` (copie dei svg del logo e favicon), `test/sito/pagine.test.js`

**Interfaces:**
- Consumes: `formati.js` (Task 2), `config.js` (Task 1), `titolare.js` (Task 3)
- Produces:
  - `h(strings, ...values) → string` (tagged template; escape dei valori tranne quelli marcati con `grezzo(str)`)
  - `testa({ titolo, descrizione, percorso, indicizza: boolean }) → string` (`<head>` completo: meta, og:, canonical `SITO+percorso`, `noindex` se `!indicizza`, css, preload caratteri, beacon Cloudflare Web Analytics con token da `process.env.CF_BEACON` — se vuoto, niente beacon)
  - `intestazione() → string`, `piede() → string` (testi HOME «Piede», info@, «Questo sito non usa cookie per seguirti»)
  - `biglietto(volo, { adesso, aperto?: false }) → string` (`<article data-k>` con tutte le voci di HOME §3; parte aperta di SCHEDA-VOLO parte 1 e 4 dentro `<details>` così funziona senza JS)
  - `filtri({ bacino?: slug }) → string` (form GET con i controlli di HOME §2; Weekend lungo e mesi oltre il 3° col lucchetto)
  - `riquadroCanale({ bacino?: slug }) → string`, `riquadroPremium() → string`, `lucchetto(etichetta) → string` (svg disegnato, mai emoji)
- [ ] **Step 1: test che falliscono** in `pagine.test.js`: `biglietto` contiene `Bari → Parigi`, `69 € a/r`, `solo zaino`, `data-conta="kiwi"`, `data-conta="compagnia"`, `Vedi su Ryanair`, `rel="noopener"`, `Compra o aspetta?`; **non** contiene `link affiliato` né `uguale`; `h` fa escape di `<script>`; `piede()` contiene `info@dovaivoli.it` e non `ciao@`; `filtri()` ha il cursore con `min="30" max="400" value="100"`.
- [ ] **Step 2:** FAIL. **Step 3:** implementare parti e CSS seguendo impeccable. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(sito): aspetto Limonaia e parti della pagina`.

### Task 5: Pagine

**Files:**
- Create: `sito/pagine/home.js`, `bacino.js`, `premium.js`, `servizio.js` (come-funziona, domande, privacy, note-legali), `errore.js` (404); test in `test/sito/pagine.test.js`

**Interfaces:**
- Consumes: parti (Task 4), `StatoBacino`/`Volo` (Task 1), `TITOLARE` (Task 3)
- Produces: ogni modulo esporta `pagina(ctx) → { percorso: string, html: string, indicizza: boolean }` (servizio.js esporta `pagine(ctx) → [...]`), con `ctx = { voli, bacini, adesso }`.
  - home: HOME §1, filtri, primi 12 voli tutti i bacini ≤ 100 €, riquadro canale dopo il 6°, «Mostra altri voli», §6 Premium, §7 «Dove si va nel weekend» (mete dai tre bacini, link `/?a={citta normalizzata}`), piede. Niente §5.
  - bacino: testi BACINI col testo Milano corretto senza Linate; introduzione con `{numero}`, `{tratta}`, `{prezzo}`; se `!pronto` → frase «Stiamo iniziando…» e `indicizza:false`.
  - premium: «Premium non c'è ancora» (GUIDA) + `mailto:info@dovaivoli.it?subject=Avvisami%20quando%20parte%20Premium` con `data-conta="premium-avvisami"`; `indicizza:false`.
  - servizio: testi da `testi/SERVIZIO.md` e `testi/PRIVACY.md` (privacy ridotta come da spec; segnaposto da `testoTitolare`).
- [ ] **Step 1:** test: home indicizzata, contiene H1 esatto «I voli economici del weekend, controllati ogni giorno», non contiene «Come cambiano i prezzi»; bacino milano-bergamo contiene «Malpensa e Orio al Serio» e non «Linate»; bacino non pronto ha `noindex` e la frase; privacy con titolare vuoto contiene `[Nome e cognome]`.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(sito): home, bacini, Premium, pagine di servizio e 404`.

### Task 6: Preparazione completa (`build.js`)

**Files:**
- Create: `sito/build.js`, `test/sito/build.test.js`; Modify: `package.json` (script `"sito": "node sito/build.js"`, `"sito:vedi": "node sito/build.js --data ./data && node scripts/serve.js sito/dist"` se `serve.js` accetta la cartella, altrimenti aggiungere quel parametro), `.gitignore` (`sito/dist/`)

**Interfaces:**
- Consumes: tutto il resto.
- Produces: CLI `node sito/build.js [--data <cartella>] [--out <cartella>] [--pubblica]`; funzione `async prepara({ cartella, out, adesso, pubblica }) → { pagine: number, avvisi: string[] }`.
  - scrive pagine come `percorso/index.html`, `404.html`, `voli.json` (solo `voli`), `sitemap.xml` (solo pagine indicizzate), `robots.txt` (con Sitemap), `_headers` (html `max-age=300`, css/js/caratteri `max-age=31536000, immutable` con nome col contenuto in hash oppure `?v=` dell'ora di build), copia `statico/` e `formati.js`, `logica.js`.
  - `--pubblica` con `titolareCompleto() === false` → esce con codice 1 e messaggio «Mancano nome e città del titolare in sito/titolare.js: il sito non si pubblica.»
  - tutti i bacini non pronti → codice 1.
- [ ] **Step 1:** test con `test/sito/fixtures/` in cartella temporanea: produce `index.html`, `puglia/index.html`, `voli.json`; sitemap non contiene i bacini non pronti; `prepara({ pubblica:true })` con titolare vuoto rigetta col messaggio; dimensione di `voli.json` con i dati veri di oggi ≤ 1,5 MB non compressi (prova manuale nello Step 4).
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS, poi `node sito/build.js` sui dati veri e annotare numero pagine e peso di `voli.json` (`gzip -c sito/dist/voli.json | wc -c` ≤ 300 000).
- [ ] **Step 5:** commit `feat(sito): preparazione completa in sito/dist`.

### Task 7: Esploratore nel browser

**Files:**
- Create: `sito/statico/js/logica.js`, `sito/statico/js/esplora.js`, `test/sito/logica.test.js`

**Interfaces:**
- Consumes: `formati.js` (stesse funzioni nel browser), `voli.json`.
- Produces:
  - `leggiFiltri(searchParams, { bacino? }) → Filtri` con `Filtri = { da: 'tutti'|slug|codice, mese: 'tre'|'YYYY-MM', max: number, resta: 0|1|2|3, a: string }`; valori non validi → valori iniziali (`da` = bacino della pagina o `tutti`, `mese:'tre'`, `max:100`, `resta:0`, `a:''`).
  - `scriviFiltri(filtri, { bacino? }) → string` (query senza i valori iniziali)
  - `filtra(voli, filtri, BACINI) → Volo[]` (ordinati per prezzo)
  - `riepilogo(n, filtri) → '42 voli da Puglia, Weekend, fino a 100 € a/r'` (`'1 volo'` al singolare; «da tutti gli aeroporti» se `tutti`)
  - `esplora.js`: carica `/voli.json`, legge i filtri, ridisegna la lista coi biglietti (stessa struttura HTML di `biglietto()`: per non duplicare, `biglietto` sta in un modulo condiviso `sito/statico/js/biglietto-html.js` importato sia da `parti/biglietto.js` sia nel browser — spostarlo qui se il Task 4 l'ha messo altrove), `history.replaceState` coi filtri, «Mostra altri voli», `?volo=` apre quel biglietto, lucchetti → `/premium`.
- [ ] **Step 1: test** in `logica.test.js`: `leggiFiltri(new URLSearchParams('max=abc&da=napoli&mese=2030-01'))` → valori iniziali; `filtra` con `a:'malaga'` trova `Málaga`; `filtra` con `resta:2` esclude un volo da 1500 minuti; `riepilogo(1, …)` al singolare; `scriviFiltri(valori iniziali)===''`.
- [ ] **Step 2:** FAIL. **Step 3:** implementare. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(sito): filtri e biglietti nel browser`.

### Task 8: Pubblicazione automatica

**Files:**
- Create: `.github/workflows/sito.yml`, `.claude/launch.json` (voce `sito` che serve `sito/dist` su una porta libera ≠ 5180)
- Modify: `README.md` (sezione «Sito dovaivoli.it»: come si prepara in locale, cosa deve fare Bruno su Cloudflare)

**Interfaces:**
- `sito.yml`: `on: schedule '41 * * * *'`, `workflow_dispatch`, `push` su `main` con `paths: ['sito/**', '.github/workflows/sito.yml']`; job: checkout, node 24, `npm ci`, `npm test`, `node sito/build.js --pubblica` (env `CF_BEACON: ${{ vars.CF_BEACON }}`), poi `npx wrangler@3 pages deploy sito/dist --project-name dovai --branch main` con `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` dai secret; `concurrency: sito`, `timeout-minutes: 10`. Se i secret mancano il passo di deploy si salta con un avviso (non errore), così il ramo funziona prima che Bruno faccia la sua parte.
- [ ] **Step 1:** `npm test` tutto verde.
- [ ] **Step 2:** validare la sintassi del workflow (`npx --yes @action-validator/cli .github/workflows/sito.yml` se disponibile, altrimenti lettura attenta).
- [ ] **Step 3:** commit `ci(sito): preparazione e pubblicazione ogni ora`.

### Task 9: Verifica

- [ ] **Step 1:** `node sito/build.js` sui dati veri; `preview_start` della voce `sito`.
- [ ] **Step 2:** a 375 px e su computer: filtri (ognuno), zero risultati, biglietto aperto, `?volo=`, lucchetti → /premium, «Mostra altri voli», 404, pagina con JS disattivato (i primi biglietti ci sono).
- [ ] **Step 3:** skill `design:accessibility-review` sulle pagine (contrasti su limone e ruggine, tastiera, etichette dei filtri) e `design:design-critique`; correggere.
- [ ] **Step 4:** Lighthouse telefono: prestazioni e accessibilità ≥ 90.
- [ ] **Step 5:** commit delle correzioni; poi superpowers:finishing-a-development-branch (PR verso `main`).
