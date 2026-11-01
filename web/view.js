// Logica pura della webapp: nessun accesso al DOM, importabile anche dai test in Node.

const byPrice = (a, b) => a.price - b.price;
const DIRECT_SOURCES = ['ryanair', 'wizz'];
const STALE_MINUTES = { direct: 45, connections: 9 * 60 };

/** Unisce direct.json e connections.json; a parità di id vince il prezzo più basso. */
export function combine(direct, connections) {
  const byId = new Map();
  for (const it of [...(direct?.itineraries ?? []), ...(connections?.itineraries ?? [])]) {
    const prev = byId.get(it.id);
    if (!prev || it.price < prev.price) byId.set(it.id, it);
  }
  return [...byId.values()].sort(byPrice);
}

export function groupByWeekend(its) {
  const groups = new Map();
  for (const it of [...its].sort(byPrice)) {
    if (!groups.has(it.weekend)) groups.set(it.weekend, []);
    groups.get(it.weekend).push(it);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekend, items]) => ({ weekend, items }));
}

export const isDirect = (it) => it.outbound.segments.length === 1 && it.inbound.segments.length === 1;

export function applyFilters(its, { origin, directOnly, stopsOnly, maxPrice, airline, weekend } = {}) {
  return its.filter((it) => (!origin || it.origin === origin)
    && (!directOnly || isDirect(it))
    && (!stopsOnly || !isDirect(it))
    && (maxPrice == null || it.price <= maxPrice)
    && (!airline || it.outbound.segments[0].airline === airline)
    && (!weekend || it.weekend === weekend));
}

/** Una carta per destinazione: la più economica tra tutti i weekend e gli aeroporti. */
export function bestPerDestination(its) {
  const best = new Map();
  for (const it of [...its].sort(byPrice)) if (!best.has(it.destination.code)) best.set(it.destination.code, it);
  return [...best.values()];
}

const localMs = (s) => Date.parse(`${s}:00Z`);

/** Ore a destinazione: dall'arrivo dell'andata alla partenza del ritorno (stesso fuso). */
export function stayHours(it) {
  const ms = localMs(it.inbound.segments[0].dep) - localMs(it.outbound.segments.at(-1).arr);
  return Math.round(ms / 360000) / 10;
}

/** "partenza → arrivo", con ~ se l'arrivo è stimato e +1 se è il giorno dopo. */
export function legTimes(leg) {
  const dep = leg.segments[0].dep;
  const arr = leg.segments.at(-1).arr;
  const nextDay = arr.slice(0, 10) > dep.slice(0, 10) ? ' +1' : '';
  return `${dep.slice(11)} → ${leg.arrivalEstimated ? '~' : ''}${arr.slice(11)}${nextDay}`;
}

export const airlinesOf = (its) => [...new Set(its.map((it) => it.outbound.segments[0].airline))].sort((a, b) => a.localeCompare(b));

export function freshness(name, status, now) {
  if (!status) return { label: 'nessun dato', stale: true };
  if (!status.lastSuccessAt) return { label: 'mai aggiornato', stale: true };
  const minutes = Math.max(0, Math.round((now - Date.parse(status.lastSuccessAt)) / 60000));
  const label = minutes < 60 ? `aggiornato ${minutes} min fa` : minutes < 48 * 60
    ? `aggiornato ${Math.floor(minutes / 60)} h fa` : `aggiornato ${Math.floor(minutes / 1440)} giorni fa`;
  const limit = DIRECT_SOURCES.includes(name) ? STALE_MINUTES.direct : STALE_MINUTES.connections;
  return { label, stale: status.status === 'error' || minutes > limit };
}
