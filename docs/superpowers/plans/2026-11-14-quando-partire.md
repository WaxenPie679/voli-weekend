# Quando partire — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nella pagina Storico prezzi, una carta «Quando partire» mostra per ogni weekend dei prossimi 12 mesi il prezzo andata+ritorno più basso con i prezzi di oggi, in due viste (Weekend, Weekend lungo), e al tocco i due voli scelti.

**Architecture:** Funzioni pure in `web/storico-view.js` combinano i `flights` dei due file di direzione già pubblicati (`<CASA>-<DEST>.json` e `<DEST>-<CASA>.json`); `web/storico.js` scarica anche il file della direzione opposta e disegna la carta riusando `frame()` e `interact()`. Nessuna modifica a raccolta o riepilogo.

**Tech Stack:** HTML/CSS/JS statici senza build, SVG a mano, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-14-quando-partire-design.md`

## Global Constraints

- Testi e commenti in italiano; nessuna dipendenza nuova; testi inseriti nel DOM solo con `textContent`.
- Prezzo di oggi di una partenza = ultimo cambio di `flights[i][1]` con stato `prezzo` e prezzo non `null`; partenze con data `< lastDay` escluse (il riepilogo tiene anche partenze passate fino a 30 giorni).
- Weekend identificato dal **sabato**; primo weekend = il primo sabato `s` con `s + 1 giorno ≥ lastDay`; 53 weekend (fino a 52 settimane dopo).
- **Weekend:** andata venerdì con orario ≥ `18:00` oppure sabato; ritorno domenica.
- **Weekend lungo:** andata giovedì, venerdì (qualsiasi ora) o sabato; ritorno domenica o lunedì.
- Venerdì sera: Ryanair (`HH:MM-HH:MM`) se la partenza (prima parte) ≥ `18:00`; Wizz (`HH:MM HH:MM`) se almeno una partenza ≥ `18:00`; orario `''` → escluso.
- Compagnie mescolabili tra andata e ritorno. Andata sempre da Bari/Brindisi (`BRI`/`BDS`) verso la destinazione, qualunque direzione sia selezionata.
- Testi fissi: titolo «Quando partire»; sottotitolo «Andata e ritorno · prezzi di oggi»; pulsanti «Weekend» / «Weekend lungo»; riga «Il più economico: <date> · <prezzo>»; weekend vuoto «Nessuna combinazione con prezzo per questo weekend.»; ritorno mancante «Ritorno non disponibile per questa tratta.»; nota «Prezzi della raccolta di stanotte: sul sito della compagnia vedi quello di adesso.»
- Non toccare SMOT (porta 5180).

## Review Focus

1. **Partenze passate nel file** (riepilogo con voli partiti da ≤30 giorni): non devono entrare nelle combinazioni → test in Task 1.
2. **`lastDay` di domenica o lunedì**: il weekend in corso resta il primo (ritorno ancora possibile nel lungo), senza andate nel passato → test in Task 1.
3. **Venerdì con orario sconosciuto o mattutino** nella vista Weekend → escluso; nel lungo incluso → test in Task 1.
4. **File del ritorno assente o non scaricabile** (tratta presente in una sola direzione nell'indice, rete giù): la carta lo dice, il resto della pagina funziona; risposta tardiva dopo un cambio tratta scartata → verifica in Task 2.
5. **Direzione «Ritorno» selezionata in alto**: la carta mostra comunque andata da casa e ritorno verso casa, con i link «Cerca» nella direzione giusta → verifica in Task 2.

---

### Task 1: Combinazioni andata e ritorno (logica pura)

**Files:**
- Modify: `web/storico-view.js`
- Test: `test/storico-view.test.js`

**Interfaces:**
- Produces (export da `web/storico-view.js`):
  - `weekendSaturdays(lastDay: string) -> string[]` — 53 sabati `YYYY-MM-DD` crescenti.
  - `fridayEvening(airline: string, time: string) -> boolean`.
  - `weekendDays(saturday: string, mode: 'weekend'|'lungo') -> { out: string[], back: string[] }` — weekend: out `[ven, sab]`, back `[dom]`; lungo: out `[gio, ven, sab]`, back `[dom, lun]`.
  - `roundTrips(outFile, backFile, lastDay: string, mode) -> Trip[]` con `Trip = { saturday, out: Leg|null, back: Leg|null, total: number|null }`, `Leg = { date, airline, time, price }`; una voce per ogni sabato di `weekendSaturdays`; `total` = `out.price + back.price` arrotondato ai centesimi, `null` (e entrambe le gambe `null`) se manca andata o ritorno. Scelta: andata più economica valida e ritorno più economico valido (indipendenti); a parità di prezzo data più vicina, poi `ryanair` prima di `wizz`. `outFile`/`backFile` `null` → tutte le voci vuote.
  - `cheapestTrip(trips: Trip[]) -> Trip|null` — `total` minimo, a parità il sabato più vicino.

- [ ] **Step 1: Test che falliscono** in `test/storico-view.test.js`, con file costruiti a mano (`{ airlines: { ryanair: { flights: [[data, [[giorno, stato, prezzo]], orario]] }, wizz: {...} } }`):
  - `weekendSaturdays('2026-11-14')[0] === '2026-11-14'`, `[1] === '2026-11-21'`, lunghezza 53, ultimo `'2027-11-13'`; `weekendSaturdays('2026-11-15')[0] === '2026-11-14'` (domenica: weekend in corso); `weekendSaturdays('2026-11-16')[0] === '2026-11-21'`.
  - `fridayEvening`: `('ryanair','19:05-21:00')` true, `('ryanair','17:55-19:40')` false, `('wizz','06:10 18:30')` true, `('wizz','06:10 12:00')` false, `('ryanair','')` false.
  - `weekendDays('2026-12-12','weekend')` → `{ out: ['2026-12-11','2026-12-12'], back: ['2026-12-13'] }`; lungo → `{ out: ['2026-12-10','2026-12-11','2026-12-12'], back: ['2026-12-13','2026-12-14'] }`.
  - `roundTrips`, vista weekend: venerdì Ryanair 20 € alle `07:00-08:50` ignorato, sabato Wizz 35 € scelto, domenica Ryanair 25 € → `total 60`, `out.airline 'wizz'`, `back.airline 'ryanair'`; stessa base in vista lungo → venerdì 20 € scelto, `total 45`; lunedì 10 € usato solo nel lungo.
  - Ultimo cambio `esaurito` dopo un `prezzo` → gamba ignorata; weekend senza ritorno → `{ out: null, back: null, total: null }`.
  - Partenza con data `< lastDay` (es. `lastDay` domenica `'2026-11-15'`, andata sabato 14) → ignorata; il ritorno di domenica 15 resta valido ma il weekend ha `total null` senza andata.
  - Parità di prezzo andata ven/sab → venerdì; parità tra compagnie stesso giorno → ryanair.
  - `roundTrips(file, null, ...)` → 53 voci con `total null`.
  - `cheapestTrip`: sceglie il minimo, parità → sabato più vicino; tutte `null` → `null`.
- [ ] **Step 2: Run** `node --test test/storico-view.test.js` → FAIL (export mancanti).
- [ ] **Step 3: Implementare** le cinque funzioni in `web/storico-view.js` riusando `dayMs`, `isoDay`, `DAY_MS`, `AIRLINE_ORDER` già presenti. I prezzi di oggi per data si ricavano una volta per file (mappa data → gambe).
- [ ] **Step 4: Run** `node --test test/storico-view.test.js` → PASS; `npm test` verde tranne i 2 test noti di `test/ryanair.test.js` (dipendenti dalla data).
- [ ] **Step 5: Commit** `feat(storico): combinazioni andata e ritorno per weekend`.

---

### Task 2: Carta «Quando partire» nella pagina

**Files:**
- Modify: `web/storico.html` (template), `web/storico.js`, `web/style.css`, `web/sw.js` (cache `voli-weekend-v6`), `web/sample/summary/BDS-TRN.json`, `web/sample/summary/TRN-BDS.json` (solo se servono dati per mostrare entrambe le viste)
- Test: `test/storico-view.test.js` solo se si aggiungono funzioni pure

**Interfaces:**
- Consumes: `weekendSaturdays`, `weekendDays`, `roundTrips`, `cheapestTrip`, più gli esistenti `timeText`, `searchUrl`, `priceDomain`, `scale`; in `storico.js` gli esistenti `frame`, `interact`, `getJson`, `routes`, `loadSeq`, `fmtPrice`, `fmtDeparture`, `AIRLINES`.
- Produces: nessuna interfaccia per altri task.

- [ ] **Step 1: Template.** In `#route-template`, dopo la carta «I singoli voli», una `article.chart-card` con `h3` «Quando partire», `p.chart-sub` «Andata e ritorno · prezzi di oggi», un `.seg` con due radio `name="trip-mode"` valori `weekend`/`lungo` (etichette «Weekend» / «Weekend lungo»), `p.trip-best`, `div.chart[data-chart="trips"]`, `div.trip-detail[aria-live="polite"]`, `p.chart-note.trip-note`.
- [ ] **Step 2: Dati.** In `storico.js`: casa = `route.from` se è `BRI`/`BDS`, altrimenti `route.to`; dest = l'altro. `outKey = casa-dest`, `backKey = dest-casa`. Dopo `renderRoute`, se uno dei due file non è in `routes`, scaricarlo con `getJson` (mostrando «Carico il ritorno…» nella carta) con la guardia `loadSeq`; errore o chiave assente dall'indice → «Ritorno non disponibile per questa tratta.» nella sola carta. `current` guadagna `trip: { mode, saturday }`; `saturday` torna `null` al cambio di tratta; `mode` si salva in `localStorage` (chiave `voli-weekend-storico-trip`, letture e scritture in try/catch), default `weekend`.
- [ ] **Step 3: Grafico.** `drawTrips()` chiamata da `drawAll()`: `frame` con `xDomain [0, 52]` (indice del sabato), `yDomain priceDomain(totali non null)`, tacche x al primo sabato di ogni mese con il mese abbreviato («dic», «gen»; su schermo stretto un mese sì e uno no); una barra verticale per weekend con `total`, larghezza ~70% del passo, colore `price-blue` di `DESIGN.md`, la più economica evidenziata (classe `lowest`); fascia di selezione come `week-band` di «Quando comprare». `interact`: il tooltip mostra le date del weekend e il totale (o «nessuna combinazione»); tocco/Invio seleziona il weekend e ridisegna il riquadro. Il cambio di vista ridisegna grafico e riquadro mantenendo il sabato scelto.
- [ ] **Step 4: Riga del più economico e riquadro.** `p.trip-best`: «Il più economico: 13–14 dic · 58,40 €» con le date di andata e ritorno della combinazione scelta (`fmtDay`); nessuna combinazione nell'anno → riga vuota e nel grafico «Nessuna combinazione con prezzo per ora.». Prima del tocco il riquadro dice «Tocca un weekend per vedere andata e ritorno.»; dopo il tocco: titolo con l'intervallo di `weekendDays` (`ven 11 dic – dom 13 dic`), riga Andata e riga Ritorno nello stesso stile di `.week-row` (giorno, `timeText`, compagnia con pallino, prezzo, «Cerca» con `searchUrl(airline, casa, dest, date)` per l'andata e `searchUrl(airline, dest, casa, date)` per il ritorno, `target="_blank" rel="noopener"`), poi «Totale <prezzo>». Weekend vuoto → «Nessuna combinazione con prezzo per questo weekend.». Nota fissa sotto quando c'è una combinazione mostrata.
- [ ] **Step 5: Stile e cache.** Regole in `web/style.css` per barre, `lowest`, riquadro (riusare le classi `week-*` dove possibile); `web/sw.js` cache `voli-weekend-v6` (l'elenco SHELL non cambia).
- [ ] **Step 6: Dati di esempio.** Controllare che in `?sample=1` Brindisi→Torino mostri combinazioni in entrambe le viste e che almeno un weekend cambi tra Weekend e Weekend lungo; se no, aggiungere a mano in `BDS-TRN.json`/`TRN-BDS.json` qualche partenza giovedì/lunedì e un venerdì serale con orario.
- [ ] **Step 7: Run** `npm test` → verde tranne i 2 test noti.
- [ ] **Step 8: Verifica nel browser** (`preview_start` `voli-weekend`, `/storico.html?sample=1`, larghezza 375 e desktop): Brindisi → Torino mostra barre e riga del più economico; cambio vista cambia almeno un weekend; tocco mostra andata e ritorno con link nella direzione giusta; con direzione «Ritorno» selezionata la carta è identica; tratta BRI-BUD funziona; nessun errore in console; rimuovere temporaneamente il fetch del file di ritorno (es. scegliendo una chiave inesistente in console o bloccando la richiesta) e vedere «Ritorno non disponibile per questa tratta.».
- [ ] **Step 9: Commit** `feat(web): grafico Quando partire con andata e ritorno per weekend`.
