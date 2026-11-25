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
- **Striscia delle partenze** (`parti/striscia.js`, GUIDA §7): fascia foglia sotto l'apertura (era limone fino al 25/11/2026: la testata gialla ha già il limone, il verde separa la striscia; moro su foglia 9,9:1, ruggine scura 4,65:1), slogan in Gabarito, poi le 8 tratte più basse in mono maiuscolo. Il prezzo resta `30 € a/r`, in ruggine scura. Scorre da destra a sinistra in 48 s. Si ferma col pulsante (è una casella, va anche senza JavaScript), sotto il puntatore e con la tastiera. Col movimento ridotto è ferma e si scorre a mano. La seconda copia del nastro è `aria-hidden`.

## Movimento

Un linguaggio solo: biglietto, timbro, tabellone delle partenze, rotta. Mappa decisa con Bruno il 25/11/2026: `docs/superpowers/specs/2026-11-25-movimento-sito-dovai.md`.

- **L'aereo che diventa la D** (home e bacini, `statico/js/aereo.js`): alla prima apertura della visita l'aereo dell'icona app (asta della D con due ali) entra da destra nella fascia sopra il titolo, vira verso l'alto e atterra nel logo; l'ala destra si allarga e diventa la pancia della D. Da computer è grande 1,6 volte e dura 1,3 s, sul telefono 1,15 volte e 1 s (lì la fascia è stretta e l'aereo sfiora il titolo che compare). Mentre vola la D del logo non c'è (`.aereo-in-volo`); il tabellone e il timbro del biglietto del giorno aspettano l'atterraggio (`--dopo-aereo`, 1,1 s). Non parte se la visita l'ha già visto (`sessionStorage`), se la pagina è già scorsa o apre un volo (`?volo=`, `#ancora`), col movimento ridotto o senza JavaScript. Se aereo.js non arriva, la D torna da sola dopo 3 s. Il logo sta dentro la pagina come SVG (dai tracciati di `img/dovai-moro.svg`), il nome lo dice il link.
- **Apertura** (il momento d'autore): il testo sale, il biglietto del giorno arriva leggermente ruotato e si raddrizza, la perforazione si disegna. Il bollino compare e le cifre del prezzo **girano come un tabellone** (ogni cifra è un rullo 0–9 in `parti/del-giorno.js`; le unità si fermano per ultime, verso 1,15 s). Poi il **timbro** batte il prezzo e si allarga un anello d'inchiostro. Il pallino «Il più economico di oggi» pulsa due volte e si ferma. Il prezzo vero sta in `.nascosto` per i lettori di schermo. **Sul telefono** il volo del giorno non è nell'apertura: il tabellone gira sul prezzo del primo biglietto della lista, al primo disegno di esplora.js (`bollino--gira`), e poi il timbro batte.
- **Filtri** (esplora.js, View Transitions): quando cambia un filtro, i biglietti che restano **scorrono al nuovo posto** (0,38 s), gli esclusi escono in 0,16 s e i nuovi arrivano. Il resto della pagina non si dissolve (`html.vt-lista`). Il cursore del prezzo resta trascinabile, perché ogni transizione nuova chiude quella in corso. Se la lista non cambia, non si anima niente.
- **Come funziona**: una **rotta tratteggiata** lega le sezioni e si disegna fino al punto a metà schermo mentre leggi. Su ogni titolo c'è una tappa (ovale limone col bordo moro, come il bollino) che si timbra quando la rotta ci arriva. È l'unico movimento legato allo scorrimento in tutto il sito.
- **Risposta al gesto**: i biglietti si alzano di 2 px e il bollino si inclina un po' di più, i bottoni salgono di 1 px e scendono al clic, le mete diventano limone, la sottolineatura del menu si disegna. I biglietti di «Mostra altri voli» arrivano in fila (40 ms l'uno, al massimo mezzo secondo).
- **Mai**: comparse o dissolvenze allo scorrere su sezioni e biglietti, parallax, schermate di caricamento, effetti che seguono il cursore. La D del logo resta dritta e ferma: si muove solo una volta, quando ci atterra l'aereo.
- Dove il browser non ha View Transitions o animazioni legate allo scorrimento, il sito resta com'era: la lista cambia di colpo, la rotta è già disegnata. Con `prefers-reduced-motion: reduce` niente si sposta: tutto è già al suo posto, prezzo compreso.

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
