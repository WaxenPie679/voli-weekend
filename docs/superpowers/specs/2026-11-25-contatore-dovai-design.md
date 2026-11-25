# Contatore senza cookie e scelta mensile/annuale · progetto

Data: 25/11/2026 · Attività DoVai #12 (contatore) e #13 (pulsante «abbonati» col prezzo fisso).
Approvato da Bruno a voce il 25/11/2026: strada B per mensile/annuale, contatore interno a Cloudflare, configurazione fatta da Claude nel browser.

## Perché

La fase 0 si decide su soglie misurate (PIANO.md): almeno il **3% di clic su «Passa a Premium»** sulle visite (valido da 800 visite), 600 iscritti, costo per iscritto. dovaivoli.it è online dal 25/11/2026 ma oggi non conta nessun clic: Cloudflare Web Analytics conta solo le visite. Ogni visita che arriva adesso è persa per la decisione di marzo.

Bruno vuole **limitare i servizi esterni**, perché ogni servizio esterno è tracciamento esterno. Quindi niente GoatCounter, Plausible o simili: il contatore vive nello stesso progetto Cloudflare Pages del sito (`dovai`).

## Obiettivi

- Contare, per giorno e per pagina: ingressi (visite), pagine viste, clic che portano a Premium (per tipo), scelta mensile/annuale, Avvisami, clic su Kiwi, clic sulla compagnia, clic su «Te lo scriviamo noi» (canale, email), uso dei filtri.
- Una **pagina privata** dove Bruno legge i numeri da telefono, con la percentuale della soglia Premium già calcolata.
- Un **accesso a macchina** agli stessi numeri (JSON) per il cruscotto e per il futuro resoconto del lunedì (#14).
- Sulla pagina `/premium/`, la **scelta tra mensile (3 €/mese) e annuale (30 €/anno)** prima del messaggio «Premium non c'è ancora» (strada B).

## Non obiettivi

- Sapere da dove arrivano le persone (Instagram, WhatsApp, Google): arriva con i canali (#16) e con la domanda «Come ci hai conosciuto?» del modulo (#9).
- Contare le iscrizioni vere: il modulo non c'è ancora (#9). Per ora contano i clic su «Te lo scriviamo noi»; quando arriva il modulo si aggiunge l'evento `iscrizione`.
- Riconoscere visitatori unici o ritorni.
- Proteggere i numeri da chi volesse gonfiarli apposta: in fase 0 basta un filtro di buon senso (sotto).

## Anti-obiettivi (sarebbe un fallimento anche se funzionasse)

- Salvare qualcosa che riconosca una persona: indirizzo IP, browser/user agent, identificativi, impronte.
- Scrivere qualcosa sul telefono di chi visita per contarlo (cookie, localStorage, sessionStorage): altrimenti servirebbe il banner, e la privacy promette «niente cookie, niente memoria per seguirti».
- Un nuovo fornitore esterno o uno script di terzi.
- Rallentare il sito o rompere un clic: il conteggio non deve mai bloccare né ritardare l'apertura di Kiwi, della compagnia o di una pagina.
- Cambiare i testi approvati del riquadro Premium (GUIDA): il bottone resta «Passa a Premium» con «3 € al mese o 30 € l'anno. Lo togli quando vuoi.».

## Vincoli

- Sito statico generato da `sito/build.js` e pubblicato con `wrangler@3.114.0 pages deploy sito/dist --project-name dovai` dal workflow `.github/workflows/sito.yml` (main → dovaivoli.it, altri rami → prova.dovai.pages.dev). Il deploy parte dalla radice del repository, quindi una cartella `functions/` nella radice viene compilata come Pages Functions.
- Il token GitHub `CLOUDFLARE_API_TOKEN` ha solo il permesso Pages Edit: non va allargato. Database e collegamento si creano dal pannello Cloudflare (Claude nel browser, con l'account di Bruno già aperto).
- Niente `wrangler.toml`: con il file, i collegamenti del pannello diventano di sola lettura. I collegamenti stanno nel pannello del progetto `dovai`.
- Tutti i bottoni hanno già `data-conta` (`kiwi`, `compagnia`, `premium-passa`, `premium-lucchetto`, `premium-avvisami`, `canale`, `email`, `filtro`). I biglietti sono disegnati da `esplora.js` dopo il caricamento: il conteggio deve ascoltare i clic sul documento intero (delega), non sui singoli bottoni.
- Gratis: D1 gratuito (5 GB, 100.000 scritture al giorno); i volumi della fase 0 sono molto più bassi.
- Test con `node --test` (`npm test`), già nel workflow prima del deploy: `npm test` legge solo `test/**/*.test.js`, quindi i test delle Functions stanno in `test/`.
- Il workflow si avvia al push solo per `sito/**` e il file del workflow: va aggiunto `functions/**` ai `paths`, altrimenti una modifica alle sole Functions va online solo al giro orario.
- Bruno vede ogni modifica sull'anteprima prova.dovai.pages.dev prima dell'unione in main.

## Strade considerate

1. **GoatCounter** (servizio esterno senza cookie, pannello già pronto, gratuito). Scartata da Bruno: è comunque un servizio esterno.
2. **Contatore nostro in Cloudflare (Pages Functions + D1)**: nessun nuovo fornitore, i dati restano dove c'è il sito. Va costruito il pannello. **Scelta da Bruno.**
3. **Plausible**: circa 9 €/mese, esterno. Scartata.
4. **Solo Cloudflare Web Analytics**: non conta i clic. Scartata.

Dentro la strada 2, per il deposito: **D1** e non Workers Analytics Engine (tiene i dati 3 mesi, la fase 0 dura fino a fine marzo, oltre 4 mesi) né KV (1.000 scritture al giorno nel piano gratuito, troppo poche).

## Come funziona

### Nel browser (`sito/statico/js/conta.js`, caricato da ogni pagina)

- Un solo script piccolo, `type="module"`, con `?v=<impronta>` come gli altri script.
- **Ingresso:** al caricamento, se `document.referrer` è vuoto o di un altro sito (non dovaivoli.it), manda l'evento `ingresso`. Sempre, manda `pagina`.
  - *Scelta di Claude:* un ricaricamento della stessa pagina ha di solito il referrer della pagina stessa o nessuno: un ricaricamento senza referrer conta come nuovo ingresso. È accettato come imprecisione della fase 0.
- **Clic:** un ascoltatore sul documento prende i clic sull'elemento più vicino con `data-conta` e manda l'evento con quel nome: `click` (anche Invio) e `auxclick` solo con il tasto centrale (`button === 1`; il tasto destro non conta).
  - Il filtro (`filtro`) sta su `<select>`, cursore e campo di ricerca: si conta con l'evento `change`, non col clic, al massimo un evento ogni 2 secondi per pagina. Il link «Togli i filtri» si conta col clic.
- **Invio:** `navigator.sendBeacon('/api/conta', corpo)`, che non blocca l'apertura del link e sopravvive al cambio di pagina. Se `sendBeacon` non c'è, `fetch` con `keepalive: true`. Nessun errore visibile se fallisce.
- **Corpo:** una stringa JSON (sendBeacon la manda come `text/plain;charset=UTF-8`) con soli due campi, `e` (evento) e `p` (percorso della pagina, senza query né `#`).
- **Testi nuovi** (titolo della scelta, «due mesi gratis», righe della privacy): scritti con `design:ux-copy` sulla voce della GUIDA e approvati da Bruno **sull'anteprima**, come per ogni modifica al sito. *Scelta di Claude.*
- Il menù «Premium» in testata e nel piede riceve `data-conta="premium-menu"`.
- Niente cookie, niente localStorage o sessionStorage.

### Nel server (`functions/api/conta.js` e `functions/api/numeri.js`, codice comune in `functions/_lib/`)

**`POST /api/conta`**
- Accetta `text/plain` (quello che manda sendBeacon) e `application/json`, legge il corpo come JSON; corpo sotto 200 byte, `e` da un elenco fisso e `p` da un elenco fisso di percorsi del sito (le pagine generate da `build.js`; un percorso sconosciuto diventa `altro`).
- Controlla che `Origin` (o, in mancanza, `Referer`) sia `https://dovaivoli.it`, `https://www.dovaivoli.it` o un'anteprima `*.dovai.pages.dev`; altrimenti ignora.
- **Ambiente:** `vero` se la richiesta arriva su dovaivoli.it o www, `prova` per tutto il resto. Le prove non si mescolano ai numeri veri.
- Scrive in D1 un contatore per riga, con somma: `INSERT … ON CONFLICT DO UPDATE SET n = n + 1`.
- Non legge e non salva IP, user agent, paese o intestazioni oltre `Origin`/`Referer`/host. Nessun log applicativo.
- Risponde sempre `204`, anche quando ignora: chi prova a gonfiare non impara le regole.
- Crea la tabella se manca (`CREATE TABLE IF NOT EXISTS`), così non serve un passaggio a mano nel pannello.

**Tabella `conteggi`**

| colonna | tipo | esempio |
|---|---|---|
| `giorno` | testo `AAAA-MM-GG`, ora di Roma | `2026-11-26` |
| `ambiente` | `vero` / `prova` | `vero` |
| `evento` | testo dall'elenco | `kiwi` |
| `pagina` | testo dall'elenco | `/roma/` |
| `n` | intero | `14` |

Chiave primaria: (`giorno`, `ambiente`, `evento`, `pagina`).

**Eventi**

| evento | quando |
|---|---|
| `ingresso` | arrivo da fuori (visita) |
| `pagina` | ogni pagina vista |
| `premium-passa` | bottone «Passa a Premium» nel riquadro |
| `premium-lucchetto` | un lucchetto (filtri, biglietto) |
| `premium-menu` | voce «Premium» del menù o del piede |
| `premium-mensile` | scelta mensile sulla pagina Premium |
| `premium-annuale` | scelta annuale sulla pagina Premium |
| `premium-avvisami` | bottone Avvisami |
| `kiwi` | «Vedi su Kiwi» |
| `compagnia` | link alla compagnia aerea |
| `canale` | «Te lo scriviamo noi» · canale |
| `email` | «Te lo scriviamo noi» · email |
| `filtro` | uso dei filtri (al massimo uno ogni 2 s) |

**`GET /api/numeri`** (per macchine: cruscotto, resoconto del lunedì)
- Richiede l'intestazione `Authorization: Bearer <chiave>` (verificata con l'impronta); senza chiave giusta risponde `404`.
- Parametri facoltativi `dal`, `al` (giorni), `ambiente` (predefinito `vero`).
- Risponde JSON: totali per evento, totali per giorno, totali per pagina, e il calcolo della soglia Premium (sotto).

### La pagina privata `/numeri/`

- Servita dalla stessa Function (non è un file in `dist/`, non va in `sitemap.xml`, `noindex`, `Cache-Control: no-store`).
- Si apre con `https://dovaivoli.it/numeri/?k=<chiave>`: Bruno la salva come segnalibro sul telefono. Senza chiave giusta: `404`.
  - *Scelta di Claude:* la chiave nell'indirizzo è comoda da telefono. Il rischio, cioè che qualcuno veda dei totali anonimi, è basso. `Referrer-Policy: no-referrer` sulla pagina, e nessun link esterno sulla pagina, così la chiave non esce.
- Mostra, nei colori del sito (testa di moro su carta, numeri in JetBrains Mono):
  1. **Le quattro soglie della fase 0**: ingressi totali; **clic Premium ÷ ingressi** con il 3% come riferimento e la nota «vale da 800 visite»; clic «Te lo scriviamo noi» (in attesa del modulo); clic Kiwi e compagnia.
  2. Ultimi 7 giorni e dall'inizio, per evento.
  3. Mensile contro annuale (numeri e percentuale).
  4. Pagine più viste.
- Un interruttore «vero / prova» per vedere i conteggi dell'anteprima. Nota: anche dovai.pages.dev e gli indirizzi dei singoli deploy (`<hash>.dovai.pages.dev`) contano come «prova»: va bene, non sono il sito pubblico.
- Funziona senza JavaScript (HTML preparato dal server).

**Calcolo della soglia Premium:** numeratore = `premium-passa` + `premium-lucchetto` + `premium-menu` (con il dettaglio di ciascuno); denominatore = `ingresso`. *Scelta di Claude:* il PIANO parla di «clic su Passa a Premium»; tutti e tre portano alla stessa pagina e mostrano interesse, quindi entrano nel numeratore, ma il dettaglio resta visibile. Se Bruno preferisce solo `premium-passa`, si cambia una riga.

### La pagina `/premium/` (strada B)

- Prima la scelta: titolo «Quale ti interessa?» (testo definitivo dalla fase di scrittura con `design:ux-copy` e la GUIDA) e due bottoni:
  - **Mensile · 3 € al mese** (`data-conta="premium-mensile"`)
  - **Annuale · 30 € l'anno** con «due mesi gratis» (`data-conta="premium-annuale"`)
- Dopo il clic su uno dei due: il messaggio della GUIDA §4, «**Premium non c'è ancora.** Lo stiamo preparando: ti dirà quando comprare. Vuoi che ti avvisiamo quando parte?», con il bottone **Avvisami** (mailto come oggi, con l'oggetto che riporta la scelta: «Avvisami quando parte Premium (mensile)» o «(annuale)»).
- Senza JavaScript: i due bottoni sono link a `#mensile` e `#annuale`; il CSS (`:target`) mostra il messaggio. Con JavaScript lo stesso, più il conteggio.
- Il riquadro Premium nelle altre pagine **non cambia**.

### Privacy

- In `sito/pagine/servizio.js`, nella tabella dei dati: la riga «Conteggi anonimi» dice che contiamo anche **i bottoni toccati**, salvati come totali per giorno e pagina, senza IP né dati del browser, sui server Cloudflare.
- La riga del fornitore Cloudflare: «Ospita il sito e tiene i conteggi anonimi, senza cookie».
- Il paragrafo sui cookie resta vero: nessun cookie, nessuna memoria sul telefono.

## Configurazione in Cloudflare (Claude nel browser, account di Bruno)

1. Workers & Pages → D1 → crea database `dovai-numeri` (zona Europa occidentale, se il pannello lo chiede).
2. Pages → progetto `dovai` → Impostazioni → Collegamenti: collegamento D1 con nome **`DB`** → `dovai-numeri`, sia per Produzione sia per Anteprima. È l'unica configurazione nel pannello.
3. **La chiave non va in Cloudflare né in GitHub** (Claude non digita chiavi nei campi delle pagine, e così non serve nessun segreto). *Scelta di Claude, 25/11/2026 dopo la revisione:*
   - Claude genera la chiave sul Mac (`openssl rand -hex 24`) nel file `~/Documents/DoVai/numeri-chiave.txt`, leggibile solo da Bruno (`chmod 600`), senza mai stamparla.
   - Nel codice (`functions/_lib/chiave.js`) c'è solo l'**impronta sha256** della chiave: dall'impronta non si risale alla chiave (48 cifre esadecimali casuali). Le Functions confrontano l'impronta di quello che arriva con quella salvata, a tempo costante.
   - Per il segnalibro: Claude apre sul Mac l'indirizzo della pagina privata con `open`, senza mostrarlo in chat; Bruno lo salva come segnalibro (su iPhone arriva con iCloud).
   - Il cruscotto (che gira sul Mac) leggerà la chiave dal file; il resoconto del lunedì (#14, su GitHub) la riceverà come segreto quando verrà costruito. Cambiare chiave = nuova chiave nel file + nuova impronta nel codice.

## Cosa resta a chi costruisce

- Struttura interna delle Functions e dei test, nomi dei file oltre a quelli indicati.
- Aspetto preciso della pagina privata, purché leggibile da telefono e nei colori del sito.
- Come `build.js` passa l'elenco dei percorsi validi alle Functions (file generato o elenco scritto a mano e verificato da un test).
- Collegare il cruscotto (`scripts/cruscotto.mjs` nel repository del servizio: valore della soglia «abbonati») e la #14: **fuori da questo lavoro**, salvo il punto d'accesso `/api/numeri` pronto per loro.

## Come si verifica

- Test unitari: validazione di eventi, percorsi e origine; calcolo della soglia; giorno nell'ora di Roma.
- Anteprima su prova.dovai.pages.dev: un clic su Kiwi, uno su «Passa a Premium», la scelta mensile e Avvisami compaiono nella pagina privata, sotto «prova» e non sotto «vero».
- Il link Kiwi si apre subito, anche con rete lenta (il conteggio non lo ritarda).
- Nessun cookie e niente localStorage/sessionStorage scritti da `conta.js` (controllo nel browser).
- Dopo l'unione in main: un ingresso reale da dovaivoli.it compare sotto «vero».
