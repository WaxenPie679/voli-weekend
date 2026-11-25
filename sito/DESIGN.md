# Aspetto del sito DoVai (dovaivoli.it)

Vale solo per `sito/`. I file `DESIGN.md` e `PRODUCT.md` nella radice del repo descrivono la vecchia webapp personale «Voli Weekend» (look blu da carta d'imbarco): **non** sono il brand DoVai.

Fonte del brand: `Voli Weekend Servizio/brand/GUIDA.md` (§6, §7, §10), `brand/token/colori.css`, `brand/token/caratteri.css`.

## Colori · palette «Limonaia»

| Token | HEX | Uso nel sito |
|---|---|---|
| `--carta` | `#FBF5E9` | fondo della pagina |
| `--moro` | `#2A1A14` | testo, corpo del biglietto, piede |
| `--limone` | `#FFDD45` | solo fondo: intestazione, bollino del prezzo sul biglietto, riquadro canale |
| `--ruggine` | `#A6401F` | prezzo e azione: «Vedi su Kiwi», «Passa a Premium», pomello del cursore |
| `--foglia` | `#B5D095` | il «quando»: date sul biglietto scuro |
| `--panna` | `#FFFCF5` | matrice del biglietto, scheda dei filtri |
| `--fondo-foglia` | `#E3F1D3` | riquadro Premium |
| `--moro-chiaro` | `#7F6156` | note piccole su carta e panna (5,2:1) |
| `--moro-medio` | `#5A4636` | note piccole su limone (6,6:1), dove il moro chiaro non basta (4,2:1) |
| `--carta-tenue` | `#C9BBAA` | testo secondario sul biglietto scuro (8,9:1) |
| `--oliva` | `#637B44` | perforazione |

Vietati: limone o foglia come testo su carta; ruggine su moro (per questo i bottoni stanno sulla matrice panna).

## Caratteri

Copie locali in `statico/caratteri/` (OFL, vedi LEGGIMI): Gabarito (titoli, prezzo, bottoni), JetBrains Mono (tratte, date, orari, **ogni freccia →**), DM Sans (frasi). La freccia ha un file suo perché non sta nel sottoinsieme latino.

## Apertura e striscia delle partenze

- **Niente riga sopra il titolo.** Lo slogan «Quando parti, DoVai?» apre la striscia delle partenze.
- **Volo del giorno** (home e bacini, da 900 px in su): titolo a sinistra, a destra il volo più economico (`parti/del-giorno.js`) come biglietto non apribile, con «Vedi su Kiwi», «o su {compagnia}» e «Tutti i dettagli» (`?volo=`, apre lo stesso volo nella lista). Sul telefono non c'è: il primo biglietto della lista è già lui.
- **Striscia delle partenze** (`parti/striscia.js`, GUIDA §7): fascia limone sotto l'apertura, slogan in Gabarito, poi le 8 tratte più basse in mono maiuscolo. Il prezzo resta `30 € a/r`, in ruggine scura. Scorre da destra a sinistra in 48 s. Si ferma col pulsante (è una casella, va anche senza JavaScript), sotto il puntatore e con la tastiera. Col movimento ridotto è ferma e si scorre a mano. La seconda copia del nastro è `aria-hidden`.

## Movimento

Un solo momento d'autore, all'apertura: il testo sale, il biglietto del giorno arriva leggermente ruotato e si raddrizza, la perforazione si disegna, poi il **timbro** batte il prezzo con un anello d'inchiostro. Il pallino «Il più economico di oggi» pulsa due volte e si ferma. Tutto il resto è risposta al gesto: i biglietti si alzano di 2 px e il bollino si inclina un po' di più, i bottoni salgono di 1 px e scendono al clic, le mete diventano limone, la sottolineatura del menu si disegna. I biglietti di «Mostra altri voli» arrivano in fila (40 ms l'uno, al massimo mezzo secondo). Nessuna comparsa allo scorrere. Con `prefers-reduced-motion: reduce` niente si sposta: tutto è già al suo posto.

## Intestazione, piede, accessibilità

- **Intestazione** fissa in alto; appena si scorre prende un'ombra (`animation-timeline: scroll()`, dove c'è). `scroll-padding-top` evita che le ancore finiscano sotto.
- **«Vai al contenuto»**: il primo Tab, pillola moro in alto a sinistra.
- La pagina in cui sei ha `aria-current="page"` e la sottolineatura fissa.
- **Piede**: apre col payoff «Più weekend, *quando conviene.*» in Gabarito 800 grande, seconda metà in limone (su moro 11:1).
- Ogni link o controllo fuori dal testo corrente è alto almeno 44 px. La sezione dei voli ha un H2 «I voli» per i lettori di schermo (prima i biglietti H3 venivano subito dopo l'H1).

## Il biglietto

- Corpo **moro** (si tocca per aprirlo: è il `<summary>` di un `<details>`, funziona senza JS): tratta in mono carta, date in mono foglia, permanenza, «solo zaino · compagnia», «visto alle…».
- **Bollino** del prezzo: ovale limone, testo moro Gabarito 900, ruotato −6° come un timbro.
- **Perforazione** oliva tratteggiata con due tagli tondi (colore `--fondo` del foglio sotto).
- **Matrice panna**: «Vedi su Kiwi» pieno ruggine, «o su {compagnia}» link, «Con Kiwi sostieni DoVai · link affiliato» (solo col codice affiliato), «Compra o aspetta? [lucchetto] Premium» con lucchetto SVG disegnato (mai emoji).
- Aperto: andata e ritorno, «Da sapere» solo per aeroporti lontani, i due bottoni grandi, «Perché due bottoni?», «Altre date», «Ricevilo prima la prossima volta». La matrice chiusa si nasconde (`:has`).
- Si srotola con `::details-content` dove il browser lo sa fare e il movimento non è ridotto.

## Griglia

Telefono prima: un biglietto per riga. `.biglietti` = `auto-fill, minmax(320px, 1fr)` → 2 colonne da tablet, 3 su computer; contenuto al massimo 1100 px, margine 16–40 px. I riquadri occupano tutta la riga.

## Filtri e primo schermo

«Appena entri vedi i biglietti»: il primo biglietto deve cominciare dentro il primo schermo (375×812 e 1024×768, home e pagine dei bacini). Per questo:

- In vista solo **Da dove parti**, **Weekend / Weekend lungo** e **Fino a … € a/r** (cursore in una riga, «30 € [cursore] 400 €»), più il riepilogo.
- **Quando**, **Quanto resti**, **Dove vuoi andare** stanno in «Altri filtri» (`<details>`, va anche senza JavaScript). esplora.js lo apre se l'indirizzo usa `?mese`, `?resta` o `?a`. «Togli i filtri» sta a destra del suo titolo.
- Con JavaScript la lista cambia mentre si sceglie e «Mostra i voli» si nasconde; senza, resta.
- Sul telefono l'etichetta «Tipo di weekend» c'è solo per i lettori di schermo.
- Apertura e introduzione del bacino strette: l'introduzione sta dentro l'apertura (`extra`); sul telefono margini ridotti e filtri più stretti, perché la striscia non spinga giù i biglietti.
- Misure del 25/11/2026 a 375×812 (inizio del primo biglietto): home 704, Puglia 784, Roma 762. Milano e Bergamo 838: era già fuori prima della striscia (836), per l'introduzione più lunga. Da computer il primo biglietto è quello del giorno, nell'apertura.
