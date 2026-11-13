# Voli della settimana dal grafico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toccando una settimana nel grafico «Quando comprare», vedere i voli che partono in quella settimana a partire da oggi, con prezzo di oggi, orario e link «Cerca».

**Architecture:** La raccolta salva anche l'orario (nuova colonna `orario` nel CSV giornaliero, campo `time` nelle osservazioni); il riepilogo aggiunge a ogni volo l'ultimo orario noto; la pagina calcola i voli della settimana scelta dai `flights` già presenti nel file della tratta (funzioni pure in `web/storico-view.js`, DOM in `web/storico.js`).

**Tech Stack:** Node 24, moduli ES, `node --test`; HTML/CSS/JS statici, SVG a mano.

**Spec:** `docs/superpowers/specs/2026-11-13-voli-della-settimana-design.md`

## Global Constraints

- Testi e commenti in italiano; nessuna dipendenza nuova.
- CSV giornaliero: intestazione `compagnia,origine,destinazione,data_partenza,stato,prezzo,orario`; i file senza la colonna `orario` (12 e 13 novembre) si leggono con orario vuoto, senza riscriverli.
- Orario: Ryanair `HH:MM-HH:MM` (partenza-arrivo del volo più economico); Wizz partenze `HH:MM` separate da uno spazio, in ordine crescente; `''` se mancante. Mai virgole.
- Un cambio del solo orario è un cambiamento (riga nel file del giorno).
- Settimana N = partenze con `lastDay + 7·N ≤ data ≤ lastDay + 7·N + 6` (`lastDay` = ultimo giorno raccolto); settimane da 0 a 52.
- Nell'elenco solo le partenze il cui stato attuale è `prezzo`; esaurite e da verificare solo contate.
- Non toccare SMOT (porta 5180).

## Review Focus

1. **Storico misto** (file vecchi senza `orario` + file nuovi): lettura, rigioco e riepilogo senza errori → test in Task 1 e 2.
2. **Primo giro dopo il rilascio**: tutte le chiavi cambiano solo per l'orario → il file di quel giorno è più grande una volta sola; nessun `nessun_volo` finto → test in Task 1.
3. **Rerun nello stesso giorno** (run.js unisce le righe per chiave): l'orario segue la riga più recente → test in Task 1.
4. **Settimana vuota o oltre l'ultimo volo** e tratta con una sola compagnia → test in Task 3.
5. **Link «Cerca»** che aprono davvero la pagina giusta di Ryanair e Wizz con tratta e data → verifica nel browser in Task 3.

---

### Task 1: Orario nella raccolta

**Files:**
- Modify: `src/history/observe.js`, `src/history/store.js`, `src/history/run.js` (solo se serve per l'unione delle righe)
- Test: `test/history-observe.test.js`, `test/history-store.test.js`, `test/history-run.test.js`

**Interfaces:**
- Produces: `Obs` con il campo in più `time: string` (`''` se ignoto). `encodeCsv` scrive la 7ª colonna; `decodeCsv` legge 6 o 7 colonne; `diffState` considera cambiamento anche `prev.time !== o.time`.

- [ ] **Step 1: Test che falliscono**
  - `parseRyanairDays`: fare con `departureDate: '2026-12-01T10:05:00'`, `arrivalDate: '2026-12-01T11:55:00'` → `time: '10:05-11:55'`; fare senza date → `''`; fare esaurita → `time` calcolato se le date ci sono, altrimenti `''`.
  - `parseWizzDays`: `departureDates: ['2026-11-06T21:40:00', '2026-11-06T15:20:00']` → `time: '15:20 21:40'`; nessuna partenza → `''`.
  - `encodeCsv`/`decodeCsv`: andata e ritorno con `time`; un CSV con l'intestazione vecchia a 6 colonne (costruito a mano con `gzipSync`) → righe con `time: ''`.
  - `diffState`: stessa chiave, stesso stato e prezzo, orario diverso → riga in uscita; stesso orario → nessuna riga.
  - `runHistory` (test esistente con collettori finti): un giorno precedente scritto in formato vecchio (6 colonne) + giro di oggi con orari → nessun errore; il file di oggi contiene le righe con l'orario; nessuna riga `nessun_volo` in più rispetto al caso senza orari.
  - Rerun nello stesso giorno con orario cambiato → il file del giorno ha l'orario nuovo.
- [ ] **Step 2: Run** `node --test test/history-observe.test.js test/history-store.test.js test/history-run.test.js` → FAIL.
- [ ] **Step 3: Implementare.** Orari estratti con `slice(11, 16)` dalle stringhe ISO; nessun cambio di fuso.
- [ ] **Step 4: Run** gli stessi test → PASS; `npm test` verde tranne i 2 test noti di `test/ryanair.test.js`.
- [ ] **Step 5: Commit** `feat(storico): salva l'orario dei voli nella raccolta`.

---

### Task 2: Orario nel riepilogo

**Files:**
- Modify: `src/history/summary.js`
- Test: `test/history-summary.test.js`

**Interfaces:**
- Consumes: `Obs.time` (Task 1).
- Produces: in `RouteSummary.airlines[a].flights` ogni voce diventa `[data, cambi, orario]`, dove `orario` è il `time` dell'ultima riga di quel volo (`''` se ignoto o assente). `cambi` resta `[[giorno, stato, prezzo]]`.

- [ ] **Step 1: Test che falliscono:** volo con due righe (`time` `''` il 12, `'10:05-11:55'` il 14) → terzo elemento `'10:05-11:55'`; volo solo da righe senza `time` (formato vecchio) → `''`; il test esistente sui `flights` aggiornato al nuovo formato.
- [ ] **Step 2: Run** `node --test test/history-summary.test.js` → FAIL.
- [ ] **Step 3: Implementare** (tenere l'ultimo `time` per volo mentre si rigiocano i giorni).
- [ ] **Step 4: Run** → PASS; `npm test` come sopra. Verificare che `web/storico-view.js` (`upcomingDepartures`, `stepPoints`) e `web/storico.js` funzionino ancora con il terzo elemento (leggono solo `[0]` e `[1]`): eseguire `node --test test/storico-view.test.js`.
- [ ] **Step 5: Commit** `feat(storico): orario dei voli nel riepilogo`.

---

### Task 3: Voli della settimana nella pagina

**Files:**
- Modify: `web/storico-view.js`, `web/storico.js`, `web/storico.html`, `web/style.css`, `web/sw.js` (cache `voli-weekend-v5`), `web/sample/summary/*`
- Test: `test/storico-view.test.js`

**Interfaces:**
- Consumes: `flights: [data, cambi, orario][]` (Task 2).
- Produces (in `web/storico-view.js`, pure):
  - `weekRange(lastDay, w) -> [from, to]` date `YYYY-MM-DD`.
  - `weekFlights(file, lastDay, w) -> { rows: {date, airline, time, price}[], unavailable: number }` — righe ordinate per data poi compagnia; stato attuale = ultimo cambio; `unavailable` = partenze della settimana con stato attuale `esaurito` o `da_verificare`.
  - `timeText(time) -> string` — `'10:05-11:55'` → `'10:05 → 11:55'`; `'15:20 21:40'` → `'15:20 · 21:40'`; `''` → `''`.
  - `searchUrl(airline, from, to, date) -> string` — Ryanair `https://www.ryanair.com/it/it/trip/flights/select?adults=1&teens=0&children=0&infants=0&dateOut=<data>&isReturn=false&originIata=<da>&destinationIata=<a>`; Wizz `https://wizzair.com/it-it/booking/select-flight/<da>/<a>/<data>/null/1/0/0/null`. Se nel browser uno dei due formati non apre la pagina giusta, correggerlo e aggiornare il test.

- [ ] **Step 1: Test che falliscono:** `weekRange('2026-11-13', 6)` → `['2026-12-25', '2026-12-31']`, settimana 0 → `['2026-11-13', '2026-11-19']`; `weekFlights` su un file di prova con due compagnie: righe nell'intervallo, ordine, prezzo attuale (ultimo cambio), esclusione di un volo il cui ultimo cambio è `esaurito` con `unavailable` 1, settimana senza voli → `{rows: [], unavailable: 0}`, compagnia assente nel file → ignorata; `timeText` sui tre casi; `searchUrl` sui due formati.
- [ ] **Step 2: Run** `node --test test/storico-view.test.js` → FAIL.
- [ ] **Step 3: Implementare** le funzioni pure, poi la pagina come da spec §Design 3: tocco/click/Invio su una settimana del grafico «Quando comprare» (anche senza punti) seleziona la settimana (fascia verticale evidenziata, scelta mantenuta al ridisegno e azzerata al cambio di tratta); riquadro «Voli che partono tra N settimane» con date, righe `gio 25 dic · 10:05 → 11:55 · Ryanair · 42,96 €` e pulsante «Cerca» (`target="_blank" rel="noopener"`), prezzo più basso evidenziato, riga «N voli esauriti» se `unavailable > 0`, nota «Prezzi della raccolta di stanotte: sul sito della compagnia vedi quello di adesso.»; prima del tocco «Tocca una settimana per vedere i voli che partono in quel periodo.»; settimana vuota «Nessun volo con prezzo in questa settimana.» Il tooltip esistente resta. Testi inseriti solo con `textContent`.
- [ ] **Step 4: Dati di esempio:** rigenerare `web/sample/summary/` dallo storico vero con il nuovo `summary.js` (stesse 4 tratte), aggiungendo a mano un orario a qualche volo se lo storico non ne ha ancora, così la pagina di esempio li mostra.
- [ ] **Step 5: Run** `npm test` → verde tranne i 2 test noti.
- [ ] **Step 6: Verifica nel browser** (`preview_start` `voli-weekend`, `/storico.html?sample=1`, larghezza 375 e desktop): tocco su una settimana mostra l'elenco; cambio tratta azzera; nessun errore in console; aprire un link «Cerca» Ryanair e uno Wizz e verificare che mostrino tratta e data giuste.
- [ ] **Step 7: Commit** `feat(web): voli della settimana toccando il grafico`.
