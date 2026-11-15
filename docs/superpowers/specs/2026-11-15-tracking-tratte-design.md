# Tratte seguite (tracking) — Design

Data: 2026-11-15
Stato: bozza da approvare
Si appoggia a: `2026-11-12-storico-prezzi-design.md`, `2026-11-13-grafici-storico-design.md`

## 1. Intento e perché

Bruno vuole **seguire nel tempo tratte scelte da lui**, senza i limiti del weekend, per organizzare viaggi precisi. Il primo caso: **Bari → Dubrovnik per un viaggio tra amici nell'estate 2027**. Per ogni tratta seguita vuole:

1. capire **quando conviene comprare**, grazie allo storico dei prezzi;
2. ricevere un **avviso quando il prezzo scende** nelle date che ha scelto.

Deve poter seguire **più tratte nello stesso momento**.

Successo: Bruno aggiunge «Bari–Dubrovnik, luglio, 7 notti, 6 persone» dal telefono in meno di un minuto. Da quel momento sa sempre quanto costa oggi la combinazione migliore e riceve un messaggio quando scende.

## 2. Decisioni di Bruno

| Tema | Decisione |
|---|---|
| Date | due modi, entrambi disponibili: **date precise** oppure **finestra** (mese/i + giorni della settimana) |
| Aggiungere/togliere un tracking | **modulo nell'app che apre una richiesta su GitHub** già compilata (strada 1) |
| Numero di persone | parametro **regolabile** per ogni tracking |

## 3. Cosa c'è già (verificato il 2026-11-15)

- Lo storico (`history.yml`, una volta al giorno) raccoglie **già** Ryanair BRI↔DBV in entrambe le direzioni dal 2026-11-12. L'estate 2027 è in vendita da fine marzo a fine ottobre, con circa 22 voli al mese e prezzi oggi da circa 23–28 € a tratta.
- Lo storico copre solo Ryanair e Wizz da e per BRI/BDS. Il riepilogo per tratta (branch `summary`, `BRI-DBV.json`) contiene la curva «prezzo ↔ giorni alla partenza» e il punto di salita (`rise`), indicativo da 28 giorni di dati e affidabile da 90.
- Gli avvisi di oggi (`src/alerts.js`) valgono solo per i weekend sotto gli 80 €. Il riferimento è il prezzo dell'ultimo avviso e non risale mai.
- L'API Ryanair `cheapestPerDay` dà lo stesso prezzo con `adultPaxCount=1` e `=6` (provato su BRI→DBV, luglio 2027): **il calendario non dice quanti posti restano a quel prezzo**. L'API `availability`, che lo direbbe, risponde «Availability declined» alle chiamate automatiche.

## 4. Obiettivi, non-obiettivi, anti-obiettivi

**Obiettivi**
- Elenco di tratte seguite, ognuna con tratta, modo date, ritorno facoltativo e numero di persone.
- Controllo dei prezzi delle tratte seguite **ogni 2 ore**.
- Pagina «Tratte seguite» nell'app: per ogni tracking mostra il prezzo migliore di oggi, i voli che lo compongono, l'andamento da quando è stato aggiunto e il consiglio su quando comprare.
- Avviso su Telegram e iPhone quando il prezzo migliore scende.

**Non-obiettivi (prima versione)**
- Google Voli e compagnie diverse da Ryanair e Wizz. *Scelta di Claude*: serve a partire con fonti affidabili e veloci. Bari–Dubrovnik è Ryanair. Si potrà aggiungere dopo.
- Voli con scalo.
- Filtri di orario («partenza dopo le 18»).
- Più aeroporti di partenza nello stesso tracking (Bari *o* Brindisi): si aggiungono due tracking.
- Prezzo esatto per gruppo letto dalla compagnia (impossibile, vedi §3).

**Anti-obiettivi**
- Rallentare o far bloccare la ricerca ogni 15 minuti (`direct.yml`) o la raccolta notturna.
- Chiavi o password salvate nell'app o sul telefono.
- Avvisi rumorosi: uno per ogni centesimo, o ripetuti per lo stesso prezzo.
- Mostrare come valido un volo esaurito o un prezzo vecchio senza dirlo.

## 5. Approcci considerati

**Come si aggiunge un tracking**

| | Approccio | Esito |
|---|---|---|
| 1 | Modulo nell'app → apre una **issue GitHub** precompilata; un tracking = una issue aperta, chiuderla = smettere | **scelto da Bruno**: nessuna chiave nell'app; GitHub fa da archivio e da elenco |
| 2 | Modulo che scrive su GitHub con una chiave salvata nel browser | scartato: chiave su ogni dispositivo, rischio se perso il telefono |
| 3 | Bruno chiede in chat e Claude modifica un file | scartato: Bruno non sarebbe autonomo |

**Dove si controllano i prezzi**

| | Approccio | Esito |
|---|---|---|
| A | Nuovo workflow `tracking.yml` ogni 2 ore, solo per le tratte seguite | **scelta di Claude**: poche richieste, ribassi presi in tempo, indipendente dagli altri giri |
| B | Usare la raccolta notturna dello storico | scartato: una volta al giorno è poco per gli avvisi e copre solo BRI/BDS |
| C | Aggiungerlo a `direct.yml` (ogni 15 minuti) | scartato: rischio di rallentare o far bloccare la ricerca principale |

## 6. Design

### 6.1 Il tracking

Campi:

- **da**, **a**: codici aeroporto IATA, per esempio `BRI`, `DBV`. Qualsiasi coppia servita da Ryanair o Wizz, non solo BRI/BDS.
- **andata e ritorno** oppure **solo andata**.
- **date**, in uno dei due modi:
  - **precise**: data di andata (e di ritorno);
  - **finestra**: uno o più mesi (per esempio luglio e agosto 2027), i giorni della settimana ammessi per l'andata (per esempio giovedì e venerdì) e, se c'è il ritorno, le notti minime e massime (per esempio da 5 a 7). Il ritorno può cadere nel mese successivo.
- **persone**: da 1 a 9, predefinito 1.
- **nome** facoltativo, per esempio «Dubrovnik con gli amici».

Il **prezzo di un tracking** è il prezzo per persona più basso tra le combinazioni valide: andata più ritorno con un numero di notti tra il minimo e il massimo, oppure la sola andata. Le compagnie si possono mescolare. Contano solo i giorni con stato `prezzo` (niente esauriti, niente «da verificare»). Il **totale gruppo** è il prezzo per persona × persone.

### 6.2 Aggiungere e togliere (issue GitHub)

- La pagina «Tratte seguite» ha un modulo («Segui una tratta»). Alla conferma apre `github.com/WaxenPie679/voli-weekend/issues/new` con titolo ed etichetta `tracking` già impostati. Il corpo contiene i campi in un blocco leggibile da una persona e dal programma. *Scelta di Claude*: il formato esatto è lasciato al costruttore, ma deve restare comprensibile se Bruno lo guarda su GitHub.
- Il workflow parte all'apertura, modifica o chiusura di una issue con etichetta `tracking`, oltre che ogni 2 ore. Valgono **solo le issue aperte da WaxenPie679**: il progetto è pubblico, e le issue di altri sono ignorate.
- Dopo il primo controllo il workflow scrive un **commento di conferma** sulla issue, con il tracking come l'ha capito e il prezzo di oggi. Se i dati sono sbagliati (aeroporto inesistente, tratta non servita, date passate), il commento spiega l'errore e il tracking non si attiva.
- **Togliere**: si chiude la issue. Il pulsante «Smetti di seguire» nell'app apre la issue su GitHub.
- **Fine naturale**: quando tutte le date sono passate, il workflow chiude la issue con un commento finale (prezzo più basso visto e quando).
- **Modificare**: si modifica il corpo della issue, e vale come un tracking nuovo con la stessa storia. *Scelta di Claude.*

### 6.3 Controllo dei prezzi (`tracking.yml`)

- Ogni 2 ore a un minuto non tondo, più all'evento issue e manualmente. Concorrenza propria (`group: tracking`), timeout breve.
- Per ogni tracking attivo scarica solo i mesi che servono:
  - Ryanair `cheapestPerDay`, un mese per richiesta per direzione;
  - Wizz `timetable`, finestre di 30 giorni con andata e ritorno insieme.
  
  Le tratte si verificano con gli elenchi già usati (`parseRyanairRoutes` / `parseWizzRoutes`), estesi a qualsiasi aeroporto di partenza. Si riusano la lettura dei giorni (`parseRyanairDays`, `parseWizzDays`) e i nuovi tentativi su 429/503 (`fetchRetry`) dello storico. Stesse pause della raccolta notturna.
- Se una fonte fallisce, il tracking conserva l'ultimo prezzo valido con la sua data e il problema si vede nell'app. Un errore non ferma gli altri tracking.
- Risultato pubblicato sul branch `data` (lo stesso schema già in uso), in due file:
  - `tracking.json`: per ogni tracking il prezzo di oggi, i voli scelti (date, orari, compagnia, link di prenotazione), le 5 combinazioni migliori, lo stato delle fonti e la **serie giornaliera** del prezzo migliore (un punto al giorno: minimo del giorno). La serie si conserva finché la issue è aperta, poi si toglie.
  - `alerts_state_tracking.json`: stato degli avvisi.

  *Scelta di Claude*: la serie sta dentro `tracking.json`, che resta piccolo (decine di punti per tracking), invece che nello storico append-only.

### 6.4 Avvisi

- Canali: Telegram e iPhone, come oggi (`sendTelegram`, `sendPush`).
- **Quando**: il prezzo per persona scende **almeno 3 € sotto il prezzo dell'ultimo avviso** di quel tracking. *Scelta di Claude*: 3 € evitano i messaggi per pochi centesimi; il valore resta modificabile in un punto solo. Come oggi, il riferimento non risale.
- **Primo messaggio**: all'attivazione arriva un messaggio «Ora seguo…» con il prezzo di partenza, che diventa il primo riferimento.
- **Contenuto**: nome o tratta; date dei voli; prezzo per persona e totale gruppo; di quanto è sceso; consiglio dello storico se c'è (§6.5); link alla pagina e alla compagnia.
- Con il viaggio vicino e pochi posti, il prezzo per un gruppo può essere più alto di quello mostrato. L'avviso lo ricorda solo quando persone > 1 (una riga).

### 6.5 «Quando conviene comprare»

- Se la tratta è nello storico (Ryanair/Wizz da o per BRI/BDS), la pagina legge il riepilogo già pubblicato (`summary/BRI-DBV.json` e il ritorno) e mostra:
  - la curva «prezzo mediano ↔ giorni alla partenza», segnando dove cadono le date del tracking;
  - il punto in cui di solito il prezzo sale, con l'affidabilità («prime indicazioni», «indicativa», «affidabile»);
  - una frase semplice, per esempio «Mancano 236 giorni. Di solito su questa tratta il prezzo sale a circa 6 settimane dalla partenza: c'è tempo, ma tieni d'occhio gli avvisi».
- Se la tratta non è nello storico, si mostra solo la serie del tracking, con la nota «storico in costruzione da quando l'hai aggiunta».
- Onestà sui limiti: finché non c'è almeno un'estate raccolta, il consiglio sull'estate si basa su altre date e va detto chiaramente.

### 6.6 Pagina «Tratte seguite»

Nuova pagina della webapp (`seguite.html`), raggiungibile dal menu in alto accanto a «Storico prezzi». Stesso stile e stessi principi: prezzo per primo, età dei dati sempre visibile, ogni riga porta alla prenotazione.

```
Tratte seguite                                  [+ Segui una tratta]

Dubrovnik con gli amici · Bari ⇄ Dubrovnik · luglio 2027, gio/ven, 5–7 notti · 6 persone
  56 € a persona · 336 € in 6         ↓ 8 € dall'ultimo avviso
  Andata gio 8 lug 06:25 · Ritorno gio 15 lug 21:10 · Ryanair
  [grafico: prezzo migliore giorno per giorno]
  Di solito sale a ~6 settimane dalla partenza (indicativa) · aggiornato 40 min fa
  Altre combinazioni ›   Prenota ›   Smetti di seguire ›
```

Il modulo «Segui una tratta» propone gli aeroporti con completamento automatico, preso dall'elenco delle tratte già noto. Ha la scelta tra date precise e finestra, i mesi con caselle, i giorni della settimana con caselle, le notti minime e massime e le persone con un selettore. Il tasto «Segui su GitHub» apre la issue.

## 7. Lasciato al costruttore

- Formato preciso del corpo della issue e sua lettura, con errori chiari nel commento.
- Come ottenere l'elenco degli aeroporti per il completamento automatico (file statico generato o elenchi tratte già pubblicati).
- Come verificare se Wizz cambia prezzo con `adultCount` > 1. Se sì, usare le persone nella richiesta Wizz.
  - **Verificato il 2026-11-15** (BRI→BUD, 1–10 luglio 2027): sì, Wizz restituisce un prezzo a persona più alto con `adultCount: 6` (es. 55,99 → 65,99 €; 69,99 → 89,99 €). Ryanair `cheapestPerDay` invece ignora il numero di persone. Usare le persone nella richiesta Wizz è un compito a parte, non incluso in questa versione.
- Link di prenotazione con il numero di persone già impostato, dove la compagnia lo permette.
- Permessi del workflow (`issues: write` per commentare e chiudere) e aggiornamento di `keepalive.yml` e `health.yml` (avviso se `tracking.yml` non gira da più di ~6 ore).
- Nomi di moduli e funzioni, test con `node --test`, testi in italiano.

## 8. Per Bruno, passi manuali previsti

- Il primo push con il nuovo workflow va fatto da Bruno nel Terminale (serve la sua chiave con permesso `workflow`), come per lo storico.
- Creare l'etichetta `tracking` su GitHub, se il workflow non riesce a crearla da solo.
- Essere entrato in GitHub dal browser del telefono per confermare le issue.
