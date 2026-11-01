# Voli Weekend — Design

Data: 2026-11-01
Stato: bozza da approvare

## 1. Intento e perché

Bruno vuole viaggiare solo nel fine settimana, fuori dagli orari di lavoro, spendendo il meno possibile e **senza decidere prima la destinazione**. La domanda a cui il tool risponde è: *"dove posso andare questo weekend (o in uno dei prossimi) partendo da Bari o Brindisi, al prezzo più basso?"*.

Oggi questa ricerca richiede di provare a mano molte combinazioni su più siti. Il tool la fa al posto suo, di continuo, e lo avvisa quando compare un'occasione vera.

Successo = aprire la webapp (prima su PC, poi su iPhone) e vedere sempre una panoramica aggiornata dei weekend più economici, e ricevere su Telegram un avviso quando esce un andata/ritorno sotto gli 80 €.

## 2. Requisiti (decisi da Bruno)

| Parametro | Valore |
|---|---|
| Aeroporti di partenza | BRI (Bari), BDS (Brindisi) |
| Andata | venerdì con partenza dalle 18:00 in poi, oppure sabato a qualsiasi ora |
| Ritorno | domenica, con arrivo entro le 23:59 della domenica stessa |
| Orizzonte | prossimi 8 weekend, finestra scorrevole (passato un weekend, si aggiunge il successivo) |
| Prezzo massimo | 200 € andata + ritorno |
| Destinazioni | tutte, nessuna lista predefinita (né per i diretti né per gli scali) |
| Voli | diretti, oppure al massimo 1 scalo |
| Scali | solo biglietto unico (stessa prenotazione), scalo ≤ 3 ore |
| Refresh diretti (Ryanair, Wizz) | il più veloce possibile → obiettivo ogni 15 minuti |
| Refresh scali (Google Flights) | più lento accettato → ogni ~4 ore |
| Avvisi | Telegram, per ogni andata/ritorno < 80 € |
| Costo | zero: solo servizi e API gratuite |
| Codice | pubblico su GitHub (accettato) |
| Uso | prima su PC, poi installata su iPhone; la ricerca gira sempre in background |
| Vincolo locale | non deve entrare in conflitto con il gestionale SMOT su `http://127.0.0.1:5180` |

## 3. Obiettivi, non-obiettivi, anti-obiettivi

**Obiettivi**
- Panoramica sempre fresca dei weekend più economici, ordinabile per prezzo, data, destinazione.
- Copertura aperta a tutte le destinazioni, diretti e 1 scalo.
- Avvisi Telegram utili, mai ripetitivi.
- Webapp installabile su iPhone (PWA) senza App Store.

**Non-obiettivi (v1)**
- Prenotare: il tool porta al sito della compagnia / a Google Flights, non compra nulla.
- Storico prezzi e grafici di andamento.
- App nativa iOS / App Store.
- Notifiche push della PWA (possibile fase successiva; v1 = Telegram).
- Altre partenze o altri giorni della settimana.

**Anti-obiettivi (sarebbe un fallimento anche se "funziona")**
- Scali "fai da te" su due biglietti separati presentati come normali.
- Avvisi spam: lo stesso volo notificato ogni 15 minuti.
- Prezzi vecchi mostrati come attuali senza indicarne l'età.
- Rompere o rallentare SMOT su `127.0.0.1:5180`.
- Esporre segreti (token Telegram) nel codice pubblico.
- Qualunque costo ricorrente.

## 4. Approcci considerati

Comune a tutti: la ricerca gira su **GitHub Actions** (gratis e illimitato perché il repo è pubblico), avvisi via bot Telegram.

- **A) Webapp pubblicata su GitHub Pages + copia locale sul PC** — *scelta da Bruno*. Una sola pagina statica, servita in locale su una porta diversa da 5180 per l'uso su PC, e pubblicata su GitHub Pages per l'iPhone e per quando il PC è spento. Contro: l'URL è pubblico (nessun dato personale esposto).
- **B) Webapp solo locale** che legge i dati da GitHub. Scartata: per l'iPhone andrebbe comunque pubblicata; rimanda soltanto un passo già voluto.
- **C) Tutto locale, ricerca compresa** (scheduler di Windows). Scartata: si ferma a PC spento ed espone l'IP di casa a blocchi/captcha di Google.

Motivo della scelta: A dà subito l'uso su PC e la strada pronta per l'iPhone, a costo zero.

Sul perché pubblico: GitHub Actions su repo privato ha 2.000 minuti/mese gratis; il refresh ogni 15 minuti ne consuma ~3.500 + ~700 per gli scali. Su repo pubblico i minuti sono illimitati.

## 5. Architettura

```
GitHub repo (pubblico)
├── workflow "diretti"   ogni 15 min  → Ryanair + Wizz → data/direct.json
├── workflow "scali"     ogni 4 h     → Google Flights → data/connections.json
├── dopo ogni run        → confronto con data/alerts_state.json → Telegram
└── GitHub Pages         → webapp statica (PWA) che legge i JSON

PC di Bruno
└── server statico locale su 127.0.0.1:5190 (stessa webapp)
```

### 5.1 Fonte diretti: Ryanair
- Endpoint pubblico non ufficiale del "fare finder" (`/api/farfnd/.../roundTripFares`): da un aeroporto verso **qualsiasi destinazione**, con finestre di data e orario per andata e ritorno, prezzo massimo, valuta EUR.
- Per ogni weekend e ogni aeroporto: 2 query (andata venerdì ≥ 18:00 / andata sabato), ritorno domenica. Totale ≈ 2 aeroporti × 8 weekend × 2 = **32 richieste per giro**: volume basso.
- Il filtro "arrivo entro le 23:59 di domenica" va applicato dopo, sull'orario di arrivo (l'API filtra per orario di partenza).

### 5.2 Fonte diretti: Wizz Air
- API pubblica non ufficiale del sito: prima l'elenco delle rotte attive da BRI/BDS, poi la ricerca tariffe/timetable per rotta e periodo.
- Rotte da BRI/BDS sono poche decine → volume contenuto.
- **Rischio noto**: Wizz cambia spesso versione dell'API e usa protezioni anti-bot. Va trattata come fonte "best effort": se fallisce, la webapp lo mostra e il resto continua a funzionare.

### 5.3 Fonte scali: Google Flights
- Flusso a due passi, per restare sotto la soglia di blocco senza una lista di destinazioni:
  1. **Esplora** ("da BRI/BDS verso ovunque", max 1 scalo) per ogni combinazione weekend × aeroporto × giorno di andata: restituisce il prezzo minimo per molte destinazioni in una sola richiesta.
  2. **Dettaglio** solo per le destinazioni sotto i 200 €: verifica biglietto unico, scalo ≤ 3 ore, orari dentro le finestre.
- Impostazioni: lingua/paese Italia, valuta EUR, 1 adulto.
- Richiede probabilmente un browser headless (Playwright) sul runner di GitHub; pause casuali tra le richieste.
- Su Google Flights i voli con scalo sono in grande maggioranza biglietti unici di compagnie tradizionali (ITA, Lufthansa, Turkish…), protetti in caso di coincidenza persa. Gli itinerari "self-transfer" vanno esclusi.
- I voli diretti trovati da Google (es. ITA/Aeroitalia/Volotea su BRI/BDS) vanno inclusi anch'essi: allargano la copertura oltre Ryanair/Wizz.

### 5.4 Logica comune di filtro
Un itinerario entra nei risultati solo se:
- partenza da BRI o BDS;
- andata venerdì con partenza ≥ 18:00, oppure sabato;
- ritorno domenica dello stesso weekend con arrivo ≤ 23:59;
- ≤ 1 scalo per tratta, biglietto unico, ogni scalo ≤ 3 h;
- prezzo totale A/R ≤ 200 €.

Il weekend è identificato dal venerdì (es. `2026-11-06`). Finestra = gli 8 weekend a partire dal prossimo venerdì non ancora passato (se è venerdì prima delle 18:00, include quello corrente).

### 5.5 Dati
- `direct.json` e `connections.json`: lista itinerari + `updated_at` + stato della fonte (ok / errore + messaggio).
- Ogni itinerario: origine, destinazione (codice, città, paese), compagnia, orari andata/ritorno, scali, prezzo totale, fonte, link di prenotazione, data rilevazione.
- Se una fonte fallisce, si mantengono gli ultimi dati validi marcati con la loro età (mai cancellati né spacciati per freschi).

### 5.6 Avvisi Telegram
- Soglia: prezzo totale A/R < 80 €.
- Si avvisa solo se l'itinerario è **nuovo** sotto soglia o se il suo prezzo è **sceso** rispetto all'ultimo avviso.
- Stato in `alerts_state.json` (chiave = origine+destinazione+date+voli).
- Messaggio: destinazione, weekend, orari, compagnia, diretto/scalo, prezzo, link.
- Token del bot e chat ID in **GitHub Secrets**, mai nel codice. Il bot lo crea Bruno (BotFather) e inserisce lui token e chat ID nei Secrets.

### 5.7 Webapp
- Pagina statica, nessun backend. Installabile come PWA (manifest, service worker, icone, meta iOS) e responsive dal primo giorno.
- Vista principale: per ogni weekend, le destinazioni più economiche; filtri per aeroporto, diretto/scalo, prezzo, compagnia; ordinamento per prezzo.
- Indicatore di freschezza per fonte ("diretti aggiornati 7 min fa", "scali aggiornati 3 h fa"), con avviso evidente se una fonte è ferma o in errore.
- Ricarica automatica dei dati mentre la pagina è aperta.
- **Locale su PC**: server statico su `127.0.0.1:5190` (mai 5180), avviabile con un comando/collegamento; legge gli stessi JSON pubblicati.

## 6. Vincoli e rischi

- **API non ufficiali**: Ryanair, Wizz e Google possono cambiare senza preavviso. Mitigazione: fonti indipendenti, errori visibili in pagina, ultimi dati validi conservati.
- **Blocchi Google**: volume tenuto basso (Esplora + dettaglio solo sotto soglia), frequenza 4 h. Se i blocchi sono frequenti si allarga l'intervallo.
- **Orari di GitHub Actions**: i job schedulati possono partire con 10–20 minuti di ritardo nei momenti di carico; "ogni 15 minuti" è un obiettivo, non una garanzia.
- **Disattivazione automatica**: GitHub disattiva i workflow schedulati dei repo pubblici dopo 60 giorni senza attività. I commit dei dati dovrebbero bastare a mantenerlo attivo; verificarlo e prevedere un keepalive.
- **Crescita del repo**: un commit ogni 15 minuti sono ~35.000 commit/anno. Pubblicare i dati in modo da non far esplodere la storia (es. branch dati sovrascritto, o artefatti di Pages).
- **Prezzi**: le tariffe low-cost mostrate sono quelle base (bagaglio a mano piccolo); la pagina lo dichiara.

## 7. Lasciato a chi costruisce

- Linguaggio e librerie dello scraper (Python suggerito; Playwright per Google se serve).
- Formato esatto dei JSON e come vengono pubblicati (branch dati vs. artefatti Pages).
- Framework della webapp (va bene anche HTML/JS puro) e design visivo.
- Come avviare il server locale su 5190 (script, collegamento sul desktop).
- Gestione di pause, retry e timeout per fonte.
- Verificare all'inizio, con prove reali, lo stato attuale di ciascun endpoint prima di scrivere il resto.

## 8. Domande aperte per Bruno

1. Account GitHub: **non esiste ancora**, lo crea Bruno (piano gratuito). Lo username determina l'indirizzo della webapp (`<username>.github.io/...`).
2. Passeggeri e bagaglio: **1 adulto, solo bagaglio a mano piccolo**. Soglie 200 € e 80 € a persona, A/R.

**Scelte fatte da Claude (da controllare):**
- Andata "venerdì dalle 18:00" = orario di partenza del volo, non di arrivo.
- Weekend identificato dal venerdì; il weekend corrente resta incluso finché il suo sabato non è finito (ora di Roma), mostrando solo i voli non ancora partiti.
- Scraper in Node invece che in Python (Node 24 è già sul PC, Python no).
- Dati pubblicati su un branch `data` con un solo commit sovrascritto, letti dalla webapp via `raw.githubusercontent.com`.
- Inclusi anche i voli diretti trovati da Google Flights (ITA, Volotea, Aeroitalia…), non solo Ryanair/Wizz.
- Wizz trattata come fonte "best effort" per il rischio di blocchi anti-bot.
- Porta locale 5190.
