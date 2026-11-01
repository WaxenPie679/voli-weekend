---
version: 1
slug: "web-index-html"
primary_target: "web/index.html"
related_targets: []
---

# Superficie: web/index.html — Voli Weekend

Modalità: Operate. Utente: Bruno, consultazione rapida da PC e iPhone. Compito: vedere le offerte migliori in assoluto sugli 8 weekend e aprire la prenotazione. Vincoli: HTML/CSS/JS senza build, italiano, dati da JSON (direct.json, connections.json), freschezza delle fonti sempre visibile.

## Direction contract

THESIS: ogni offerta è una carta d'imbarco: la tratta in codici IATA grandi, il prezzo sulla matrice staccabile. Rifiuta la tabella grigia di risultati con filtri a sinistra, tipica della categoria.

OWN-WORLD: cartoncino bianco su fondo grigio-azzurro (#f2f4f7), inchiostro quasi nero, un solo colore (#1d5fbf) sul prezzo, che è il dato principale. Geist con cifre tabellari, codici IATA a 700 molto grandi. La carta ha due tacche semicircolari intagliate ai bordi dove inizia la matrice. Niente ombre, angoli a 8px.

STORY: Bruno apre la pagina, legge in alto la frase con l'offerta migliore e quanti voli ci sono sotto 80 €, scorre la classifica (una carta per destinazione, la più economica), filtra per aeroporto o diretti, tocca "Prenota" e passa al sito della compagnia.

FIRST VIEWPORT: barra superiore di 48px con il marchio (un biglietto stilizzato in inchiostro: scelto al posto del monogramma VW perché richiama la carta d'imbarco senza usare il colore riservato al prezzo), il nome e tre indicatori di freschezza (Ryanair, Wizz, Google), in forma compatta su telefono. Titolo h1 "Le offerte migliori" con la frase dell'offerta principale; sotto, una riga di filtri standard (aeroporto, tipo, prezzo massimo, weekend, raggruppa). Poi le prime 3-4 carte d'imbarco a tutta colonna (1100px); su telefono le carte si impilano con la matrice sotto.

FORM: carta d'imbarco (scelta da Bruno, "pick" di Impeccable, la n. 1 della mia lista ordinata); mossa caratteristica: la barra "ore a destinazione", con la lunghezza proporzionale al tempo passato a destinazione (dalla notazione Labanotation, la durata è la lunghezza). Stile app di taste: achromatic-ledger. seed:761e24898744d4e5

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
