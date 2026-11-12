/**
 * @typedef {{airline:'ryanair'|'wizz', origin:string, dest:string, date:string,
 *   state:'prezzo'|'esaurito'|'da_verificare'|'nessun_volo', price:number|null}} Obs
 */

/** Rotte dirette di Ryanair da un aeroporto (esclude le voci con scalo). */
export function parseRyanairRoutes(json, origin) {
  return json
    .filter((r) => r.connectingAirport == null)
    .map((r) => ({
      airline: 'ryanair',
      origin,
      code: r.arrivalAirport.code,
      city: r.arrivalAirport.city.name,
      country: r.arrivalAirport.country.name,
    }));
}

/** Prezzi giornalieri Ryanair (outbound.fares) come osservazioni, dal giorno `today` in poi. */
export function parseRyanairDays(json, origin, dest, today) {
  return (json.outbound?.fares ?? [])
    .filter((f) => f.day >= today)
    .map((f) => {
      let state = 'prezzo';
      let price = f.price?.value ?? null;
      if (f.soldOut) { state = 'esaurito'; price = null; }
      else if (f.unavailable || f.price == null) { state = 'nessun_volo'; price = null; }
      return { airline: 'ryanair', origin, dest, date: f.day, state, price };
    });
}

/** Prezzi giornalieri Wizz (outboundFlights o returnFlights) come osservazioni, dal giorno `today` in poi. */
export function parseWizzDays(list, origin, dest, today) {
  return list
    .map((d) => ({ d, date: d.departureDate.slice(0, 10) }))
    .filter(({ date }) => date >= today)
    .map(({ d, date }) => {
      let state;
      let price = null;
      if (d.price?.amount > 0) { state = 'prezzo'; price = d.price.amount; }
      else if (d.departureDates?.length) { state = 'da_verificare'; price = d.originalPrice?.amount || null; }
      else state = 'nessun_volo';
      return { airline: 'wizz', origin, dest, date, state, price };
    });
}
