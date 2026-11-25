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

## Il biglietto

- Corpo **moro** (si tocca per aprirlo: è il `<summary>` di un `<details>`, funziona senza JS): tratta in mono carta, date in mono foglia, permanenza, «solo zaino · compagnia», «visto alle…».
- **Bollino** del prezzo: ovale limone, testo moro Gabarito 900, ruotato −6° come un timbro.
- **Perforazione** oliva tratteggiata con due tagli tondi (colore `--fondo` del foglio sotto).
- **Matrice panna**: «Vedi su Kiwi» pieno ruggine, «o su {compagnia}» link, «Con Kiwi sostieni DoVai», «Compra o aspetta? [lucchetto] Premium» con lucchetto SVG disegnato (mai emoji).
- Aperto: andata e ritorno, «Da sapere» solo per aeroporti lontani, i due bottoni grandi, «Perché due bottoni?», «Altre date», «Ricevilo prima la prossima volta». La matrice chiusa si nasconde (`:has`).
- Si srotola con `::details-content` dove il browser lo sa fare e il movimento non è ridotto.

## Griglia

Telefono prima: un biglietto per riga. `.biglietti` = `auto-fill, minmax(320px, 1fr)` → 2 colonne da tablet, 3 su computer; contenuto al massimo 1100 px, margine 16–40 px. I riquadri occupano tutta la riga.
