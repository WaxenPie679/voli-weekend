# Sito DoVai · primo pezzo dell'esploratore (dovaivoli.it)

> 25/11/2026 · attività DoVai [#8](https://github.com/WaxenPie679/voli-weekend-servizio/issues/8) · BOZZA da approvare.
> Testi: `~/Progetti/Voli Weekend Servizio/testi/` (approvati, PR 39). Brand: `~/Progetti/Voli Weekend Servizio/brand/` (GUIDA v1.4, token in `brand/token/`).

## Perché

DoVai è in fase 0: deve capire se la gente usa un sito di voli del weekend e se cliccherebbe su Premium (soglie: 800 visitatori, ≥ 3 % di clic su «Passa a Premium» sulle visite). Serve un sito **vero, aperto a tutti e su Google**, che mostri subito i biglietti dai nostri aeroporti e porti a Kiwi (commissione) o alla compagnia. #8 è «fatto» quando il sito è online su dovaivoli.it e funziona da iPhone e da computer.

## Obiettivi

- Home esploratore: i biglietti del weekend da tutti gli aeroporti, dal più economico, filtrabili.
- Tre pagine bacino (`/puglia`, `/milano-bergamo`, `/roma`) con introduzione e numeri veri dentro l'HTML.
- Biglietto che si apre sul posto, con «Vedi su Kiwi» in risalto e «Vedi su {compagnia}».
- Le porte Premium (lucchetti, «Passa a Premium») portano a «Premium non c'è ancora».
- Pagine di fiducia: come funziona, domande, privacy, note legali, 404.
- Veloce e leggibile da telefono; pagine che si aggiornano da sole ogni ora.

## Non obiettivi (vanno nelle loro attività)

- Storico prezzi `/storico` (pagina a sé, dopo).
- Pagine SEO tratta / destinazione / ponti / aeroporto (#44): qui solo la struttura che le renderà «altri modelli».
- Modulo email con doppia conferma (#9) e riassunto del martedì (#43).
- Contatore nostro dei clic (#12): qui solo gli attributi `data-conta` sui punti da contare e Cloudflare Web Analytics.
- Link affiliato Kiwi vero (#6, #18) e spazi affiliati hotel/transfer/parcheggio (#42): qui link Kiwi provvisorio e spazi assenti.
- Voli con scalo (`connections-*.json`): fuori dal primo pezzo, solo voli diretti.

## Anti-obiettivi (sarebbe un fallimento anche se funziona)

- Promettere ciò che non c'è: WhatsApp, email e Premium non esistono ancora → mai finti moduli che sembrano funzionare.
- Mostrare il Weekend lungo o i mesi 4–12 gratis (sono Premium, decisione 24/11/2026).
- Dire che su Kiwi costa uguale.
- Cookie di tracciamento, banner cookie, popup, conti alla rovescia.
- Pagine pesanti: niente framework, niente caricare i 9 MB di dati grezzi nel telefono.

## Vincoli

- Dati: ramo `data` del repo pubblico `WaxenPie679/voli-weekend`, file `direct.json` (Puglia), `direct-milano.json`, `direct-bergamo.json`, `direct-roma.json`, `airports.json`. Aggiornati ogni 15 minuti; 13 weekend; prezzi fino a ~400 € a/r; ~9 MB in tutto.
- Hosting: Cloudflare Pages, gratis; dominio dovaivoli.it già su Cloudflare (account di Bruno).
- Node ≥ 24, moduli ES, `luxon` già nel progetto. Niente nuove dipendenze se non servono davvero.
- Testi presi dai file `testi/` così come sono (voce GUIDA §3); dove il testo è una bozza segnata «l'idea», il costruttore scrive in quella voce e lo segnala.
- Rischio legale noto (prezzi raccolti da noi da Ryanair/Wizz): **Bruno ha scelto di aprire a tutti**; il parere dell'avvocato si chiede in parallelo (25/11/2026).

## Strade considerate

| Strada | Come | Pro | Contro |
|---|---|---|---|
| **A · pagine preparate ogni ora (scelta)** | Uno script Node legge i dati e scrive HTML completo + un JSON leggero per i filtri; Cloudflare pubblica | Google legge numeri veri; velocissimo; gratis; #44 = altri modelli dello stesso script | Un passaggio di preparazione da tenere acceso |
| B · pagina vuota riempita dal browser | Come la webapp di oggi | Semplicissima | Google vede pagine vuote; #44 da rifare |
| C · pagine costruite a ogni visita (Workers) | Rendering sul server Cloudflare | Sempre fresche e indicizzabili | Più pezzi, più guasti, inutile in fase 0 |

Scelta A, in JavaScript semplice senza framework (scelta mia, Bruno ha detto «procedi»).

## Come è fatto

### Dove sta il codice

Cartella `sito/` nel repo `voli-weekend` (scelta mia: lì ci sono già dati, aeroporti, regole dei weekend e gruppi; il codice del sito non contiene strategia).

```
sito/
  build.js            legge i dati, scrive dist/
  dati.js             scarica e riduce i dati (puro, testato)
  pagine/             modelli: home, bacino, premium, come-funziona, domande, privacy, note-legali, 404
  parti/              testa, piede, biglietto, filtri, riquadro-canale, lucchetto
  statico/            css (token Limonaia + caratteri), js del browser, logo, favicon, icone
  dist/               uscita (ignorata da git)
test/sito/            test node:test di dati.js e dei modelli
```

### Preparazione (build)

1. Scarica dal ramo `data` i 4 `direct*.json` e `airports.json` (da `raw.githubusercontent.com`; in locale anche da cartella con `--data`).
2. Riduce: tiene solo i campi che servono al biglietto (origine, destinazione con città e paese, partenza/arrivo andata e ritorno, compagnia, prezzo, link compagnia, weekend, seenAt). Per ogni origine + destinazione + weekend tiene **al più il più economico per ciascuna fascia di «Quanto resti»** (qualsiasi, ≥ 1, ≥ 2, ≥ 3 giorni), così il JSON per il telefono resta piccolo (obiettivo: ≤ 300 KB compresso per tutta la home).
3. Solo **Weekend** e solo i **prossimi 3 mesi** (i dati liberi sono già così: 13 weekend). Il Weekend lungo non c'è nei dati liberi e non si mostra.
4. Calcola per ogni bacino: numero di voli ≤ 100 € a/r, il più economico (tratta e prezzo), le mete più economiche. Li scrive nell'HTML.
5. Scrive `dist/`: `index.html`, `puglia/index.html`, `milano-bergamo/index.html`, `roma/index.html`, `premium/index.html`, `come-funziona/`, `domande/`, `privacy/`, `note-legali/`, `404.html`, `voli.json` (ridotto), `sitemap.xml`, `robots.txt`, `_headers` (cache).
6. Se un bacino non ha dati o i dati sono più vecchi di 24 h: frase «Stiamo iniziando a seguire i voli da qui…» (BACINI, Regole) e `noindex` su quella pagina. Se manca tutto, la preparazione fallisce e Cloudflare tiene online la versione precedente.

### Nel browser

- Le pagine arrivano già piene dei primi biglietti (i più economici, filtro iniziale: tutti gli aeroporti nella home / il bacino nella sua pagina, Weekend, prossimi 3 mesi, fino a 100 € a/r). Senza JavaScript si vedono comunque.
- Un piccolo script (JS semplice) carica `voli.json` e fa funzionare: **Da dove parti** (bacino → singolo aeroporto), **Weekend / Weekend lungo** (Weekend lungo col lucchetto → «Premium non c'è ancora»), **Quando** (prossimi 3 mesi, mesi singoli; dopo, lucchetto «Fino a 12 mesi con Premium»), **prezzo** (cursore 30–400 € a/r, parte da 100), **Quanto resti**, **Dove vuoi andare** (campo con suggerimenti dalle città presenti), riepilogo «42 voli da …», **Togli i filtri**, **Mostra altri voli** (a blocchi di 12).
- I filtri finiscono nell'indirizzo (`?da=puglia&max=150…`) così si possono condividere; il biglietto aperto ha `?volo=…` (fuori da Google).
- Ordine: dal più economico.

### Il biglietto (testi HOME §3 e SCHEDA-VOLO)

- Chiuso: `Bari → Parigi` · date e orari in mono · «2 giorni e 1 ora a Parigi» · `69 € a/r` · solo zaino · compagnia · «visto alle 9:30» / «visto ieri alle 22:10» · **Vedi su Kiwi** + «o su Ryanair» · «Compra o aspetta?» col lucchetto disegnato → Premium.
- «sotto la media»: **non nel primo pezzo** (serve lo storico; scelta mia, da aggiungere con /storico).
- Aperto sul posto: andata e ritorno separati, «Da sapere» solo dove vero (oggi: aeroporti lontani dal centro da una piccola tabella scritta a mano, es. Beauvais, Charleroi), i due bottoni in nuova scheda, «Perché due bottoni?», «Altre date per {città}» (3 weekend più economici), «Ricevilo prima la prossima volta». «Completa il weekend» e «Hai trovato il volo?» **assenti** finché non ci sono i partner (#42).
- Link Kiwi provvisorio: ricerca kiwi.com già compilata con aeroporti e date, senza codice affiliato; la nota «link affiliato» compare solo quando il link lo sarà davvero. Un solo punto nel codice da cambiare (#18).

### Le cose che non esistono ancora

- Riquadro «Te lo scriviamo noi»: c'è, con i testi; i bottoni WhatsApp ed email portano a una riga onesta «Il canale apre a gennaio» / «Il riassunto del martedì arriva presto» finché #16 e #9 non sono pronti (scelta mia, da confermare).
- «Premium non c'è ancora» (`/premium`): testo della GUIDA; «Avvisami» apre una mail precompilata a info@dovaivoli.it finché non c'è la lista (#9) (scelta mia).
- Ogni punto da contare ha `data-conta="kiwi|compagnia|premium-passa|premium-lucchetto|canale|email|filtro-…"`; #12 li userà. Intanto **Cloudflare Web Analytics** (senza cookie) su tutte le pagine.

### Aspetto

- Palette Limonaia e caratteri ufficiali dai token (`brand/token/colori.css`, `caratteri.css`); limone solo come fondo, logo in testa di moro, frecce solo in mono, favicon «D a 30°» (`brand/logo/ufficiale`).
- I caratteri si servono dal nostro sito (copie locali dei Google Fonts, licenza OFL) invece che da Google: niente richieste a terzi, coerente con «niente tracciamento». Scelta mia.
- Progetto dell'interfaccia con la skill impeccable; controllo contrasti WCAG AA (attenzione a testo su limone e ruggine).
- Telefono prima: un biglietto per riga sul telefono, griglia sul computer.

### Pubblicazione

1. Bruno crea su Cloudflare il progetto Pages `dovai` (caricamento diretto) e collega il dominio dovaivoli.it (passi guidati, li fa lui: sono impostazioni del suo account).
2. **La preparazione gira su GitHub Actions, non su Cloudflare** (scelta mia dopo la revisione: il piano gratis di Pages permette 500 preparazioni al mese, una all'ora ne fa ~744; i caricamenti diretti non contano). La Action `sito.yml` gira ogni ora e a ogni push su `main` che tocca `sito/`, prepara `dist/` e lo carica con `wrangler pages deploy`. Bruno crea un token Cloudflare limitato a «Pages: modifica» e lo salva con l'ID account come secret `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`. Il progetto Pages è «caricamento diretto», senza collegamento Git.
3. Bruno attiva Cloudflare Web Analytics per il dominio e verifica il sito su Google Search Console (#12 / SEO).

### Prove

- Test `node:test` per la riduzione dei dati, il calcolo dei numeri dei bacini, le frasi di tempo («2 giorni e 1 ora», «visto ieri alle…»), il link Kiwi, i casi senza dati.
- Prova nel browser (telefono 375 px e computer): filtri, biglietto aperto, lucchetti, 404, pagine senza JS.
- Lighthouse: prestazioni e accessibilità ≥ 90 sul telefono.

## Scelte dopo la revisione (25/11/2026)

- **Linate:** Ryanair e Wizz non volano da Linate e nei dati non c'è nessun volo LIN. Nel sito si scrive «Malpensa e Orio al Serio» e Linate non compare tra gli aeroporti del filtro; torna quando ci saranno voli (regola «non promettere ciò che non c'è» prima di «testi così come sono»). Scelta mia.
- **Home §5 «Come cambiano i prezzi»:** tolta finché non c'è `/storico`. Scelta mia.
- **Home §7 «Dove si va»:** diventa «Dove si va nel weekend · le mete più economiche di questo mese dai nostri aeroporti» (niente «più cercate», non abbiamo quei dati); ogni meta porta all'esploratore filtrato su quella destinazione (`?a=parigi`). I ponti 2027 restano fuori finché non c'è la pagina (#44). Scelta mia.
- **Riquadro canale ed email:** nessuna data promessa: «Il canale sta per aprire» / «Il riassunto del martedì arriva presto». Scelta mia.
- **Privacy del primo pezzo:** copre solo la visita al sito, Cloudflare (hosting e Web Analytics senza cookie) e le mail che ci scrivi; le parti su lista email e fornitore (Brevo/MailerLite) entrano con #9. Scelta mia.

- **Indirizzo pubblico: info@dovaivoli.it** (deciso da Bruno il 25/11/2026; è quello creato su iCloud+ il 20/11, i testi che dicono ciao@ vanno letti info@).
- **Nome e città del titolare:** per ora vuoti (deciso da Bruno il 25/11/2026). Stanno in un solo file (`sito/titolare.js`); finché sono vuoti la preparazione in locale funziona e mostra i segnaposto, ma **la pubblicazione su dovaivoli.it si rifiuta** di partire. Bruno li completa, e il sito va online.

## Lasciato al costruttore

- Nomi interni, struttura dei modelli, come scrivere l'HTML (template string).
- Formato esatto di `voli.json` e della chiave `?volo=`.
- Tabella degli aeroporti lontani dal centro (piccola, scritta a mano, ampliabile).
- Testi delle pagine come-funziona / domande / note legali: da `testi/SERVIZIO.md` e `testi/PRIVACY.md`; dove mancano, scrivere nella voce GUIDA §3 e segnalarlo.
