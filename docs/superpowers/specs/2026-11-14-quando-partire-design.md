# Quando partire (andata e ritorno per weekend) — Design (piccola modifica)

Data: 2026-11-14
Stato: bozza da approvare
Si appoggia a: `2026-11-13-grafici-storico-design.md` e `2026-11-13-voli-della-settimana-design.md`

## Intento

Bruno vuole sapere, per una tratta (es. Brindisi–Torino), **in quale weekend del calendario conviene partire**, guardando il prezzo di andata **e** ritorno insieme. I grafici attuali rispondono a «quanto prima comprare», per una sola direzione; questo risponde a «quando andare».

## Decisioni di Bruno

| Tema | Decisione |
|---|---|
| «Settimana» | il weekend in cui viaggiare, lungo il calendario |
| Abbinamento | due viste: **Weekend** e **Weekend lungo** |
| Calcolo | **approccio A**: nella pagina, dai file delle due direzioni già pubblicati |

## Approcci

| Approccio | Esito |
|---|---|
| A. La pagina scarica i file di andata e di ritorno e combina i prezzi | **scelto**: subito disponibile, nessuna modifica alla raccolta notturna, regole cambiabili senza aspettare la notte |
| B. Il riepilogo notturno scrive un file andata e ritorno per tratta | scartato: i dati ci sono già nei file per direzione; ogni modifica si vedrebbe dalla notte dopo |

## Obiettivi, non-obiettivi

- **Obiettivo:** grafico «Quando partire» con il prezzo andata+ritorno più basso per ogni weekend dei prossimi 12 mesi, nelle due viste, e i due voli scelti al tocco.
- **Non-obiettivi:** media degli ultimi giorni di raccolta (si aggiunge quando ci saranno abbastanza dati); scali; soggiorni più lunghi del weekend lungo; avvisi o consigli su Telegram.
- **Anti-obiettivi:** rallentare la pagina; toccare la raccolta notturna o la pagina delle offerte; mostrare come prezzo valido un volo esaurito.

## Design

**Dati.** Per la tratta scelta servono i file delle due direzioni, ad esempio `BDS-TRN.json` per l'andata e `TRN-BDS.json` per il ritorno. Per ogni data di partenza e compagnia il **prezzo di oggi** è l'ultimo cambio in `flights`, solo se lo stato è `prezzo`. *Scelta di Claude:* l'andata parte sempre da Bari/Brindisi, qualunque direzione sia selezionata in alto, perché il viaggio di Bruno parte dalla Puglia.

**Weekend.** Un weekend si identifica con il suo **sabato**. Si considerano i weekend da quello in corso (rispetto all'ultimo giorno raccolto) fino a 52 settimane dopo.
- **Weekend:** andata venerdì con partenza dalle 18:00 in poi, oppure sabato; ritorno domenica. Il limite delle 18:00 è lo stesso della pagina delle offerte. *Scelta di Claude:* il venerdì vale solo se l'orario salvato lo conferma: per Ryanair la partenza del volo più economico, per Wizz almeno una partenza dalle 18:00. Se l'orario è sconosciuto, il venerdì è escluso.
- **Weekend lungo:** andata giovedì, venerdì (a qualsiasi ora) o sabato; ritorno domenica o lunedì.
- Il prezzo del weekend è la somma minima di un'andata valida e di un ritorno valido. Le compagnie si possono mescolare (andata Ryanair e ritorno Wizz). Un weekend senza andata o senza ritorno con prezzo resta vuoto.

**Pagina.**
- Nuova carta **«Quando partire»** sotto i grafici esistenti, con il sottotitolo «Andata e ritorno · prezzi di oggi».
- Due pulsanti **Weekend** / **Weekend lungo**. *Scelta di Claude:* si parte da Weekend e l'ultima scelta si ricorda nel browser.
- Il grafico ha i weekend lungo il calendario sull'asse orizzontale (etichette del mese, per esempio «dic», «gen») e il prezzo A/R in € sull'asse verticale. Ogni weekend è una barra o un punto; il più economico è evidenziato e indicato sopra il grafico: «Il più economico: 13–14 dic · 58,40 €».
- **Tocco (o Invio da tastiera) su un weekend:** si apre un riquadro con le date del weekend, la riga dell'andata e la riga del ritorno (giorno, orario, compagnia, prezzo, pulsante «Cerca», come nel riquadro dei voli della settimana) e il totale. Se il weekend è vuoto: «Nessuna combinazione con prezzo per questo weekend.»
- La nota «Prezzi della raccolta di stanotte: sul sito della compagnia vedi quello di adesso.» resta. Il cambio di tratta azzera la selezione.
- Se il file del ritorno manca o non si scarica, la carta mostra «Ritorno non disponibile per questa tratta.» e il resto della pagina funziona.
- Il service worker non cambia elenco file, perché la logica sta nei file già in cache; la versione della cache sale di uno.

## Cosa resta al costruttore

Nomi delle funzioni (pure in `web/storico-view.js`, DOM in `web/storico.js`), barre o punti, aspetto secondo `DESIGN.md`, dati di esempio per `?sample=1` (le coppie BRI-BUD/BUD-BRI e BDS-TRN/TRN-BDS esistono già).
