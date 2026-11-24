# Raccolta prezzi da Milano, Bergamo e Roma: progetto

Data: 24/11/2026 · Issue DoVai: WaxenPie679/voli-weekend-servizio#41 · Stato: da approvare

## Perché

DoVai avrà tre bacini di partenza: Puglia, «Milano e Bergamo», Roma. Oggi i prezzi si raccolgono solo da Bari e Brindisi. Bisogna raccogliere da subito anche da Malpensa (MXP), Linate (LIN), Orio al Serio (BGY), Fiumicino (FCO) e Ciampino (CIA), così lo storico comincia a riempirsi. Le pagine del sito vanno su Google solo con almeno 28 giorni di dati.

## Obiettivi

- Prezzi dai cinque aeroporti nuovi con tutte e tre le fonti di oggi: Ryanair, Wizz e Google Voli.
- Storico giornaliero (12 mesi di date) anche per i nuovi aeroporti.
- Ogni raccolta resta nei tempi massimi di GitHub Actions.

## Cosa non si fa (decisione di Bruno, 24/11: «A, separati»)

- La webapp personale di Bruno, gli avvisi Telegram e push, le tratte seguite e la pagina dello storico **restano solo Puglia**, senza nessuna modifica visibile.
- Le pagine del sito DoVai non si costruiscono adesso (#8). Il motore resta a 200 € e 8 weekend (si allarga con #40, dopo).
- Non si cambia fonte: Travelpayouts e SerpApi arrivano dopo il test di S1–S2.

## Da evitare

- Avvisi o voli di Milano e Roma che finiscono nella webapp o sul Telegram di Bruno.
- Un errore di un gruppo che fa perdere i dati di un altro, o che rompe la Puglia.
- Troppe richieste ravvicinate a Ryanair e Wizz, con il rischio di farsi bloccare.

## Strade considerate

1. **Un lavoro parallelo per ogni gruppo di raccolta dentro le tre ricerche esistenti** (diretti, scali, storico). **Scelta.** Riusa tutto il codice, i gruppi girano su macchine diverse e la Puglia resta com'è.
2. Ricerche copiate per ogni bacino: stesso risultato, ma tre copie da tenere allineate. Scartata.
3. Raccolta nel repository privato di DoVai: con 2.000 minuti gratis al mese non basta. Scartata.

## Come funziona

**Gruppi di raccolta.** Il gruppo è più piccolo del bacino, così ogni raccolta resta nei tempi. Tratte Ryanair contate il 24/11: BRI 62, BDS 25, BGY 109, MXP 51, FCO 61, CIA 24, LIN 0. Lo storico Puglia richiede circa 31 minuti per 87 tratte.

| Gruppo | Aeroporti | Bacino del sito |
|---|---|---|
| `puglia` | BRI, BDS | Puglia |
| `milano` | MXP, LIN | Milano e Bergamo |
| `bergamo` | BGY | Milano e Bergamo |
| `roma` | FCO, CIA | Roma |

- Un solo file di configurazione elenca i gruppi, i loro aeroporti e il bacino.
- Il codice riceve il gruppo da una variabile d'ambiente. Senza variabile vale `puglia`, così i comandi di oggi continuano a funzionare.
- Le tre ricerche di GitHub (diretti, scali, storico) lanciano un lavoro per gruppo, in parallelo (matrice). Un gruppo che fallisce non ferma gli altri.

**Dove vanno i dati.**
- Branch `data`: la Puglia tiene `direct.json` e `connections.json` (la webapp li legge già). I gruppi nuovi scrivono `direct-<gruppo>.json` e `connections-<gruppo>.json`. La pubblicazione si riallinea già da sola in caso di scritture contemporanee.
- Storico: la Puglia resta sul branch `history`. I gruppi nuovi usano un branch ciascuno: `history-milano`, `history-bergamo`, `history-roma`. Così non si toccano i file degli altri gruppi.
- Il riepilogo per i grafici (branch `summary`) resta solo Puglia.

**Avvisi.** Solo il gruppo `puglia` manda avvisi Telegram e push.

**Aeroporti senza una compagnia.** A Linate Ryanair non vola e il suo elenco tratte risponde con un errore. A Linate e Ciampino Wizz non vola. Un aeroporto senza tratte per una compagnia si salta senza errore: non deve far fallire la compagnia per tutto il gruppo.

**Controllo giornaliero.** Il controllo delle 6:13 verifica anche i file e lo storico dei gruppi nuovi. Ogni problema riporta il nome del gruppo. Il messaggio Telegram arriva solo se c'è un problema, come oggi.

## Lasciato a chi costruisce

- Nomi esatti del file di configurazione e della variabile d'ambiente.
- Come i testi del controllo giornaliero indicano il gruppo.
- Se il codice di Google cerca per aeroporto (come oggi) o per città. Per aeroporto va bene, se i tempi lo permettono.

## Come si verifica

- `npm test` verde, con test nuovi su: scelta del gruppo, nomi dei file, avvisi solo per la Puglia, aeroporto senza tratte.
- Un giro vero su GitHub per ogni ricerca e ogni gruppo. Il branch `data` deve avere i file dei gruppi nuovi con voli veri, e i branch `history-*` il file del giorno.
- Tempi misurati per ogni gruppo, sotto i limiti (diretti 10 minuti, scali 60, storico 65).
- La webapp di Bruno è uguale a prima.
