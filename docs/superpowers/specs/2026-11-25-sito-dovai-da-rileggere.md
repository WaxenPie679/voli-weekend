# Sito DoVai · cosa deve rileggere Bruno prima di aprire il sito

> 25/11/2026 · ramo `feat/sito-dovai`. Il sito non si pubblica finché `sito/titolare.js` è vuoto: questa è la lista da guardare prima di compilarlo.

## Testi scritti da Claude (non presi da `testi/`)

- **Note legali** (`/note-legali/`): tutto il testo, 6 sezioni.
- **Privacy** (`/privacy/`): la riga «In breve» sulla posta a info@; la riga «Ci scrivi» (basi legali e conservazione «al massimo 12 mesi»); la sezione «Modifiche» con la data fissa «25 novembre 2026».
- **Domande**: «Come funzionerà il canale WhatsApp?» → «Il canale sta per aprire.»; «Quando arriva il riassunto email?» → «Non c'è ancora: arriverà presto.»
- **Pagine dei bacini**: la frase per quando non ci sono voli fino a 100 € («…non ci sono voli del weekend fino a 100 € a/r. Il più basso è…»); la descrizione di un bacino senza dati.
- **Premium**: «Ti scriviamo una volta sola, quando parte.» con il link alla privacy.
- **404**: «Guarda i voli di oggi» e i tre bottoni dei bacini.
- **Filtri e biglietto**: «Tipo di weekend», «Mostra i voli», «Dettagli», «Altri filtri», la spiegazione sotto «Quanto resti» («Dall'atterraggio al decollo del ritorno.»).

## Testi approvati cambiati per non promettere cose che non ci sono

- **Commissione Kiwi**: finché in `sito/config.js` `KIWI_AFFILIATO` è vuoto, spariscono «Con Kiwi sostieni DoVai», «link affiliato» e ogni frase sulla commissione (piede, «Perché due bottoni?», Come funziona, Domande, Privacy, Note legali). Tornano da sole quando metti il codice affiliato.
- **«Questo mese»** → **«Nei prossimi tre mesi»** nelle introduzioni dei bacini, nell'anteprima Puglia e sotto «Dove si va» («Le mete più economiche dei prossimi tre mesi dai nostri aeroporti.»): il numero conta tutti i weekend gratis, non solo il mese.
- **Linate** tolto ovunque: «Malpensa e Orio al Serio».
- **ciao@** → **info@dovaivoli.it** ovunque.
- **«siti delle compagnie aeree e dei motori di ricerca»** → «siti delle compagnie aeree» (i prezzi vengono solo da Ryanair e Wizz).
- **«più volte al giorno»** → «ogni giorno» in Come funziona (la raccolta è ogni 15 minuti e il sito si aggiorna ogni ora: si può rimettere «più volte al giorno»).
- **Weekend lungo, storico, canale, email del martedì**: scritti come «in arrivo».
- **Home**: tolta la sezione «Come cambiano i prezzi» (manca la pagina dello storico) e i ponti 2027 (manca la pagina).
- **Riquadro del canale nei bacini**: per ora è quello generico «sta per aprire», non il testo «Parti dalla Puglia?…» di BACINI.md.

## Nomi delle città ripuliti

I dati di Wizz hanno nomi come «Warsaw Any», «Londra (tutti gli aeroporti)», «Tenerife (Isole Canerie)». Il sito li mostra come Varsavia, Londra, Parigi, Tenerife, Palermo, Bucarest, Barcellona, Berlino, Copenaghen, Lussemburgo, Lamezia Terme, Varna, Zagabria (mappa in `sito/dati.js`). Lo stesso volo che Wizz elenca due volte (codice città e codice aeroporto) compare una volta sola. Da controllare nel raccoglitore: Wizz elenca gli stessi voli per Varsavia sotto WAW, WMI e WSW.

## Da verificare prima di aprire

- Che la casella **info@dovaivoli.it** su iCloud+ riceva davvero (la privacy lo dice).
- Che **Cloudflare Web Analytics** sia attivo (variabile `CF_BEACON`): la privacy parla dei conteggi delle visite.
- Il **parere dell'avvocato** sui prezzi raccolti da Ryanair e Wizz (deciso: si chiede in parallelo).
