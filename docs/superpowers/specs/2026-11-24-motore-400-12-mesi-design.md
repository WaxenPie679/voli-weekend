# Motore prezzi: voli fino a 400 € e weekend fino a 12 mesi

Data: 24/11/2026 · Issue DoVai: WaxenPie679/voli-weekend-servizio#40 · Stato: da approvare
Ramo: `feat/bacini-milano-roma` (contiene già i gruppi Milano, Bergamo, Roma; vedi `2026-11-24-bacini-milano-roma-design.md`)

## Perché

Il sito DoVai mostra voli fino a 400 € andata e ritorno (cursore regolabile, 100 € all'apertura) e weekend fino a 12 mesi: i primi 3 mesi gratis, il resto con Premium. Bruno vuole che Premium serva a **pianificare in anticipo vacanze più grandi**: per questo Premium ha anche i **Weekend lunghi**, che sono una funzione solo Premium.

Oggi il motore scarta i voli sopra i 200 € e guarda 8 weekend.

## Cosa vede chi (decisioni di Bruno, 24/11)

| | Gratis | Premium |
|---|---|---|
| Weekend, mesi 1–3 | sì (ricerca ogni 15 minuti) | sì (gli stessi dati della ricerca) |
| Weekend, mesi 4–12 | no | sì (dallo storico notturno) |
| Weekend lungo, mesi 1–12 | **mai** | sì (dallo storico notturno) |
| Prezzo massimo | 400 € (cursore, 100 € all'apertura) | uguale |

Definizioni (le stesse della scheda «Quando partire», `web/storico-view.js`):
- **Weekend**: andata venerdì con partenza ≥ 18:00 oppure sabato; ritorno domenica.
- **Weekend lungo**: andata giovedì, venerdì o sabato (qualsiasi ora); ritorno domenica o lunedì.

## Obiettivi

1. La ricerca ogni 15 minuti (voli diretti, `direct`) tiene voli fino a 400 € e guarda i weekend dei prossimi 3 mesi (13 weekend).
2. Ogni notte, dopo lo storico, per ogni gruppo si calcola un file **Premium** separato da quello gratis, con:
   - Weekend dei mesi 4–12;
   - Weekend lunghi dei mesi 1–12.
3. La webapp personale di Bruno (che per ora fa da «Premium») mostra tutto: cursore fino a 400 €, elenco dei weekend fino a 12 mesi, interruttore Weekend / Weekend lungo, e la scritta «prezzo di stanotte» sui voli che vengono dallo storico.

## Non obiettivi

- Il sito DoVai e il lucchetto vero (#8). Il repository `voli-weekend` è pubblico: il file Premium è leggibile da chi sa dove cercarlo. La protezione vera nasce con il sito.
- Weekend lunghi nella ricerca ogni 15 minuti.
- Cambiare la mail del martedì (#43): i testi prevedono «3 Weekend lungo» per tutti, in contrasto con la decisione di oggi. Si annota sulla #43.
- Avvisi per Milano, Bergamo e Roma.
- Milano, Bergamo e Roma nella webapp di Bruno (restano solo Puglia, come nel progetto dei bacini).

## Anti-obiettivi (sarebbe un fallimento anche se funziona)

- Weekend lunghi che compaiono nel file gratis (`direct*.json`) o nella parte gratis.
- La ricerca ogni 15 minuti che supera il suo tempo (15 minuti) o fa bloccare Wizz.
- Voli dello storico presentati come se fossero aggiornati ogni 15 minuti.
- Un errore nel calcolo Premium che fa fallire o non pubblicare lo storico del giorno.

## Approcci considerati

1. **Tutto dalla ricerca ogni 15 minuti, 52 weekend.** Wizz impiegherebbe più di 15 minuti per Milano e Roma, con rischio di blocco (503 già visti a novembre). Scartato.
2. **Seconda ricerca ogni 6 ore per i mesi 4–12.** Più fresca ma raddoppia le richieste a Wizz e Ryanair e rifà quello che lo storico raccoglie già. Scartato da Bruno.
3. **Mesi 4–12 e weekend lunghi dallo storico notturno** — scelto da Bruno.
   - 3a. **File calcolato ogni notte** per gruppo, pubblicato sul branch `data` — **scelto da Bruno**.
   - 3b. Calcolo nella pagina dai file per tratta del riepilogo: centinaia di file da scaricare, e il riepilogo esiste solo per la Puglia. Scartato.

## Meno pezzi nel progetto (decisioni di Bruno, 24/11)

Bruno non vuole altra complessità. Con questo lavoro:

- **Via i voli con scalo di Google, del tutto:** `src/sources/google.js`, la modalità `connections` di `src/run.js`, il workflow `connections.yml`, i file `connections*.json`, i controlli nel check-up, la parte dell'app che li legge e li mostra, i test, la dipendenza `playwright` se non serve ad altro. Restano solo Ryanair e Wizz diretti. Se un giorno serviranno, si recuperano dalla cronologia di git.
- **Via Telegram, del tutto:** niente più messaggi né dalla ricerca né dalle tratte seguite; `src/telegram.js`, il workflow `telegram-test.yml`, i segreti nei workflow. **Restano le notifiche nell'app (push)**, sia per «sotto 80 €» sia per le tratte seguite.
- **Il check-up notturno** oggi scrive su Telegram quando qualcosa non va: d'ora in poi manda una **notifica nell'app**, e non controlla più il bot Telegram. **Scelta del costruttore** (senza un canale il check-up non avviserebbe più nessuno).
- I segreti `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` su GitHub li cancella Bruno a mano, dopo il merge.

## Come funziona

### Ricerca ogni 15 minuti (`src/filter.js`, fonti)
- `CONSTRAINTS.maxPrice` 200 → 400 (vale anche per `priceValueTo` di Ryanair).
- `CONSTRAINTS.weekends` 8 → 13.
- Gli avvisi «sotto 80 €» restano solo come notifica nell'app (push): guardando 13 weekend possono arrivare anche per weekend tra 2 e 3 mesi.
- **Se un gruppo non sta più nei 15 minuti** (Wizz passa da 2 a 4 finestre per tratta): non si tolgono weekend, perché la promessa «3 mesi gratis» deve valere per tutti i bacini e il confine con Premium resta unico. Si divide il lavoro del gruppo in due job (Ryanair e Wizz separati, o aeroporti separati). Le pause di Wizz non si accorciano. **Scelta del costruttore.**

### File Premium notturno (nuovo)
- Nuovo modulo (es. `src/history/premium.js`) che legge lo stato corrente dello storico del gruppo (i file giornalieri già scaricati da `prepare-history.sh`, ricostruiti con `replayState`) e calcola le combinazioni.
- Regole delle combinazioni: le stesse di `roundTrips` in `web/storico-view.js` (andata più economica + ritorno più economico tra i giorni utili, anche di compagnie diverse; venerdì del Weekend solo se la partenza è ≥ 18:00; parità: data più vicina, poi Ryanair). Conviene spostare queste regole in un modulo condiviso usato sia dalla pagina sia dal calcolo notturno, così non divergono.
- **Venerdì sera di Wizz:** lo storico tiene il prezzo più basso del giorno e la lista degli orari di partenza, senza sapere a quale volo appartiene il prezzo. Per non mostrare il prezzo di un volo del mattino come se fosse serale, un venerdì Wizz vale per il Weekend solo se **tutte** le partenze del giorno sono ≥ 18:00. La regola sta nel modulo condiviso, quindi vale anche per «Quando partire», che diventa un po' più severa. **Scelta del costruttore.**
- **Prezzi non aggiornati stanotte:** se una tratta non è stata riletta (raccolta fermata per tempo, errori), lo storico tiene l'ultimo prezzo noto. Ogni gamba porta la data in cui il prezzo è stato visto. La webapp scrive «prezzo di stanotte» solo se è dell'ultima raccolta, altrimenti «prezzo del GG/MM». Le gambe viste più di 7 giorni prima non si usano. **Scelta del costruttore.**
- Una voce per **aeroporto di partenza × destinazione × weekend × tipo** (Weekend / Weekend lungo), solo se andata e ritorno hanno un prezzo, e solo se il totale ≤ 400 €.
- Weekend: dal primo sabato che cade dopo la fine dei 3 mesi gratis (cioè dopo i 13 weekend della ricerca) fino a 12 mesi. Weekend lunghi: dal weekend in corso fino a 12 mesi. «12 mesi» = 53 sabati, come `weekendSaturdays`. La data di confine si calcola con la stessa funzione dei weekend della ricerca, così non ci sono buchi né doppioni.
- Nome dei file: `premium.json` per la Puglia, `premium-<gruppo>.json` per gli altri (come `direct.json` / `direct-milano.json`), sul branch `data`.
- Contenuto: data di calcolo, ultimo giorno dello storico usato, e un elenco di voci con origine, destinazione (codice, città, paese), tipo, sabato del weekend, andata (data, compagnia, orario, prezzo), ritorno (idem), totale e link di prenotazione per compagnia. La forma esatta è lasciata al piano; deve bastare alla webapp per mostrare la carta del volo senza altri file.
- Nel workflow `history.yml`, per ogni gruppo: un passo dopo la raccolta che scrive il file e lo pubblica con `scripts/publish-data.sh`. Se fallisce, lo storico del giorno si pubblica lo stesso (`continue-on-error`, come il riepilogo).
- `health.yml`: il check-up segnala un file Premium più vecchio di 30 ore.

### Webapp di Bruno (`web/`)
- Cursore del prezzo fino a 400 €, valore iniziale 100 € (`web/config.js` `MAX_PRICE`, `index.html`).
- Legge anche `premium.json`. I voli dello storico entrano nell'elenco accanto a quelli della ricerca, con la scritta «prezzo di stanotte».
- Interruttore **Weekend / Weekend lungo**: con «Weekend» si vedono i mesi 1–3 dalla ricerca e i mesi 4–12 dallo storico; con «Weekend lungo» si vedono solo i weekend lunghi dallo storico.
- L'elenco dei weekend arriva a 12 mesi.
- I filtri che i voli dello storico non possono rispettare (es. «Quanto resti», scali) vanno trattati in modo chiaro: il piano decide se escluderli o mostrarli con l'orario stimato.

## Limiti noti

- Lo storico conserva **un solo prezzo per compagnia al giorno** (il più basso): le combinazioni Premium sono indicative e aggiornate una volta per notte.
- Per Wizz lo storico ha solo gli orari di partenza: l'arrivo non si conosce.
- Milano, Bergamo e Roma hanno storico da pochi giorni: i loro file Premium si riempiono man mano.

## Lasciato al costruttore

- Forma esatta del file Premium e dei link di prenotazione (si possono riusare i formati di Ryanair e Wizz già usati nelle fonti).
- Dove vive il modulo condiviso delle regole Weekend / Weekend lungo.
- Come la webapp unisce i due elenchi e cosa fa con i filtri che non si applicano.

## Fatto quando

- `direct*.json` contiene voli fino a 400 € e 13 weekend, e nessun weekend lungo.
- Nessun pezzo di Google o Telegram resta nel codice e nei workflow; le notifiche nell'app funzionano ancora (avvisi, tratte seguite, check-up).
- `premium*.json` esiste per ogni gruppo con i Weekend dei mesi 4–12 e i Weekend lunghi dei mesi 1–12.
- La ricerca diretta resta sotto il suo tempo per tutti i gruppi (misurata su un giro vero).
- La webapp di Bruno mostra cursore fino a 400 €, 12 mesi e l'interruttore Weekend / Weekend lungo.
- Tutti i test passano.
