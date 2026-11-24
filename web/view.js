// Logica pura della webapp: nessun accesso al DOM, importabile anche dai test in Node.

const byPrice = (a, b) => a.price - b.price;
const STALE_MINUTES = 45;

/** Itinerari di direct.json senza doppioni; a parità di id vince il prezzo più basso. */
export function combine(direct) {
  const byId = new Map();
  for (const it of direct?.itineraries ?? []) {
    const prev = byId.get(it.id);
    if (!prev || it.price < prev.price) byId.set(it.id, it);
  }
  return [...byId.values()].sort(byPrice);
}

const AIRLINE_NAMES = { ryanair: 'Ryanair', wizz: 'Wizz Air' };

/** Gamba dello storico → segmento. Ryanair «HH:MM-HH:MM» (partenza-arrivo); Wizz «HH:MM HH:MM» (partenze del giorno, arrivo ignoto). */
function premiumSegment(leg, from, to) {
  const t = leg.time ?? '';
  const ry = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(t);
  const deps = t.match(/\d{2}:\d{2}/g) ?? [];
  const dep = `${leg.date}T${ry ? ry[1] : deps[0] ?? '00:00'}`;
  const arr = ry ? `${leg.date}T${ry[2]}` : dep;
  return { segment: { from, to, dep, arr, airline: AIRLINE_NAMES[leg.airline] ?? leg.airline }, known: Boolean(ry), times: deps.join(' · ') };
}

/** Voce del file Premium (src/history/premium.js) → itinerario mostrabile come gli altri. */
export function fromPremium(e) {
  const out = premiumSegment(e.out, e.origin, e.destination.code);
  const back = premiumSegment(e.back, e.destination.code, e.origin);
  return {
    id: e.id, source: 'storico', kind: e.kind, origin: e.origin, destination: e.destination, weekend: e.weekend, price: e.price,
    outbound: { segments: [out.segment], times: out.known ? null : out.times },
    inbound: { segments: [back.segment], times: back.known ? null : back.times },
    arrivalUnknown: !out.known || !back.known,
    seenOn: e.out.seenOn < e.back.seenOn ? e.out.seenOn : e.back.seenOn,
    bookingUrl: e.out.bookingUrl, returnUrl: e.back.bookingUrl,
  };
}

export function groupByWeekend(its) {
  const groups = new Map();
  for (const it of [...its].sort(byPrice)) {
    if (!groups.has(it.weekend)) groups.set(it.weekend, []);
    groups.get(it.weekend).push(it);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekend, items]) => ({ weekend, items }));
}

export function applyFilters(its, { tipo, origin, maxPrice, airline, weekend, minStay } = {}) {
  return its.filter((it) => (tipo === 'lungo' ? it.kind === 'lungo' : it.kind !== 'lungo')
    && (!origin || it.origin === origin)
    && (maxPrice == null || it.price <= maxPrice)
    && (!airline || it.outbound.segments[0].airline === airline)
    && (!weekend || it.weekend === weekend)
    && (!minStay || (!it.arrivalUnknown && stayHours(it) >= minStay)));
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

/** Ora corrente a Roma come "YYYY-MM-DDTHH:mm", confrontabile con gli orari locali dei voli. */
export function romeNow(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** In pagina si nascondono i voli già partiti (i dati si aggiornano ogni 15 minuti). */
export const notDeparted = (its, nowLocal) => its.filter((it) => it.outbound.segments[0].dep > nowLocal);

const AXIS_HOURS = 72; // venerdì 00:00 → lunedì 00:00

/** Dove cade il soggiorno nel weekend: inizio e durata come frazioni dell'asse ven–lun. */
export function stayWindow(it) {
  const axis0 = localMs(`${it.weekend}T00:00`);
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const start = clamp((localMs(it.outbound.segments.at(-1).arr) - axis0) / 36e5 / AXIS_HOURS);
  const end = clamp((localMs(it.inbound.segments[0].dep) - axis0) / 36e5 / AXIS_HOURS);
  return { start, width: Math.max(0, end - start) };
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
  return { label, stale: status.status === 'error' || minutes > STALE_MINUTES };
}
