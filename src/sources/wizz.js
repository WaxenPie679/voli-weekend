import { DateTime } from 'luxon';
import { CONSTRAINTS } from '../filter.js';
import { itineraryId } from '../model.js';
import { fetchJson, jitter } from '../util.js';

// Fusi orari dei paesi serviti fuori dall'ora dell'Europa centrale (default: Europe/Rome).
const COUNTRY_ZONE = {
  RO: 'Europe/Bucharest', BG: 'Europe/Sofia', MD: 'Europe/Chisinau', GR: 'Europe/Athens', CY: 'Asia/Nicosia',
  UA: 'Europe/Kyiv', LT: 'Europe/Vilnius', LV: 'Europe/Riga', EE: 'Europe/Tallinn', FI: 'Europe/Helsinki',
  GB: 'Europe/London', IE: 'Europe/Dublin', PT: 'Europe/Lisbon', IS: 'Atlantic/Reykjavik', MA: 'Africa/Casablanca',
  TR: 'Europe/Istanbul', IL: 'Asia/Jerusalem', EG: 'Africa/Cairo', AM: 'Asia/Yerevan', GE: 'Asia/Tbilisi',
  AZ: 'Asia/Baku', AE: 'Asia/Dubai', SA: 'Asia/Riyadh', KZ: 'Asia/Almaty', UZ: 'Asia/Tashkent', JO: 'Asia/Amman',
};
const zoneOf = (countryCode) => COUNTRY_ZONE[countryCode] ?? 'Europe/Rome';

export function parseWizzVersion(html) {
  const m = html.match(/be\.wizzair\.com\/(\d+\.\d+\.\d+)/);
  if (!m) throw new Error('versione API Wizz non trovata');
  return m[1];
}

function km(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Durata stimata del volo: velocità media 750 km/h + 30 minuti di rullaggio e salita. */
export const estimateMinutes = (distanceKm) => Math.round((distanceKm / 750) * 60 + 30);

export function parseWizzRoutes(mapJson, origins) {
  const byIata = new Map(mapJson.cities.map((c) => [c.iata, c]));
  const routes = [];
  for (const origin of origins) {
    const o = byIata.get(origin);
    for (const conn of o?.connections ?? []) {
      const d = byIata.get(conn.iata);
      if (!d || routes.some((r) => r.origin === origin && r.code === d.iata)) continue;
      routes.push({
        origin, code: d.iata, city: d.shortName.trim(), country: d.countryName,
        km: km(o, d), originZone: zoneOf(o.countryCode), destZone: zoneOf(d.countryCode),
      });
    }
  }
  return routes;
}

/**
 * Finestre di massimo 30 giorni (limite dell'API). Gruppi di 4 weekend (24 giorni),
 * così nessun weekend resta a cavallo di due finestre.
 */
export function timetableWindows(weekends) {
  const out = [];
  for (let i = 0; i < weekends.length; i += 4) {
    const group = weekends.slice(i, i + 4);
    out.push({ from: group[0].friday, to: group.at(-1).sunday });
  }
  return out;
}

const arrival = (dep, fromZone, toZone, minutes) =>
  DateTime.fromISO(dep, { zone: fromZone }).plus({ minutes }).setZone(toZone).toFormat("yyyy-MM-dd'T'HH:mm");

function flights(list) {
  const out = [];
  for (const f of list ?? []) {
    if (!(f.price?.amount > 0)) continue;
    for (const d of f.departureDates) out.push({ dep: d.slice(0, 16), price: f.price.amount });
  }
  return out;
}

export function pairWizzFares(ttJson, route, weekends, seenAt) {
  const minutes = estimateMinutes(route.km);
  const outs = flights(ttJson.outboundFlights);
  const rets = flights(ttJson.returnFlights);
  const its = [];
  for (const w of weekends) {
    const goes = outs.filter((f) => f.dep.startsWith(w.friday) || f.dep.startsWith(w.saturday));
    const backs = rets.filter((f) => f.dep.startsWith(w.sunday));
    for (const g of goes) {
      for (const b of backs) {
        const seg = (from, to, dep, fromZone, toZone) => ({
          from, to, dep, arr: arrival(dep, fromZone, toZone, minutes),
          flight: `W6 ${from}${to} ${dep.slice(11)}`, airline: 'Wizz Air',
        });
        const outbound = { segments: [seg(route.origin, route.code, g.dep, route.originZone, route.destZone)], selfTransfer: false, arrivalEstimated: true };
        const inbound = { segments: [seg(route.code, route.origin, b.dep, route.destZone, route.originZone)], selfTransfer: false, arrivalEstimated: true };
        its.push({
          id: itineraryId(route.origin, outbound, inbound), source: 'wizz', origin: route.origin,
          destination: { code: route.code, city: route.city, country: route.country },
          outbound, inbound, price: Math.round((g.price + b.price) * 100) / 100, currency: 'EUR',
          bookingUrl: `https://wizzair.com/it-it/booking/select-flight/${route.origin}/${route.code}/${g.dep.slice(0, 10)}/${b.dep.slice(0, 10)}/1/0/0/null`,
          weekend: w.friday, seenAt,
        });
      }
    }
  }
  return its;
}

export async function fetchWizz(weekends, { fetchImpl = fetch, pauseMs = 1500 } = {}) {
  const seenAt = new Date().toISOString();
  const homeRes = await fetchImpl('https://wizzair.com/');
  if (!homeRes.ok) throw new Error(`HTTP ${homeRes.status} wizzair.com`);
  const base = `https://be.wizzair.com/${parseWizzVersion(await homeRes.text())}/Api`;
  const routes = parseWizzRoutes(await fetchJson(fetchImpl, `${base}/asset/map?languageCode=it-it`), CONSTRAINTS.origins);
  const all = [];
  for (const route of routes) {
    for (const win of timetableWindows(weekends)) {
      const body = {
        flightList: [
          { departureStation: route.origin, arrivalStation: route.code, from: win.from, to: win.to },
          { departureStation: route.code, arrivalStation: route.origin, from: win.from, to: win.to },
        ],
        priceType: 'regular', adultCount: 1, childCount: 0, infantCount: 0,
      };
      const tt = await fetchJson(fetchImpl, `${base}/search/timetable`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      all.push(...pairWizzFares(tt, route, weekends, seenAt));
      if (pauseMs) await jitter(pauseMs / 3, pauseMs);
    }
  }
  return all;
}
