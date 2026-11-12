import { gzipSync, gunzipSync } from 'node:zlib';

/** @typedef {import('./observe.js').Obs} Obs */
/** Intervallo di date (incluso) coperto da una richiesta riuscita per una tratta e direzione.
 * @typedef {{airline:string, origin:string, dest:string, from:string, to:string}} Coverage */

const HEADER = 'compagnia,origine,destinazione,data_partenza,stato,prezzo';

/** Chiave univoca di un'osservazione. */
export function obsKey(o) {
  return `${o.airline}|${o.origin}|${o.dest}|${o.date}`;
}

/** Righe → CSV compresso con gzip. I campi non contengono virgole: niente escaping. */
export function encodeCsv(rows) {
  const lines = rows.map((r) => [r.airline, r.origin, r.dest, r.date, r.state, r.price ?? ''].join(','));
  return gzipSync([HEADER, ...lines].join('\n') + '\n');
}

/** CSV compresso → righe (stesso ordine di chiavi di Obs). */
export function decodeCsv(buf) {
  return gunzipSync(buf).toString().split('\n').slice(1).filter((l) => l !== '').map((l) => {
    const [airline, origin, dest, date, state, price] = l.split(',');
    return { airline, origin, dest, date, state, price: price === '' ? null : Number(price) };
  });
}

/** Ricostruisce lo stato corrente: l'ultima riga per chiave vince. */
export function replayState(rowsInOrder) {
  const state = new Map();
  for (const r of rowsInOrder) state.set(obsKey(r), r);
  return state;
}

/** Righe da scrivere oggi (nuove, cambiate, sparite in un intervallo coperto), ordinate per chiave. */
export function diffState(state, observations, coverage, today) {
  const out = [];
  const seen = new Set();
  for (const o of observations) {
    const k = obsKey(o);
    seen.add(k);
    const prev = state.get(k);
    if (!prev || prev.state !== o.state || prev.price !== o.price) out.push(o);
  }
  for (const [k, prev] of state) {
    if (prev.date < today || prev.state === 'nessun_volo' || seen.has(k)) continue;
    const covered = coverage.some((c) => c.airline === prev.airline && c.origin === prev.origin
      && c.dest === prev.dest && c.from <= prev.date && prev.date <= c.to);
    if (covered) out.push({ ...prev, state: 'nessun_volo', price: null });
  }
  return out.sort((a, b) => (obsKey(a) < obsKey(b) ? -1 : obsKey(a) > obsKey(b) ? 1 : 0));
}
