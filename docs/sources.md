# Fonti dati (verificate il 2026-11-01)

## Ryanair — funziona
- `GET https://www.ryanair.com/api/farfnd/v4/roundTripFares`
- Parametri: `departureAirportIataCode`, `outboundDepartureDateFrom/To`, `outboundDepartureTimeFrom/To` (HH:mm), `inboundDepartureDateFrom/To`, `inboundDepartureTimeFrom/To`, `priceValueTo`, `currency=EUR`, `adultPaxCount=1`, `market=it-it`.
- Risposta: `fares[]` con `outbound` / `inbound` (`departureAirport`, `arrivalAirport{iataCode,name,countryName,city.name}`, `departureDate`, `arrivalDate` locali, `flightNumber`, `price.value`) e `summary.price.value` (totale A/R).
- Restituisce **una tariffa (la più bassa) per destinazione**. Esempio BRI 6→8 nov: 5 destinazioni.
- Link prenotazione: `https://www.ryanair.com/it/it/trip/flights/select?adults=1&dateOut=YYYY-MM-DD&dateIn=YYYY-MM-DD&originIata=BRI&destinationIata=XXX&isReturn=true`.

## Wizz Air — funziona, con limiti
- `https://wizzair.com/buildnumber` **non esiste più**. La versione API (es. `29.23.1`) si legge dalla home `https://wizzair.com/` cercando `be.wizzair.com/<versione>`.
- Rotte: `GET https://be.wizzair.com/<v>/Api/asset/map?languageCode=it-it` → `cities[]` con `iata`, `shortName`, `countryName`, `latitude`, `longitude`, `connections[].iata`. Oggi: BRI → 15 destinazioni, BDS → 4.
- Tariffe: `POST https://be.wizzair.com/<v>/Api/search/timetable` con `{"flightList":[{departureStation,arrivalStation,from,to},{ritorno}],"priceType":"regular","adultCount":1,"childCount":0,"infantCount":0}`.
  - L'intervallo `from`–`to` deve essere **al massimo ~30 giorni** (con 51 giorni risponde `InvalidTimeDateRange`) → 2 finestre per coprire 8 weekend.
  - Risposta: `outboundFlights[]` / `returnFlights[]` per giorno, con `price.amount` (0 = nessun prezzo / volo assente) e `departureDates[]` (orari locali di partenza).
  - **Manca l'orario di arrivo**: va stimato dalla distanza (coordinate della mappa). Il ritorno è marcato `arrivalEstimated`.
- Le richieste vanno fatte "normali", senza fingere intestazioni del sito.
- Link prenotazione: `https://wizzair.com/it-it/booking/select-flight/BRI/XXX/YYYY-MM-DD/YYYY-MM-DD/1/0/0/null`.

## Google Flights — funziona con Playwright (chromium headless)
- In UE compare `consent.google.com`: cliccare "Rifiuta tutto".
- Parametro `tfs`: protobuf base64url (schema come fast-flights): `Info{ repeated FlightData data=3; passengers=8 (1=adulto); seat=9 (1=economy); trip=19 (1=A/R) }`, `FlightData{ date=2; max_stops=5; from=13{airport=2}; to=14{airport=2} }`.
- **Esplora**: `https://www.google.com/travel/explore?tfs=<tfs con destinazione vuota>&hl=it&gl=IT&curr=EUR`. Le date nel `tfs` vengono **ignorate**: vanno impostate dall'interfaccia (campo "Viaggio di…" → tab "Date specifiche" → input `Partenza` / `Ritorno` → "Fine"). Dopo "Fine" arriva la risposta `GetExploreDestinations` (formato `)]}'` + righe `[["wrb.fr",…, "<json>"]]`).
  - Nel JSON interno, l'elenco destinazioni con prezzo è `d[4][0][]`: `e[0]` = kgmid città, `e[1][0][1]` = prezzo A/R €, `e[6]` = `[codiceCompagnia, nomeCompagnia, scali, durataMin, null, IATA destinazione, …]`.
  - Il blocco `d[3][0][]` mappa kgmid → nome città (`x[2]`) e paese (`x[4]`).
  - La mappa iniziale copre l'Europa: le destinazioni restituite sono quelle nella vista.
- **Dettaglio**: `https://www.google.com/travel/flights/search?tfs=<tfs BRI→XXX, XXX→BRI, max_stops=1>&hl=it&gl=IT&curr=EUR`.
  - Le andate sono elementi con `aria-label` che inizia con `A partire dal prezzo totale` (testo: prezzo A/R, compagnie, aeroporti, orari, giorno, scali con durata e aeroporto). L'`innerText` del `li` contiene i codici (es. `BRI–AMS`, `1 h 40 min LIN`, `+1` per arrivo il giorno dopo). Gli elementi compaiono duplicati: deduplicare per label.
  - Cliccando un'andata (con `element.click()` nel DOM: l'header intercetta il click di Playwright) compaiono i ritorni compatibili, con lo stesso formato e il **prezzo totale A/R** definitivo.
- Volume per giro: Esplora 2 aeroporti × 8 weekend × 2 giorni = 32 pagine, più il dettaglio delle destinazioni candidate.
