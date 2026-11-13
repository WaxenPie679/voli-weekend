// Logica pura della pagina «Storico prezzi»: nessun accesso al DOM, importabile da browser e da Node.

export const RELIABILITY_LABEL = { prima: 'prima stima', crescita: 'in crescita', affidabile: 'affidabile' };

const HOME = { BRI: 'Bari', BDS: 'Brindisi' };
const DAY_MS = 86400000;

const dayFmt = new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Giorno di calendario AAAA-MM-GG → ms UTC (niente spostamenti di fuso). */
const dayMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const num = (n) => String(Math.round(n * 100) / 100);

/** L'indice è usabile solo con almeno un giorno raccolto e una tratta: altrimenti lo storico «non è pronto». */
export function isReadyIndex(index) {
  return Boolean(index && typeof index.firstDay === 'string' && Array.isArray(index.routes) && index.routes.length);
}

export function statusLine(index) {
  const from = dayFmt.format(new Date(dayMs(index.firstDay))).replace('.', '');
  const n = index.daysCollected;
  const time = timeFmt.format(new Date(index.generatedAt));
  return `Storico dal ${from} · ${n} ${n === 1 ? 'giorno' : 'giorni'} · ${RELIABILITY_LABEL[index.reliability]} · aggiornato alle ${time}`;
}

export function riseText(rise, reliability) {
  if (reliability === 'prima') return 'Ancora pochi dati per dire quando sale: servono circa 4 settimane.';
  if (rise == null) return 'Nessuna salita chiara finora.';
  return `Di solito il prezzo inizia a salire circa ${rise} ${rise === 1 ? 'settimana' : 'settimane'} prima della partenza.`;
}

export function scale(d0, d1, r0, r1) {
  if (d0 === d1) return () => (r0 + r1) / 2; // un solo valore (es. un giorno di storico): al centro
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

export function priceDomain(series) {
  if (!series.length) return [0, 20];
  let lo = Math.max(0, Math.floor(Math.min(...series) / 10) * 10);
  let hi = Math.ceil(Math.max(...series) / 10) * 10;
  if (hi - lo < 20) {
    const pad = Math.ceil((20 - (hi - lo)) / 20) * 10;
    lo = Math.max(0, lo - pad);
    hi = Math.max(hi + pad, lo + 20);
  }
  return [lo, hi];
}

/** Righe curva [settimana, mediana, p25, p75, n] → linea sulle mediane e fascia chiusa p25–p75. */
export function curvePaths(curve, sx, sy) {
  if (!curve.length) return { line: '', band: '' };
  const pt = (x, y) => `${num(sx(x))},${num(sy(y))}`;
  const line = curve.map((r, i) => `${i ? 'L' : 'M'}${pt(r[0], r[1])}`).join('');
  const top = curve.map((r, i) => `${i ? 'L' : 'M'}${pt(r[0], r[3])}`).join('');
  const bottom = [...curve].reverse().map((r) => `L${pt(r[0], r[2])}`).join('');
  return { line, band: `${top}${bottom}Z` };
}

/** Cambi [giorno, stato, prezzo] → serie a gradini giorno per giorno fino a lastDay; stato ≠ prezzo → null. */
export function stepPoints(changes, lastDay) {
  if (!changes.length) return [];
  const sorted = [...changes].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const out = [];
  let i = 0;
  let cur = null;
  for (let t = dayMs(sorted[0][0]); t <= dayMs(lastDay); t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    while (i < sorted.length && sorted[i][0] <= day) {
      cur = sorted[i][1] === 'prezzo' ? sorted[i][2] ?? null : null;
      i++;
    }
    out.push([day, cur]);
  }
  return out;
}

/** Date di partenza ≥ lastDay con almeno un prezzo, crescenti. */
export function upcomingDepartures(flights, lastDay) {
  return flights
    .filter(([date, changes]) => date >= lastDay && changes.some((c) => c[1] === 'prezzo' && c[2] != null))
    .map(([date]) => date)
    .sort();
}

export function routeLabel(route) {
  const name = (c) => HOME[c] ?? c;
  return HOME[route.from] ? `${name(route.from)} → ${route.city}` : `${route.city} → ${name(route.to)}`;
}

const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const AIRLINE_ORDER = ['ryanair', 'wizz'];

/** Settimana N (0..52) dall'ultimo giorno raccolto: partenze da lastDay+7N a lastDay+7N+6. */
export function weekRange(lastDay, w) {
  const start = dayMs(lastDay) + 7 * w * DAY_MS;
  return [isoDay(start), isoDay(start + 6 * DAY_MS)];
}

/**
 * Voli che partono nella settimana N con il prezzo attuale (ultimo cambio).
 * Partenze con stato attuale esaurito/da_verificare: non in elenco, solo contate in `unavailable`.
 */
export function weekFlights(file, lastDay, w) {
  const [from, to] = weekRange(lastDay, w);
  const rows = [];
  let unavailable = 0;
  for (const [airline, data] of Object.entries(file?.airlines ?? {})) {
    for (const [date, changes, time] of data?.flights ?? []) {
      if (date < from || date > to || !changes?.length) continue;
      const last = changes[changes.length - 1];
      if (last[1] === 'prezzo' && last[2] != null) rows.push({ date, airline, time: time ?? '', price: last[2] });
      else if (last[1] === 'esaurito' || last[1] === 'da_verificare') unavailable++;
    }
  }
  const rank = (a) => (AIRLINE_ORDER.includes(a) ? AIRLINE_ORDER.indexOf(a) : AIRLINE_ORDER.length);
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank(a.airline) - rank(b.airline) || a.airline.localeCompare(b.airline)));
  return { rows, unavailable };
}

/** Orario salvato → testo: Ryanair «10:05-11:55» → «10:05 → 11:55»; Wizz «15:20 21:40» → «15:20 · 21:40». */
export function timeText(time) {
  if (!time) return '';
  if (time.includes('-')) return time.split('-').join(' → ');
  return time.split(' ').filter(Boolean).join(' · ');
}

/** Pagina di ricerca della compagnia con tratta e data già compilate (sola andata, 1 adulto). */
export function searchUrl(airline, from, to, date) {
  if (airline === 'wizz') return `https://wizzair.com/it-it/booking/select-flight/${from}/${to}/${date}/null/1/0/0/null`;
  return `https://www.ryanair.com/it/it/trip/flights/select?adults=1&teens=0&children=0&infants=0&dateOut=${date}&isReturn=false&originIata=${from}&destinationIata=${to}`;
}
