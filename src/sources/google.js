import { DateTime } from 'luxon';
import { CONSTRAINTS, isValid } from '../filter.js';
import { itineraryId } from '../model.js';
import { jitter } from '../util.js';
import { todayRome } from '../weekends.js';

// --- Parametro `tfs` (protobuf in base64url, stesso schema di fast-flights) ---
const varint = (n) => { const b = []; while (n > 127) { b.push((n & 127) | 128); n >>>= 7; } b.push(n); return b; };
const field = (no, wire, payload) => [...varint((no << 3) | wire), ...payload];
const bytes = (no, b) => field(no, 2, [...varint(b.length), ...b]);
const str = (no, s) => bytes(no, [...Buffer.from(s, 'utf8')]);
const int = (no, n) => field(no, 0, varint(n));

export function encodeTfs(legs, maxStops = CONSTRAINTS.maxStopsPerLeg) {
  const out = [];
  for (const { date, from, to } of legs) {
    out.push(...bytes(3, [...str(2, date), ...int(5, maxStops), ...bytes(13, str(2, from)), ...bytes(14, str(2, to))]));
  }
  out.push(...int(8, 1), ...int(9, 1), ...int(19, legs.length === 2 ? 1 : 2));
  return Buffer.from(out).toString('base64url');
}

/**
 * `tfs` della vista Esplora con date specifiche e destinazione libera, come lo genera Google
 * (campi 1=28 e 2=3 per la modalità Esplora, aeroporto con tipo 1, prezzo massimo -1 = nessun limite).
 */
export function encodeExploreTfs(origin, depDate, retDate) {
  const airport = (code) => [...int(1, 1), ...str(2, code)];
  const out = [...int(1, 28), ...int(2, 3)];
  out.push(...bytes(3, [...str(2, depDate), ...int(5, CONSTRAINTS.maxStopsPerLeg), ...bytes(13, airport(origin))]));
  out.push(...bytes(3, [...str(2, retDate), ...int(5, CONSTRAINTS.maxStopsPerLeg), ...bytes(14, airport(origin))]));
  const minusOne = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01];
  out.push(...int(8, 1), ...int(9, 1), ...int(14, 1), ...bytes(16, field(1, 0, minusOne)), ...int(19, 1));
  return Buffer.from(out).toString('base64url');
}

// --- Esplora ---

/** Righe `[["wrb.fr", …, "<json>"]]` della risposta batchexecute → JSON interni. */
function payloads(raw) {
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('[[')) continue;
    for (const e of JSON.parse(line)) if (e[0] === 'wrb.fr' && e[2]) out.push(JSON.parse(e[2]));
  }
  return out;
}

export function parseExplore(raw) {
  const names = new Map();
  const best = new Map();
  for (const d of payloads(raw)) {
    for (const c of d[3]?.[0] ?? []) if (typeof c?.[0] === 'string') names.set(c[0], { city: c[2], country: c[4] });
    for (const e of d[4]?.[0] ?? []) {
      const info = e?.[6];
      const price = e?.[1]?.[0]?.[1];
      if (!info?.[5] || typeof price !== 'number') continue;
      const prev = best.get(info[5]);
      if (prev && prev.price <= price) continue;
      best.set(info[5], { code: info[5], kgmid: e[0], price, stops: info[2], airline: info[0] });
    }
  }
  return [...best.values()].map((x) => ({ ...x, ...(names.get(x.kgmid) ?? { city: x.code, country: '' }) }));
}

const DIRECT_SOURCES = ['FR', 'W6', 'W4', 'W9'];

/** Destinazioni da approfondire: entro il budget, non già coperte da Ryanair/Wizz diretti. */
export function exploreCandidates(destinations, limit = 8) {
  return destinations
    .filter((d) => d.price <= CONSTRAINTS.maxPrice && !(d.stops === 0 && DIRECT_SOURCES.includes(d.airline)))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

// --- Pagina risultati ---

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

function toIso(weekend, monthName, day, time) {
  const w = DateTime.fromISO(weekend);
  const month = MONTHS.indexOf(monthName.toLowerCase()) + 1;
  const year = month < w.month ? w.year + 1 : w.year;
  return DateTime.fromObject({ year, month, day: Number(day) }).toISODate() + 'T' + time.padStart(5, '0');
}

const durationMin = (s) => {
  const h = s.match(/(\d+) h/);
  const m = s.match(/(\d+) min/);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
};

/** Voli dalla pagina risultati (`aria-label` + testo), deduplicati per label. */
export function parseLegs(items, weekend) {
  const seen = new Set();
  const legs = [];
  for (const { label, text } of items) {
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const price = label.match(/andata e ritorno di ([\d.]+) euro/);
    const times = label.match(/alle ore (\d{1,2}:\d{2}) il giorno [^,]+, (\p{L}+) (\d{1,2}) e arrivo a .*? alle ore (\d{1,2}:\d{2}) il giorno [^,]+, (\p{L}+) (\d{1,2})/u);
    const route = text.match(/([A-Z]{3})–([A-Z]{3})/);
    if (!price || !times || !route) continue;
    const layovers = [...label.matchAll(/Scalo \(\d+ di \d+\) di ([^p]+?) presso/g)].map((m) => durationMin(m[1]));
    const hubs = (text.match(/scal[oi] (?:\d+ h )?(?:\d+ min )?([A-Z]{3}(?:, [A-Z]{3})*)/)?.[1] ?? '').split(', ').filter(Boolean);
    const airline = label.split('. Partenza')[0].split(' con ').at(-1);
    const dep = toIso(weekend, times[2], times[3], times[1]);
    const arr = toIso(weekend, times[5], times[6], times[4]);
    const stops = [route[1], ...hubs.slice(0, layovers.length), route[2]];
    while (stops.length < layovers.length + 2) stops.splice(-1, 0, '???');
    const segments = stops.slice(0, -1).map((from, i) => ({
      from, to: stops[i + 1],
      dep: i === 0 ? dep : null, arr: i === stops.length - 2 ? arr : null,
      flight: `${airline}@${i === 0 ? dep : from}`, airline,
    }));
    legs.push({
      label, price: Number(price[1].replace(/\./g, '')), airline,
      leg: { segments, selfTransfer: /autonom|self.?transfer|biglietti separati/i.test(label), layovers },
    });
  }
  return legs;
}

export function buildGoogleItinerary({ origin, destination, out, back, weekend, seenAt, bookingUrl }) {
  return {
    id: itineraryId(origin, out.leg, back.leg), source: 'google', origin, destination,
    outbound: out.leg, inbound: back.leg, price: back.price, currency: 'EUR', bookingUrl, weekend, seenAt,
  };
}

// --- Browser ---

const LEG_SELECTOR = '[aria-label^="A partire dal prezzo totale"]';
const BASE = 'hl=it&gl=IT&curr=EUR';

async function open(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const reject = page.getByRole('button', { name: /Rifiuta tutto|Reject all/i });
  if (await reject.count()) await reject.first().click();
  if (/\/sorry\/|captcha/i.test(page.url()) || (await page.getByText(/traffico insolito|unusual traffic/i).count())) {
    throw new Error('google-blocked');
  }
}

async function exploreDestinations(page, origin, depDate, retDate) {
  // La risposta viene intercettata e letta prima di consegnarla alla pagina:
  // leggerla dall'evento `response` a volte fallisce (corpo non conservato dal browser)
  const bodies = [];
  const PATTERN = '**/*GetExploreDestinations*';
  const handler = async (route) => {
    // Gli errori qui non risalgono a nessun chiamante: senza try/catch farebbero terminare Node
    try {
      const response = await route.fetch();
      const body = await response.text();
      bodies.push(body);
      await route.fulfill({ response, body });
    } catch {
      await route.continue().catch(() => {});
    }
  };
  await page.route(PATTERN, handler);
  try {
    await open(page, `https://www.google.com/travel/explore?tfs=${encodeExploreTfs(origin, depDate, retDate)}&tfu=GgA&${BASE}`);
    for (let waited = 0; waited < 20000; waited += 500) {
      const hit = bodies.find((b) => b.includes(depDate) && b.includes(retDate));
      if (hit) return parseExplore(hit);
      await page.waitForTimeout(500);
    }
    throw new Error(`google-explore-timeout ${origin} ${depDate} (${bodies.length} risposte)`);
  } finally {
    await page.unroute(PATTERN, handler);
  }
}

/** Apre una pagina risultati; se Google risponde "Si è verificato un problema" riprova una volta. */
async function openResults(page, url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await open(page, url);
    const results = page.locator(LEG_SELECTOR).first();
    const problem = page.getByText('Si è verificato un problema');
    await results.or(problem).first().waitFor({ timeout: 20000 });
    if (await results.isVisible()) return;
    await page.waitForTimeout(5000);
  }
  throw new Error('google-results-error');
}

const grab = (page) => page.locator(LEG_SELECTOR).evaluateAll((els) =>
  els.map((e) => ({ label: e.getAttribute('aria-label'), text: (e.closest('li') || e).innerText.replace(/\s+/g, ' ') })));

/** Fasce di ritorno della domenica: mattina, pomeriggio, sera (come per Ryanair). */
const RETURN_BAND_STARTS = ['00:00', '12:00', '18:00'];
const returnBand = (it) => RETURN_BAND_STARTS.findLastIndex((t) => it.inbound.segments[0].dep.slice(11) >= t);

/** Il più economico per fascia di ritorno: così il filtro sulle ore di permanenza ha anche i soggiorni lunghi. */
export function cheapestPerReturnBand(its) {
  const best = new Map();
  for (const it of its) {
    const band = returnBand(it);
    if (!best.has(band) || it.price < best.get(band).price) best.set(band, it);
  }
  return [...best.keys()].sort().map((b) => best.get(b));
}

/** Combinazioni valide per una destinazione (la più economica per fascia di ritorno), provando le 2 andate migliori. */
async function bestItineraries(page, { origin, dest, depDate, w, seenAt, now, pauseMs }) {
  const tfs = encodeTfs([{ date: depDate, from: origin, to: dest.code }, { date: w.sunday, from: dest.code, to: origin }]);
  const url = `https://www.google.com/travel/flights/search?tfs=${tfs}&${BASE}`;
  await openResults(page, url);
  const outs = parseLegs(await grab(page), w.friday)
    .filter((o) => o.price <= CONSTRAINTS.maxPrice)
    .sort((a, b) => a.price - b.price);
  const goodOuts = outs.filter((o) => !o.leg.selfTransfer
    && o.leg.layovers.every((m) => m <= CONSTRAINTS.maxLayoverMinutes)
    && outboundOk(o, now)).slice(0, 2);
  const valid = [];
  for (const o of goodOuts) {
    // Ricarica la lista delle andate e clicca quella scelta (l'header intercetta i click di Playwright)
    await openResults(page, url);
    const idx = (await grab(page)).findIndex((x) => x.label === o.label);
    if (idx < 0) continue;
    await page.locator(LEG_SELECTOR).nth(idx).evaluate((e) => e.click());
    await page.waitForTimeout(4000);
    for (const back of parseLegs(await grab(page), w.friday)) {
      const it = buildGoogleItinerary({ origin, destination: dest, out: o, back, weekend: w.friday, seenAt, bookingUrl: url });
      if (isValid(it, now)) valid.push(it);
    }
    if (pauseMs) await jitter(pauseMs / 2, pauseMs);
  }
  return cheapestPerReturnBand(valid);
}

function outboundOk(o, now) {
  const dep = DateTime.fromISO(o.leg.segments[0].dep, { zone: 'Europe/Rome' });
  if (dep <= now) return false;
  return dep.weekday === 6 || (dep.weekday === 5 && dep.toFormat('HH:mm') >= CONSTRAINTS.fridayMinDeparture);
}

/** Giorni di andata da esplorare (venerdì e sabato di ogni weekend), senza quelli già passati. */
export function googleQueryDays(weekends, today) {
  return weekends.flatMap((w) => [w.friday, w.saturday].filter((d) => d >= today).map((depDate) => ({ w, depDate })));
}

export async function fetchGoogle(weekends, { pauseMs = 4000, perExplore = 5, log = console.log } = {}) {
  const { chromium } = await import('playwright');
  const seenAt = new Date().toISOString();
  const now = DateTime.now();
  const browser = await chromium.launch();
  const all = [];
  try {
    const page = await browser.newPage({ locale: 'it-IT', viewport: { width: 1280, height: 800 } });
    for (const origin of CONSTRAINTS.origins) {
      for (const { w, depDate } of googleQueryDays(weekends, todayRome(now))) {
        // Un'Esplora fallita salta solo quella data; un blocco di Google ferma tutto
        let cands;
        try {
          cands = exploreCandidates(await exploreDestinations(page, origin, depDate, w.sunday), perExplore);
        } catch (err) {
          if (err.message === 'google-blocked') throw err;
          log(`google ${origin} ${depDate}: Esplora non riuscita (${err.message.split('\n')[0]})`);
          continue;
        }
        log(`google ${origin} ${depDate}: ${cands.length} candidati`);
        for (const c of cands) {
          const dest = { code: c.code, city: c.city, country: c.country };
          try {
            all.push(...await bestItineraries(page, { origin, dest, depDate, w, seenAt, now, pauseMs }));
          } catch (err) {
            if (err.message === 'google-blocked') throw err;
            log(`google ${origin}→${c.code} ${depDate}: ${err.message.split('\n')[0]}`);
            if (process.env.GOOGLE_DEBUG) await page.screenshot({ path: `spike/fail-${origin}-${c.code}.png` });
          }
          if (pauseMs) await jitter(pauseMs / 2, pauseMs);
        }
      }
    }
  } finally {
    await browser.close();
  }
  return all;
}
