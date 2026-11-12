# Storico prezzi — Design (tappa 1: raccolta dati)

Data: 2026-11-12
Stato: bozza da approvare

## 1. Intento e perché

Bruno vuole capire, **per ogni singola tratta**, quanto tempo prima della partenza i prezzi di Ryanair e Wizz iniziano di solito a salire (es. "Brindisi→Torino: conviene comprare entro 5 settimane, poi sale"). Per saperlo serve lo **storico**: il prezzo di ogni data di partenza osservato giorno dopo giorno, da quando il volo è in vendita fino a quando parte.

Oggi Voli Weekend non conserva nessuno storico: il branch `data` contiene un solo commit, riscritto a ogni giro. Ogni giorno senza raccolta è storico perso, quindi l'evolutiva è divisa in tappe e **questa prima tappa riguarda solo la raccolta**, da mettere in produzione il prima possibile.

Tappe concordate:

1. **Raccolta dati** (questo documento).
2. **Dashboard del forecast** come nuova pagina della webapp: progettata a parte, tra qualche settimana, guardando dati veri.
3. **Consigli nell'app** (schede voli e avvisi Telegram, tipo "di solito sale tra 3 settimane: compra ora"), quando i dati saranno sufficienti.

Successo per la tappa 1: ogni giorno, senza interventi, lo storico si allunga di una giornata completa per tutte le tratte; se un giorno la raccolta fallisce, Bruno lo sa da Telegram e il buco è visibile come buco nei dati.

## 2. Requisiti (decisi da Bruno)

| Parametro | Valore |
|---|---|
| Compagnie | Ryanair e Wizz Air |
| Tratte | tutte quelle da **e per** BRI e BDS, entrambe le direzioni |
| Giorni | **tutti i giorni** della settimana, non solo il weekend |
| Tipo di prezzo | sola andata, 1 adulto, tariffa base (la più bassa del giorno) |
| Archiviazione | file nello stesso progetto GitHub (approccio A), gratis |
| Ordine | prima la dashboard, poi i consigli nell'app |

## 3. Obiettivi, non-obiettivi, anti-obiettivi

**Obiettivi**
- Una foto al giorno, per ogni tratta e ogni data di partenza in vendita, del prezzo più basso.
- Storico completo e onesto: si distingue "prezzo invariato", "non disponibile/esaurito" e "non osservato".
- Formato pensato per calcolare, nella tappa 2, la curva prezzo ↔ giorni mancanti alla partenza.

**Non-obiettivi (tappa 1)**
- Nessuna interfaccia: niente dashboard, niente modifiche alla webapp.
- Niente Google Voli, niente andata/ritorno, niente scali, niente altri aeroporti.
- Niente tracciamento del singolo numero di volo (le API danno il più economico del giorno).
- Niente modelli di previsione: arrivano con la tappa 2.

**Anti-obiettivi (sarebbe un fallimento anche se "funziona")**
- Rallentare o far fallire la ricerca ogni 15 minuti (`direct.yml`), per esempio perché le compagnie limitano le richieste dall'indirizzo di GitHub.
- Costi di qualsiasi tipo.
- Storico che cresce senza controllo (obiettivo: decine di MB l'anno, mai vicino a 1 GB).
- Buchi nascosti: un giorno o una tratta non raccolti non devono sembrare "prezzo invariato".

## 4. Vincoli

- Progetto pubblico `WaxenPie679/voli-weekend`: GitHub Actions e spazio gratuiti; lo storico sarà pubblico (accettato, sono prezzi pubblici).
- Node 24, moduli ES, test con `node --test`, codice e messaggi in italiano, come il resto del progetto.
- API pubbliche non ufficiali: possono cambiare; un errore su una tratta non deve fermare le altre.
- I file su GitHub restano sotto 100 MB ciascuno; il progetto sotto 1 GB.
- Non toccare il comportamento di `data`, `direct.yml`, `connections.yml`. SMOT (porta 5180) non è coinvolto.

## 5. Approcci considerati

| | Approccio | Pro | Contro | Esito |
|---|---|---|---|---|
| A | File compatti in un branch dedicato `history` dello stesso repo, solo i cambi di prezzo | Gratis, nessun account nuovo, stesso schema già collaudato | Analisi possibili solo quelle previste nel codice | **Scelto da Bruno** |
| B | Database esterno gratuito (es. Supabase) | Interrogazioni libere | Account e chiavi da configurare, limiti del piano gratuito, pausa per inattività, un pezzo in più che può rompersi | Scartato |
| C | Allegati dei giri di GitHub Actions (artifact) | Nessun commit | Si cancellano dopo 90 giorni | Scartato |

## 6. Fonti (verificate il 2026-11-12)

**Ryanair**
- Tratte: `GET https://www.ryanair.com/api/views/locate/searchWidget/routes/it/airport/{BRI|BDS}` → elenco con `arrivalAirport.code`, `city.name`, `country.name`, `timeZone`, `connectingAirport` (oggi 62 tratte da BRI, 25 da BDS, nessuna con scalo; quelle con `connectingAirport` vanno escluse).
- Prezzi: `GET https://www.ryanair.com/api/farfnd/v4/oneWayFares/{DA}/{A}/cheapestPerDay?outboundMonthOfDate=YYYY-MM-01&currency=EUR` → `outbound.fares[]` con `day`, `departureDate`, `price.value` (EUR, oppure `null`), `soldOut`, `unavailable`. Un mese per richiesta. Prezzi presenti fino a ~11 mesi avanti (verificato BDS→TRN a ottobre 2027).
- Direzione di ritorno: stessa chiamata invertendo `{DA}/{A}`.

**Wizz Air**
- Versione API e tratte: come oggi (`wizzVersion`, `asset/map`, `parseWizzRoutes` in `src/sources/wizz.js`; 15 tratte da BRI, 4 da BDS).
- Prezzi: `POST https://be.wizzair.com/<v>/Api/search/timetable` con andata e ritorno nella stessa richiesta, finestra di **massimo 30 giorni**. `outboundFlights[]` / `returnFlights[]` per giorno con `price.amount` (EUR; `0` = nessun volo/prezzo), `departureDates[]`. Prezzi presenti fino a ~11 mesi avanti (verificato BRI↔BUD a ottobre 2027).
- Le chiamate vanno fatte con il `fetch` di Node: con `curl` l'API timetable restituisce una risposta vuota.

## 7. Design

### 7.1 Flusso giornaliero

Nuovo workflow `history.yml`, **una volta al giorno**, a un minuto non tondo nelle prime ore del mattino (proposta: 03:41 UTC), più `workflow_dispatch`. Concorrenza propria (`group: history`), timeout ~60 minuti.

1. Scarica le tratte attuali di Ryanair e Wizz per BRI e BDS (entrambe le direzioni).
2. Per ogni tratta e direzione, raccoglie i prezzi di tutte le date di partenza da oggi fino a 12 mesi avanti:
   - Ryanair: 1 richiesta per tratta × direzione × mese (~87 × 2 × 12 ≈ 2.100 richieste).
   - Wizz: 1 richiesta per tratta × finestra di 30 giorni (andata e ritorno insieme; ~19 × 13 ≈ 250 richieste).
3. Confronta con l'ultimo stato noto e scrive **solo i cambiamenti** del giorno.
4. Pubblica sul branch `history` con un nuovo commit (i commit si accumulano, non si riscrivono).

Le richieste sono distanziate (Ryanair ~0,5–1 s, Wizz ~1,5 s come oggi) per un totale stimato di 25–40 minuti.

### 7.2 Cosa si registra

Una **osservazione** è: giorno di raccolta (data di Roma), compagnia, origine, destinazione, data di partenza, prezzo in EUR oppure stato.

Stati possibili per una data di partenza in una tratta osservata con successo quel giorno (scelta del progettista: tenerli separati costa poco e non si può recuperare dopo):
- **prezzo** — numero in EUR;
- **esaurito** — Ryanair `soldOut: true`; un esaurito vicino alla partenza è esso stesso un segnale di prezzo;
- **da verificare** — Wizz con `price.amount: 0` e `priceType: "checkPrice"` ma con orari di partenza: il volo esiste ed è in vendita, ma il calendario non mostra il prezzo. Si registra lo stato e, come prezzo indicativo, `originalPrice.amount` se presente. Nessuna chiamata in più (rischio limiti). La tappa 2 deciderà come usarli; il caso c'è nel fixture `test/fixtures/wizz-timetable.json` (BRI→BUD 2026-11-08);
- **nessun volo** — Ryanair `unavailable: true` o prezzo assente; Wizz `0` senza orari di partenza; oppure una data sparita da un mese che prima la conteneva.

Se una tratta (o un mese di una tratta) **non è stata raccolta** per errore, per quel giorno non si scrive nulla e la tratta finisce nell'elenco degli errori del giorno (vedi 7.4): così la tappa 2 sa che è "non osservata", non "invariata".

**Tratte che spariscono dall'elenco** (scelta del progettista): se una tratta non compare più nell'elenco della compagnia, o l'elenco stesso non si riesce a scaricare, non si scrive nessuna riga per le sue date: si annota "non osservata" nel `.meta.json` del giorno e `routes.json` conserva la data dell'ultima volta vista. Nessun "esaurito" o "nessun volo" inventato per un problema dell'API. Il confronto dei cambiamenti si fa solo sulle tratte osservate con successo quel giorno.

Le date di partenza già passate escono naturalmente dallo stato; non serve registrarle.

### 7.3 Formato e spazio

Branch `history`, separato da `data`. Proposta di struttura:

```
history/
  YYYY/MM/YYYY-MM-DD.csv.gz     cambiamenti del giorno (il primo giorno: tutto)
  YYYY/MM/YYYY-MM-DD.meta.json  riepilogo del giro (vedi 7.4)
  routes.json                   anagrafica tratte: codice, città, paese, fuso, compagnia, prima/ultima volta vista
```

- Una riga per cambiamento: `compagnia,origine,destinazione,data_partenza,stato,prezzo` con `stato` tra `prezzo`, `esaurito`, `da_verificare`, `nessun_volo` (prezzo vuoto se non c'è; per `da_verificare` è il prezzo indicativo). Cambia riga quando cambia lo stato o il prezzo.
- Un file per giorno, scritto una volta e **mai più modificato**: Git conserva ogni file una sola volta e lo spazio cresce solo con i cambi reali. Stima: qualche decina di MB l'anno.
- **Nessun file riscritto ogni giorno** dentro lo storico permanente (si accumulerebbero centinaia di MB di versioni). Lo stato "ultimo prezzo noto" si ricostruisce rileggendo i file giornalieri (pochi MB), oppure si tiene in un posto che non accumula versioni: scelta lasciata al costruttore. Fa eccezione `routes.json`, piccolo, riscritto solo quando cambia.

### 7.4 Errori e controllo

- Errore su una tratta o un mese: si salta solo quello, si annota nel `.meta.json` e si prosegue.
- Risposte 429 (troppe richieste): pausa crescente e nuovo tentativo; se continuano, la fonte si ferma per quel giorno e si salva quanto raccolto (giornata marcata come parziale). La raccolta non deve mai insistere al punto da far bloccare dalle compagnie anche la ricerca ogni 15 minuti.
- `.meta.json` del giorno: ora di inizio e fine e, **per ogni compagnia**, tratte attese/riuscite, richieste riuscite/fallite, elenco di tratte e mesi non raccolti, motivo dell'eventuale stop (es. 429), numero di righe scritte. La "completezza" si legge per compagnia, non come un unico sì/no.
- Il check-up giornaliero esistente (`health.yml` / `src/health.js`) controlla anche lo storico (scelta del progettista), con Telegram solo in caso di problemi come oggi:
  - nessun giro dello storico registrato da più di ~30 ore;
  - una compagnia con meno della metà delle tratte raccolte per **2 giorni di fila** (così un blocco silenzioso emerge, ma un paio di mesi falliti non fanno scattare un avviso ogni giorno).
- `keepalive.yml` riattiva anche `history.yml`.

### 7.5 Comando locale

`npm run history` esegue la raccolta in una cartella locale (default `./history`), utile per provarla senza GitHub.

## 8. Anteprima della tappa 2 (non si costruisce ora)

Ogni giorno, dopo la raccolta, un riepilogo già calcolato per tratta (file JSON piccolo) con la curva del prezzo mediano rispetto ai giorni mancanti alla partenza e il punto in cui di solito inizia a salire. La dashboard, nuova pagina della webapp, leggerà solo quel riepilogo. Prime indicazioni attese dopo 2–3 mesi di raccolta (ultimi 60 giorni prima della partenza); curva completa e differenze tra stagioni dopo circa un anno. Il formato della tappa 1 deve bastare a calcolare tutto questo senza conversioni.

## 9. Lasciato al costruttore

- Come ricostruire o conservare lo "stato più recente" senza far crescere lo storico (vincolo in 7.3).
- Nomi esatti di moduli e funzioni; riuso del codice Wizz esistente.
- Valori precisi di pause, tentativi e timeout entro i limiti indicati.
- Come pubblicare sul branch `history` (script nuovo o variante di `publish-data.sh`, che oggi riscrive l'unico commit di `data` e quindi non va usato così com'è).
