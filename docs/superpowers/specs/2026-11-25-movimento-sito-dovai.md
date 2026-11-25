# Movimento del sito DoVai · mappa dei momenti (proposta)

25/11/2026 · vale per `sito/`.

**Decisione di Bruno (25/11/2026):** sì a 1 (riordino filtri) e 2 (tabellone del prezzo), sì al 5 (rotta in Come funziona). No al 4 per ora. Il 3 (biglietto che vola) è stato provato in anteprima e **tolto** su richiesta di Bruno (25/11). Sul telefono il tabellone gira sul primo biglietto della lista, perché lì il biglietto del giorno non c'è.

## Cosa c'è oggi

Un solo momento d'autore, all'apertura: il testo sale, il biglietto del giorno arriva, la perforazione si disegna e il timbro batte il prezzo. Il resto risponde al gesto: hover sui biglietti e sui bottoni, la striscia che scorre e la fila di «Mostra altri voli». Tutto rispetta il movimento ridotto.

**Cosa manca:** il movimento finisce dopo due secondi. Nei punti che si usano davvero (cambiare un filtro, aprire un volo, andare a prenotare) la pagina «salta» invece di accompagnare. Lì si sente se un sito è curato.

## Regole

- **Un linguaggio solo:** biglietto, timbro, tabellone delle partenze, decollo. Niente effetti generici: nessuna dissolvenza allo scorrere, nessun parallax, nessuna schermata di caricamento che fa aspettare.
- **Ogni animazione ha un compito:** confermare un gesto, spiegare un cambio, oppure essere uno dei pochi momenti d'autore.
- **Tempi:** 100–150 ms per le risposte, 300–450 ms per i cambi di lista, 500–800 ms solo per i momenti d'autore. L'uscita è più veloce dell'entrata. Niente rimbalzi.
- **Peso:** solo CSS e Web Animations / View Transitions già nel browser. Nessuna libreria, nessun WebGL. Dove il browser non sa farlo, il sito resta com'è oggi.
- **Movimento ridotto:** niente si sposta. Restano solo i cambi di colore o di opacità che confermano un gesto.

## I momenti proposti

| # | Dove | Cosa succede | Compito | Durata |
|---|---|---|---|---|
| 1 | Esplora · quando cambi un filtro (home e bacini) | I biglietti che restano **scorrono al nuovo posto**, quelli esclusi escono svelti e i nuovi arrivano. Il numero nel riepilogo si aggiorna. | continuità: capisci cosa è cambiato | ~350 ms |
| 2 | Prezzo del biglietto del giorno (apertura, da computer) | Prima del timbro, le cifre del prezzo **girano come un tabellone delle partenze** e si fermano sul prezzo vero. Poi il timbro batte come oggi. | momento d'autore: «prezzi di oggi» | ~600 ms, una volta |
| 3 | «Tutti i dettagli» sul biglietto del giorno | Il biglietto dell'apertura **vola al suo posto nella lista** e si apre lì, invece di saltare con lo scorrimento. | continuità tra due punti della pagina | ~450 ms |
| 4 | «Vedi su Kiwi» / «o su {compagnia}» | Al clic, dal bottone **decolla il simbolo aereo** (la D con le due ali dell'icona app, dai tracciati di Bruno) e sparisce in alto a destra. La pagina del partner si apre subito, l'animazione non fa aspettare. | conferma del gesto più importante, è il decollo già in lista dal 24/11 | ~500 ms |
| 5 *(facoltativo)* | Come funziona | Una **rotta tratteggiata**, come la perforazione, si disegna da una sezione all'altra mentre scorri. È legata alla barra di scorrimento, dentro quella pagina sola. | momento d'autore su una pagina oggi solo testo | segue lo scorrimento |

Il logo nell'intestazione **non si muove**: la D del logo non si ruota mai. Il decollo usa solo il simbolo dell'icona app.

## Scartati

- Dissolvenze o comparse allo scorrere su sezioni e biglietti: fanno sembrare il sito un modello già visto.
- Schermata di caricamento col decollo: il sito si apre in un attimo e farebbe solo aspettare. Il video del decollo per i social è un lavoro a parte.
- Titolo con la meta che cambia («per Catania… per Londra…»): cambierebbe il testo approvato in #7.
- Effetti che seguono il cursore, inclinazioni 3D, parallax.

## Cosa cambia nel DESIGN.md

La sezione *Movimento* passa da «un solo momento d'autore» a: **un momento d'autore all'apertura (timbro e tabellone), il decollo come firma del gesto «prenota», e la continuità nella lista**. «Nessuna comparsa allo scorrere» resta, con un'eccezione solo se Bruno approva il #5.

## Come si verifica

- Anteprima su prova.dovai.pages.dev: Bruno la prova da iPhone e da computer prima del merge.
- Controllo con movimento ridotto attivo, solo tastiera e un telefono lento (niente scatti con 60+ biglietti).
- Il primo biglietto resta dentro il primo schermo, con le misure del DESIGN.md.
- Revisione finale con `design:accessibility-review` e `design:design-critique`.
