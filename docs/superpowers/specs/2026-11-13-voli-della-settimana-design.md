# Voli della settimana dal grafico — Design (piccola modifica)

Data: 2026-11-13
Stato: bozza da approvare
Si appoggia a: `2026-11-12-storico-prezzi-design.md` (raccolta) e `2026-11-13-grafici-storico-design.md` (pagina Storico prezzi)

## Intento

Nel grafico «Quando comprare» Bruno tocca una settimana (es. «6 settimane prima») e vuole vedere **i voli che partono tra circa 6 settimane da oggi, con il prezzo di oggi**: giorno, orario, prezzo, compagnia e un link per cercarli sul sito della compagnia. Serve a passare da «a questa distanza di solito conviene» a «ecco i voli da comprare».

## Approcci

| Approccio | Esito |
|---|---|
| Dati della raccolta notturna, con gli orari aggiunti alla raccolta e al riepilogo | **scelto**: niente richieste in più, funziona sul telefono, prezzo vecchio al massimo di un giorno |
| Prezzi in diretta da Ryanair/Wizz al momento del tocco | scartato: le compagnie bloccano le richieste dal browser, servirebbe un server nostro |
| Dati ogni 15 minuti della pagina principale | scartato: solo voli del weekend |

## Design

**1. Raccolta (tappa 1).** Si salva anche l'orario del volo, in una nuova colonna `orario` in fondo al CSV giornaliero:
- Ryanair: partenza e arrivo del volo più economico del giorno, `10:05-11:55` (da `departureDate`/`arrivalDate` di `cheapestPerDay`);
- Wizz: tutte le partenze del giorno separate da spazio, `15:20 21:40` (da `departureDates`; Wizz non dà l'arrivo né quale volo ha il prezzo più basso);
- vuoto se l'orario manca. Un cambio del solo orario conta come cambiamento e genera una riga.
- I file già scritti (12 e 13 novembre) restano validi: senza colonna l'orario è vuoto. Nessuna riscrittura dello storico.

**2. Riepilogo.** Ogni volo in `flights` porta anche l'ultimo orario noto: `[data, cambi, orario]` (orario `''` se non noto). Le altre parti del riepilogo non cambiano.

**3. Pagina.**
- Nel grafico «Quando comprare» si può **toccare una settimana** (anche dove la curva non ha punti; con la tastiera, Invio sulla settimana evidenziata). La settimana scelta si evidenzia con una fascia verticale.
- Sotto il grafico compare il riquadro **«Voli che partono tra N settimane»** con l'intervallo di date (settimana N = partenze da oggi + 7·N a oggi + 7·N + 6 giorni, dove «oggi» è l'ultimo giorno raccolto; settimana 0 = entro 6 giorni).
- Una riga per ogni partenza con prezzo, per compagnia: `gio 25 dic · 10:05 → 11:55 · Ryanair · 42,96 €` e il pulsante **«Cerca»**, che apre il sito della compagnia con tratta e data già compilate (Ryanair: stesso formato del link della pagina offerte, sola andata; Wizz: pagina di selezione volo con tratta e data). Orario sconosciuto → la riga lo omette.
- Righe in ordine di data; il prezzo più basso del riquadro è evidenziato. Partenze esaurite o da verificare non sono in elenco; se ce ne sono, una riga in fondo le conta («2 voli esauriti»).
- Una nota sotto il riquadro: «Prezzi della raccolta di stanotte: sul sito della compagnia vedi quello di adesso.»
- Prima del primo tocco, al posto del riquadro: «Tocca una settimana per vedere i voli che partono in quel periodo.»
- Settimana senza voli con prezzo: «Nessun volo con prezzo in questa settimana.»

## Cosa resta al costruttore

Nomi delle funzioni, formato esatto dei link Wizz (da verificare aprendolo davvero), aspetto del riquadro secondo `DESIGN.md`, come rigenerare i dati di esempio.
