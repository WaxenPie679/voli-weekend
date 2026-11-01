import { CONSTRAINTS } from '../filter.js';
import { itineraryId } from '../model.js';
import { fetchJson, jitter } from '../util.js';
import { todayRome } from '../weekends.js';

const API = 'https://www.ryanair.com/api/farfnd/v4/roundTripFares';

// Il fare finder restituisce solo la combinazione più economica per destinazione: dividendo il ritorno
// della domenica in fasce si ottengono anche i soggiorni più lunghi, per il filtro sulle ore di permanenza.
const RETURN_BANDS = [['00:00', '11:59'], ['12:00', '17:59'], ['18:00', '23:59']];

/** Una query per aeroporto × weekend × giorno di andata × fascia di ritorno, saltando i giorni già passati. */
export function buildRyanairQueries(weekends, today = '') {
  const queries = [];
  for (const origin of CONSTRAINTS.origins) {
    for (const w of weekends) {
      for (const [day, from] of [[w.friday, CONSTRAINTS.fridayMinDeparture], [w.saturday, '00:00']]) {
        if (day < today) continue;
        for (const [retFrom, retTo] of RETURN_BANDS) {
          const p = new URLSearchParams({
            departureAirportIataCode: origin,
            outboundDepartureDateFrom: day, outboundDepartureDateTo: day,
            outboundDepartureTimeFrom: from, outboundDepartureTimeTo: '23:59',
            inboundDepartureDateFrom: w.sunday, inboundDepartureDateTo: w.sunday,
            inboundDepartureTimeFrom: retFrom, inboundDepartureTimeTo: retTo,
            priceValueTo: String(CONSTRAINTS.maxPrice), currency: 'EUR', adultPaxCount: '1', market: 'it-it',
          });
          queries.push({ url: `${API}?${p}`, origin, weekend: w.friday });
        }
      }
    }
  }
  return queries;
}

const segment = (f) => ({
  from: f.departureAirport.iataCode, to: f.arrivalAirport.iataCode,
  dep: f.departureDate.slice(0, 16), arr: f.arrivalDate.slice(0, 16),
  flight: f.flightNumber, airline: 'Ryanair',
});

export function parseRyanair(json, origin, weekend, seenAt) {
  return (json.fares ?? []).map((f) => {
    const outbound = { segments: [segment(f.outbound)], selfTransfer: false };
    const inbound = { segments: [segment(f.inbound)], selfTransfer: false };
    const a = f.outbound.arrivalAirport;
    const dest = a.iataCode;
    const bookingUrl = 'https://www.ryanair.com/it/it/trip/flights/select?' + new URLSearchParams({
      adults: '1', dateOut: outbound.segments[0].dep.slice(0, 10), dateIn: inbound.segments[0].dep.slice(0, 10),
      originIata: origin, destinationIata: dest, isReturn: 'true',
    });
    return {
      id: itineraryId(origin, outbound, inbound), source: 'ryanair', origin,
      destination: { code: dest, city: a.city?.name ?? a.name, country: a.countryName },
      outbound, inbound, price: f.summary.price.value, currency: 'EUR', bookingUrl, weekend, seenAt,
    };
  });
}

export async function fetchRyanair(weekends, { fetchImpl = fetch, pauseMs = 500 } = {}) {
  const seenAt = new Date().toISOString();
  const all = [];
  for (const q of buildRyanairQueries(weekends, todayRome())) {
    const json = await fetchJson(fetchImpl, q.url, { headers: { Accept: 'application/json' } });
    all.push(...parseRyanair(json, q.origin, q.weekend, seenAt));
    if (pauseMs) await jitter(pauseMs * 0.4, pauseMs);
  }
  return all;
}
