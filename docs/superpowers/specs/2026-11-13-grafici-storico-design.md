# Grafici dello storico prezzi — Design (tappa 2: dashboard)

Data: 2026-11-13
Stato: bozza da approvare
Precedente: `docs/superpowers/specs/2026-11-12-storico-prezzi-design.md` (tappa 1, raccolta — in produzione dal 2026-11-12)

## 1. Intento e perché

Bruno vuole sapere, per ogni tratta, **quanto tempo prima della partenza conviene di solito comprare**. La tappa 1 raccoglie ogni notte i prezzi di Ryanair e Wizz sul branch `history`. Bruno non vuole aspettare settimane per costruire i grafici: li vuole **subito**, per vederli riempirsi giorno dopo giorno e trovarli pronti quando i dati saranno abbastanza.

Successo: Bruno apre la pagina dall'iPhone o dal PC, sceglie una tratta (es. Brindisi → Torino) e in pochi secondi vede (a) la curva del prezzo rispetto ai giorni mancanti alla partenza, (b) l'andamento dei singoli voli, (c) quanto è affidabile ciò che vede oggi. Ogni mattina c'è un giorno di dati in più.

## 2. Decisioni di Bruno

| Tema | Decisione |
|---|---|
| Quando | costruire ora, con pochi dati, e lasciarla crescere |
| Vista principale | **una tratta alla volta** (non il quadro di tutte le tratte) |
| Calcolo | **approccio A**: riepilogo calcolato ogni notte, la pagina legge solo quello |

## 3. Obiettivi, non-obiettivi, anti-obiettivi

**Obiettivi**
- Nuova pagina della webapp, raggiungibile dalla pagina principale.
- Per la tratta scelta: curva «prezzo ↔ giorni prima della partenza», andamento dei singoli voli, indicazione «di solito inizia a salire circa N giorni prima» solo quando i dati lo permettono.
- Onestà sui dati: la pagina dice sempre quanti giorni di storico ci sono e quanto è affidabile la stima.

**Non-obiettivi**
- Quadro di tutte le tratte, classifiche, consigli nelle schede voli o su Telegram (tappa 3).
- Andata e ritorno combinati, scali, Google Voli.
- Modelli statistici di previsione: solo mediane e una regola semplice per il punto di salita.

**Anti-obiettivi**
- Pagina lenta sull'iPhone o che diventa più lenta con il passare dei mesi.
- Far fallire o ritardare la raccolta notturna: se il riepilogo non si calcola, i dati del giorno vanno pubblicati lo stesso.
- Presentare una stima ballerina come certezza.
- Toccare il funzionamento della pagina principale (offerte del weekend) oltre al link.

## 4. Vincoli

- Webapp statica senza build (HTML/CSS/JS), GitHub Pages, PWA; stile da `DESIGN.md` (Geist, `price-blue`, carte bianche su grigio).
- Node 24, moduli ES, `node --test`, testi in italiano, come il resto del progetto.
- Grafici disegnati in SVG nel codice, **senza librerie esterne** (scelta di Claude: leggerezza e stile coerente).
- Nessun costo; i file del riepilogo restano piccoli (obiettivo: sotto 300 KB non compressi per la tratta più trafficata dopo un anno; se in conflitto, vince la completezza dei dati e si compatta il formato).

## 5. Approcci considerati

| | Approccio | Pro | Contro | Esito |
|---|---|---|---|---|
| A | Riepilogo per tratta calcolato ogni notte, nel giro dello storico | pagina veloce anche tra un anno; un file piccolo per tratta | il giro notturno si allunga di qualche secondo; una modifica al calcolo si vede dalla notte dopo (o con un giro manuale) | **scelto** |
| B | La pagina scarica tutti i file giornalieri e calcola nel browser | niente lavoro notturno, modifiche immediate | MB da scaricare a ogni apertura, sempre più lenta sull'iPhone | scartato |

## 6. Dati di partenza (dalla tappa 1)

Branch `history`: `YYYY/MM/YYYY-MM-DD.csv.gz` con solo i cambiamenti del giorno (`compagnia,origine,destinazione,data_partenza,stato,prezzo`, stati `prezzo|esaurito|da_verificare|nessun_volo`), `…meta.json` con la copertura, `routes.json` con le tratte note. Lo stato completo di un giorno si ottiene rigiocando tutti i file fino a quel giorno (`replayState` in `src/history/store.js`).

## 7. Design

### 7.1 Flusso

1. Il workflow `history.yml`, dopo la raccolta e prima della pubblicazione, esegue un nuovo passo «riepilogo» (`node src/history/summary.js --dir ./history`).
2. Il passo rigioca tutti i file giornalieri e scrive nella cartella `summary/` del branch `history`:
   - `summary/index.json`: elenco tratte con dati (origine, destinazione, città e paese presi da `routes.json`, compagnie), giorni raccolti, primo e ultimo giorno, ora di calcolo;
   - `summary/<ORIGINE>-<DESTINAZIONE>.json`: un file per coppia di aeroporti in quella direzione (es. andata `BDS-TRN.json`, ritorno `TRN-BDS.json`; Bari e Brindisi verso Torino sono file diversi), con entrambe le compagnie se volano entrambe.
3. Se il passo fallisce, la pubblicazione dei dati del giorno avviene comunque (il riepilogo resta quello del giorno prima) e il log lo dice. *Scelta di Claude:* il riepilogo si scrive in una cartella temporanea `summary.tmp/` e solo a calcolo finito sostituisce `summary/`; se qualcosa va storto la cartella temporanea si cancella, così non si pubblicano mai file a metà. La cartella di lavoro `./history` contiene già tutti i file giornalieri (l'ultimo commit di `history` ha l'albero completo), quindi non serve cambiare `prepare-history.sh`.
4. La pagina `web/storico.html` legge `index.json`, poi il file della tratta scelta, da `https://raw.githubusercontent.com/WaxenPie679/voli-weekend/history/summary/` (con `?sample=1` legge dati di esempio locali, come la pagina principale).

### 7.2 Cosa contiene il riepilogo di una tratta

Si considerano solo le osservazioni con stato `prezzo` (gli altri stati non hanno un prezzo da confrontare).

**Punti della curva.** Ogni giorno raccolto `g` (cioè ogni file giornaliero presente, rigiocando lo stato fino a quel giorno) e ogni data di partenza `p ≥ g` con un prezzo in quel giorno danno un punto: giorni mancanti `d = p − g` e prezzo. I punti si raggruppano per **settimana mancante** `floor(d / 7)` (0 = 0–6 giorni, 1 = 7–13, …; le settimane oltre la 52 confluiscono nella 52) e per compagnia. Per ogni gruppo: mediana, 25° e 75° percentile, numero di punti.

Così la curva esiste già dal primo giorno (confronta voli diversi visti lo stesso giorno, quindi mescola le stagioni) e con il tempo si arricchisce dello stesso volo seguito giorno dopo giorno. La pagina lo spiega in una riga.

**Voli singoli.** Per ogni data di partenza e compagnia: l'elenco dei cambi `[giorno, stato, prezzo]` nel tempo (solo i cambi, come nei file giornalieri). Si tengono le partenze future e quelle partite da non più di 30 giorni; le più vecchie restano nello storico grezzo ma escono dal riepilogo per tenerlo piccolo. Formato compatto (array, non oggetti con nomi lunghi). Stima per la tratta più trafficata (~680 date di partenza tra due compagnie): un centinaio di KB dopo un anno, che GitHub trasmette compresso.

**Affidabilità.** Calcolata sul numero di giorni effettivamente raccolti (file giornalieri presenti, non i giorni di calendario: un giorno saltato non conta):
- meno di 28 giorni → «prima stima»;
- da 28 a 89 giorni → «in crescita»;
- da 90 giorni → «affidabile».

**Punto di salita** (solo da «in crescita» in su). Si calcola **per ciascuna compagnia separatamente**, usando solo le settimane con almeno 5 punti, e solo se queste sono almeno 8. Sulla curva mediana della compagnia: si trova la settimana più economica `m` (mediana minima; a parità la più lontana dalla partenza). Il punto di salita è la settimana `s < m` più lontana dalla partenza tale che tutte le settimane da `s` fino a 0 (tra quelle usabili) abbiano mediana ≥ 1,10 × mediana di `m`. Se `m` è la settimana 0 o nessuna `s` soddisfa la regola, non c'è punto di salita. Si mostra come «di solito il prezzo inizia a salire circa N settimane prima della partenza». Se non esiste, si scrive «nessuna salita chiara finora».

### 7.3 La pagina

- **Link** «Storico prezzi» nella barra in alto della pagina principale; nella nuova pagina, link di ritorno «Offerte».
- **Scelta della tratta**: aeroporto di partenza (Bari / Brindisi), destinazione (elenco con città, dalle tratte in `index.json`), direzione (andata da BRI/BDS o ritorno verso BRI/BDS). L'ultima tratta scelta si ricorda nel browser.
- **Riga di stato**: «Storico dal 12 nov · 15 giorni · prima stima · aggiornato alle 05:05».
- **Grafico 1 — Quando comprare**: asse orizzontale settimane prima della partenza (da 52 a 0, la partenza a destra), asse verticale prezzo in €. Linea della mediana con fascia 25°–75° percentile, una per compagnia (colori distinti, legenda). Se c'è il punto di salita, linea verticale con etichetta.
- **Grafico 2 — I singoli voli**: scelta della data di partenza (prossime partenze con dati, le più vicine per prime); linea a gradini del prezzo giorno per giorno dal primo giorno di storico. Con un solo giorno di dati mostra un punto e la frase «la linea si allunga ogni giorno».
- **Tocco/passaggio sul grafico**: mostra valori esatti (settimana, mediana, numero di prezzi; oppure giorno e prezzo).
- **Stati vuoti**: tratta senza prezzi → messaggio chiaro; riepilogo non raggiungibile → messaggio e pulsante «Riprova».
- Pensata per iPhone prima (larghezza 375 px), poi PC; stessa grafica della pagina principale.
- Il service worker include i nuovi file per l'uso offline (nuova versione della cache).

### 7.4 Errori e salute

- Un file giornaliero illeggibile fa fallire il riepilogo (stesso comportamento della raccolta), non la pubblicazione.
- Il controllo giornaliero (`health.yml`) non cambia in questa tappa; scelta di Claude: un riepilogo vecchio di un giorno si vede già dalla riga di stato della pagina.

## 8. Cosa resta al costruttore

Struttura esatta dei JSON, nomi delle funzioni, disegno SVG (assi, tacche, colori presi da `DESIGN.md`), dati di esempio per `?sample=1`, testi minori dell'interfaccia, ordinamento delle destinazioni.
