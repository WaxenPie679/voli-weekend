import { HISTORY_BASE_URL } from './config.js';
import { isReadyIndex, statusLine, riseText, scale, priceDomain, curvePaths, stepPoints, upcomingDepartures, routeLabel, weekRange, weekFlights, timeText, searchUrl, weekendDays, roundTrips, cheapestTrip } from './storico-view.js';

const $ = (id) => document.getElementById(id);
const form = $('choice');
const content = $('content');
const STORE_KEY = 'voli-weekend-storico';
const TRIP_KEY = 'voli-weekend-storico-trip';
const AIRLINES = { ryanair: 'Ryanair', wizz: 'Wizz Air' };
const SVG_NS = 'http://www.w3.org/2000/svg';
const DAY_MS = 86400000;

let index = null;
const routes = new Map(); // "BRI-BUD" → file della tratta
let current = null; // { route, file, codes, departure, node, week, trip }
let loadSeq = 0; // ogni caricamento ha il suo numero: le risposte arrivate tardi per una scelta vecchia si scartano

// --- Formattazione ---
const fmtPrice = (n) => `${n.toLocaleString('it-IT', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
const dayMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fmtDay = (d) => new Date(dayMs(d)).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
/** «ven 14 nov»; l'anno compare solo se diverso da quello di riferimento (le partenze arrivano a un anno). */
const fmtDeparture = (d, refYear = d.slice(0, 4)) => new Date(dayMs(d)).toLocaleDateString('it-IT', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC', ...(d.slice(0, 4) !== refYear && { year: 'numeric' }),
}).replace(/\./g, '');
const weeksText = (w) => (w === 0 ? 'Settimana della partenza' : `${w} ${w === 1 ? 'settimana' : 'settimane'} prima`);
const round1 = (n) => Math.round(n * 10) / 10;
const airportName = (code) => (code === 'BRI' ? 'Bari' : code === 'BDS' ? 'Brindisi' : code);

function svg(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.append(node);
  return node;
}

function html(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

// --- Scelta della tratta ---
function readChoice() {
  const d = new FormData(form);
  return { base: d.get('base'), dir: d.get('dir'), dest: d.get('dest') };
}

function saveChoice() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(readChoice())); } catch { /* storage non disponibile */ }
}

function restoreChoice() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { /* storage non disponibile */ }
  if (!saved) return null;
  // Confronto diretto con i radio: un valore manomesso nel browser non finisce in un selettore
  for (const input of form.querySelectorAll('input[type="radio"]')) {
    if (saved[input.name] === input.value) input.checked = true;
  }
  return saved.dest ?? null;
}

/** Tratte dell'indice per partenza e direzione, con il codice dell'altro aeroporto. */
function routesFor(base, dir) {
  return index.routes
    .filter((r) => (dir === 'out' ? r.from === base : r.to === base))
    .map((r) => ({ ...r, other: dir === 'out' ? r.to : r.from }))
    .sort((a, b) => a.city.localeCompare(b.city, 'it') || a.other.localeCompare(b.other));
}

function fillDestinations(wanted) {
  const { base, dir } = readChoice();
  const list = routesFor(base, dir);
  const select = $('dest');
  const keep = wanted ?? select.value;
  select.replaceChildren(...list.map((r) => new Option(`${r.city} · ${r.other}`, r.other)));
  if (list.some((r) => r.other === keep)) select.value = keep;
  select.disabled = !list.length;
  return list;
}

function selectedRoute() {
  const { base, dir, dest } = readChoice();
  return routesFor(base, dir).find((r) => r.other === dest) ?? null;
}

// --- Caricamento ---
async function getJson(name) {
  const res = await fetch(`${HISTORY_BASE_URL}${name}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${name}`);
  return res.json();
}

async function loadIndex() {
  $('status').textContent = 'Carico lo storico…';
  const seq = ++loadSeq;
  content.replaceChildren(html('p', 'loading-note', 'Un momento…'));
  try {
    const fresh = await getJson('index.json');
    if (seq !== loadSeq) return;
    if (!isReadyIndex(fresh)) throw new Error('indice vuoto');
    index = fresh;
  } catch (err) {
    if (seq !== loadSeq) return;
    form.hidden = true;
    $('status').textContent = 'Storico non disponibile.';
    const notReady = /HTTP 404|indice vuoto/.test(err.message);
    showMessage(
      notReady ? 'Lo storico non è ancora pronto' : 'Storico non raggiungibile',
      notReady
        ? 'Il riepilogo dei prezzi si prepara ogni notte: il primo arriva dopo il primo giro notturno.'
        : 'Non riesco a scaricare lo storico. Controlla la connessione e riprova.',
      loadIndex,
    );
    return;
  }
  try {
    routes.clear();
    $('status').textContent = statusLine(index);
    form.hidden = false;
    fillDestinations(restoreChoice());
    await showRoute();
  } catch {
    form.hidden = true;
    $('status').textContent = 'Storico non disponibile.';
    showMessage('Storico non leggibile', 'I dati dello storico non sono nel formato atteso. Riprova più tardi.', loadIndex);
  }
}

async function showRoute() {
  const seq = ++loadSeq;
  const route = selectedRoute();
  if (!route) {
    current = null;
    showMessage('Nessuna tratta', `Nello storico non ci sono ancora tratte per questa scelta da ${airportName(readChoice().base)}.`);
    return;
  }
  const key = `${route.from}-${route.to}`;
  let file = routes.get(key);
  if (!file) {
    content.replaceChildren(html('p', 'loading-note', 'Carico la tratta…'));
    try {
      file = await getJson(`${key}.json`);
    } catch {
      if (seq !== loadSeq) return; // nel frattempo è stata scelta un'altra tratta
      showMessage('Tratta non raggiungibile', 'Non riesco a scaricare i prezzi di questa tratta. Controlla la connessione e riprova.', showRoute);
      return;
    }
    routes.set(key, file);
    if (seq !== loadSeq) return; // la scelta è cambiata mentre scaricavo
  }
  try {
    renderRoute(route, file);
  } catch {
    showMessage('Tratta non leggibile', 'I prezzi di questa tratta non sono nel formato atteso. Riprova più tardi.', showRoute);
    return;
  }
  if (current?.trip.status === 'loading') loadPartner(seq);
}

function showMessage(title, text, retry) {
  const box = html('div', 'empty');
  box.append(html('h3', null, title), html('p', null, text));
  if (retry) {
    const btn = html('button', 'btn-secondary', 'Riprova');
    btn.type = 'button';
    btn.addEventListener('click', retry);
    box.append(btn);
  }
  content.replaceChildren(box);
}

// --- Rendering della tratta ---
const flying = (file) => Object.entries(file.airlines ?? {})
  .filter(([, a]) => a.curve?.length || a.flights?.some(([, ch]) => ch.some((c) => c[2] != null)))
  .map(([code]) => code)
  .sort((a, b) => Object.keys(AIRLINES).indexOf(a) - Object.keys(AIRLINES).indexOf(b));

function legendItems(codes) {
  return codes.map((code) => {
    const li = html('li', `key ${code}`);
    li.append(html('span', 'swatch'), document.createTextNode(AIRLINES[code] ?? code));
    return li;
  });
}

function renderRoute(route, file) {
  const codes = flying(file);
  if (!codes.length) {
    current = null;
    showMessage('Nessun prezzo raccolto per questa tratta', `${routeLabel(route)}: lo storico non ha ancora prezzi. Prova un'altra destinazione o torna fra qualche giorno.`);
    return;
  }
  const node = $('route-template').content.firstElementChild.cloneNode(true);
  node.querySelector('.route-title').textContent = routeLabel(route);

  const rises = codes.map((c) => ({ code: c, text: riseText(file.airlines[c].rise ?? null, file.reliability) }));
  const sameText = rises.every((r) => r.text === rises[0].text);
  node.querySelector('.rise').replaceChildren(...(sameText || rises.length === 1
    ? [html('p', null, rises[0].text)]
    : rises.map((r) => {
      const p = html('p');
      p.append(html('b', null, `${AIRLINES[r.code]}: `), document.createTextNode(r.text));
      return p;
    })));

  for (const ul of node.querySelectorAll('.legend')) ul.replaceChildren(...legendItems(codes));

  const departures = [...new Set(codes.flatMap((c) => upcomingDepartures(file.airlines[c].flights ?? [], file.lastDay)))].sort();
  const select = node.querySelector('.departure');
  select.replaceChildren(...departures.map((d) => new Option(fmtDeparture(d, file.lastDay.slice(0, 4)), d)));
  const departure = departures.includes(current?.departure) ? current.departure : departures[0];
  if (departure) select.value = departure;
  select.disabled = !departures.length;
  select.addEventListener('change', () => { current.departure = select.value; drawSteps(); });

  // nuova tratta: nessuna settimana e nessun weekend scelti
  current = { route, file, codes, departure, node, week: null, trip: tripState(route) };
  setupTripMode(node);
  content.replaceChildren(node);
  drawAll();
  renderWeek();
  renderTrip();
}

function drawAll() {
  if (!current) return;
  drawCurve();
  drawSteps();
  drawTrips();
}

// --- Struttura comune dei grafici ---
function niceStep(span, maxTicks) {
  for (const s of [5, 10, 20, 25, 50, 100, 200, 250, 500]) if (span / s <= maxTicks) return s;
  return 1000;
}

/** Svg con assi e griglia; restituisce scale, area utile e il gruppo dove disegnare le serie. */
function frame(host, { xDomain, yDomain, xTicks, xLabel, label }) {
  const W = Math.max(280, Math.round(host.clientWidth || 600));
  const narrow = W < 560;
  const H = narrow ? 230 : 290;
  const m = { top: 14, right: 14, bottom: xLabel ? 44 : 28, left: 46 };
  const sx = scale(xDomain[0], xDomain[1], m.left, W - m.right);
  const sy = scale(yDomain[0], yDomain[1], H - m.bottom, m.top);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': label, tabindex: '0' });

  const grid = svg('g', { class: 'grid' }, root);
  const step = niceStep(yDomain[1] - yDomain[0], narrow ? 4 : 5);
  for (let v = Math.ceil(yDomain[0] / step) * step; v <= yDomain[1]; v += step) {
    const y = sy(v);
    svg('line', { x1: m.left, x2: W - m.right, y1: y, y2: y }, grid);
    svg('text', { x: m.left - 8, y, class: 'tick y' }, grid).textContent = `${v} €`;
  }
  const axis = svg('g', { class: 'axis' }, root);
  svg('line', { x1: m.left, x2: W - m.right, y1: H - m.bottom, y2: H - m.bottom, class: 'baseline' }, axis);
  for (const [v, text] of xTicks(narrow)) {
    const x = sx(v);
    svg('line', { x1: x, x2: x, y1: H - m.bottom, y2: H - m.bottom + 4 }, axis);
    const t = svg('text', { x, y: H - m.bottom + 16, class: 'tick x' }, axis);
    t.textContent = text;
    if (text.length > 2 && x > W - m.right - 24) t.classList.add('end'); // l'ultima data non esce dal riquadro
  }
  if (xLabel) svg('text', { x: (m.left + W - m.right) / 2, y: H - 6, class: 'axis-label' }, axis).textContent = xLabel;

  const plot = svg('g', { class: 'plot' }, root);
  const guide = svg('line', { y1: m.top, y2: H - m.bottom, class: 'guide', visibility: 'hidden' }, root);
  const tip = html('div', 'chart-tip');
  tip.hidden = true;
  host.replaceChildren(root, tip);
  return { root, plot, guide, tip, sx, sy, W, H, m, narrow };
}

/**
 * Tocco, passaggio del mouse e frecce: `pick(x)` sceglie il punto più vicino alla x dell'svg
 * e restituisce { x, title, rows } oppure null; `keys` è l'elenco ordinato dei punti per le frecce.
 */
function interact(f, pick, keys, onSelect) {
  let pos = null;
  let last = null; // ultimo punto mostrato: Invio lo sceglie
  const show = (hit) => {
    last = hit;
    if (!hit) { hide(); return; }
    f.guide.setAttribute('x1', hit.x);
    f.guide.setAttribute('x2', hit.x);
    f.guide.setAttribute('visibility', 'visible');
    f.tip.replaceChildren(html('p', 'tip-title', hit.title), ...hit.rows.map(([code, text]) => {
      const p = html('p', `tip-row ${code}`);
      p.append(html('span', 'swatch'), document.createTextNode(text));
      return p;
    }));
    f.tip.hidden = false;
    const box = f.root.getBoundingClientRect();
    const px = (hit.x / f.W) * box.width;
    const tw = f.tip.offsetWidth;
    f.tip.style.left = `${Math.min(Math.max(px - tw / 2, 0), box.width - tw)}px`;
  };
  const hide = () => { last = null; f.guide.setAttribute('visibility', 'hidden'); f.tip.hidden = true; };
  const fromEvent = (e) => {
    const box = f.root.getBoundingClientRect();
    return ((e.clientX - box.left) / box.width) * f.W;
  };
  f.root.addEventListener('pointermove', (e) => show(pick(fromEvent(e))));
  f.root.addEventListener('pointerdown', (e) => show(pick(fromEvent(e))));
  f.root.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  f.root.addEventListener('blur', hide);
  if (onSelect) f.root.addEventListener('click', (e) => { const hit = pick(fromEvent(e)); show(hit); if (hit) onSelect(hit); });
  f.root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && onSelect && last) { e.preventDefault(); onSelect(last); return; }
    if (!keys.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Home') pos = 0;
    else if (e.key === 'End') pos = keys.length - 1;
    else pos = pos == null ? keys.length - 1 : Math.min(Math.max(pos + (e.key === 'ArrowRight' ? 1 : -1), 0), keys.length - 1);
    show(pick(keys[pos]));
  });
}

// --- Grafico «Quando comprare» ---
function drawCurve() {
  const { file, codes, node } = current;
  const host = node.querySelector('[data-chart="curve"]');
  const values = codes.flatMap((c) => (file.airlines[c].curve ?? []).flatMap((r) => [r[1], r[2], r[3]]));
  const f = frame(host, {
    xDomain: [52, 0],
    yDomain: priceDomain(values),
    xTicks: (narrow) => Array.from({ length: 52 / (narrow ? 4 : 2) + 1 }, (_, i) => 52 - i * (narrow ? 4 : 2)).map((w) => [w, String(w)]),
    xLabel: 'settimane prima della partenza',
    label: `Prezzo tipico per settimane prima della partenza, ${codes.map((c) => AIRLINES[c]).join(' e ')}`,
  });

  for (const code of codes) {
    const { rise } = file.airlines[code];
    const curve = file.airlines[code].curve ?? [];
    const g = svg('g', { class: `series ${code}` }, f.plot);
    if (rise != null) {
      const x = f.sx(rise);
      svg('line', { x1: x, x2: x, y1: f.m.top, y2: f.H - f.m.bottom, class: 'rise-line' }, g);
      // Nella metà sinistra l'etichetta va a destra della linea, così resta dentro il grafico
      const left = x < (f.m.left + f.W - f.m.right) / 2;
      const t = svg('text', { x: left ? x + 4 : x - 4, y: f.m.top + 10, class: `rise-label${left ? ' start' : ''}` }, g);
      t.textContent = 'inizia a salire';
    }
    if (!curve.length) continue;
    const { line, band } = curvePaths(curve, f.sx, f.sy);
    svg('path', { d: band, class: 'band' }, g);
    svg('path', { d: line, class: 'line' }, g);
    if (curve.length === 1) svg('circle', { cx: f.sx(curve[0][0]), cy: f.sy(curve[0][1]), r: 4, class: 'dot' }, g);
  }

  // Fascia della settimana scelta, sotto le curve
  const weekPx = Math.abs(f.sx(0) - f.sx(1));
  const band = svg('rect', { y: f.m.top, height: f.H - f.m.bottom - f.m.top, width: weekPx, class: 'week-band', visibility: 'hidden' });
  f.root.insertBefore(band, f.plot);
  const mark = (week) => {
    if (week == null) { band.setAttribute('visibility', 'hidden'); return; }
    // Alle estremità (0 e 52 settimane) la fascia resta dentro l'area del grafico
    const x0 = Math.max(f.m.left, f.sx(week) - weekPx / 2);
    const x1 = Math.min(f.W - f.m.right, f.sx(week) + weekPx / 2);
    band.setAttribute('x', x0);
    band.setAttribute('width', x1 - x0);
    band.setAttribute('visibility', 'visible');
  };
  mark(current.week);

  // Ogni settimana si può toccare, anche dove la curva non ha punti
  const weeks = Array.from({ length: 53 }, (_, i) => 52 - i);
  const pick = (x) => {
    const week = Math.min(52, Math.max(0, Math.round((f.sx(0) - x) / weekPx)));
    const rows = codes.map((c) => {
      const r = (file.airlines[c].curve ?? []).find((row) => row[0] === week);
      return r ? [c, `${AIRLINES[c]} ${fmtPrice(r[1])} · ${Math.round(r[2])}–${Math.round(r[3])} € · ${r[4]} ${r[4] === 1 ? 'prezzo' : 'prezzi'}`] : null;
    }).filter(Boolean);
    return { x: f.sx(week), title: weeksText(week), rows, week };
  };
  interact(f, pick, weeks.map((w) => f.sx(w)), (hit) => {
    current.week = hit.week;
    mark(hit.week);
    renderWeek();
  });
}

// --- Voli della settimana scelta ---
const weekTitle = (w) => (w === 0 ? 'Voli che partono entro 6 giorni' : `Voli che partono tra ${w} ${w === 1 ? 'settimana' : 'settimane'}`);

function renderWeek() {
  const { route, file, node, week } = current;
  const box = node.querySelector('.week-flights');
  const note = node.querySelector('.week-note');
  if (week == null) {
    box.replaceChildren(html('p', 'week-hint', 'Tocca una settimana per vedere i voli che partono in quel periodo.'));
    note.textContent = '';
    return;
  }
  const year = file.lastDay.slice(0, 4);
  const [from, to] = weekRange(file.lastDay, week);
  const { rows, unavailable } = weekFlights(file, file.lastDay, week);
  const head = html('div', 'week-head');
  head.append(html('h4', null, weekTitle(week)), html('p', 'week-range', `${fmtDeparture(from, year)} – ${fmtDeparture(to, year)}`));
  const parts = [head];
  if (!rows.length) parts.push(html('p', 'week-empty', 'Nessun volo con prezzo in questa settimana.'));
  else {
    const min = Math.min(...rows.map((r) => r.price));
    const list = html('ul', 'week-list');
    for (const r of rows) {
      const li = html('li', `week-row ${r.airline}`);
      const info = html('p', 'week-info');
      const bits = [fmtDeparture(r.date, year), timeText(r.time)].filter(Boolean).join(' · ');
      const name = html('span', 'week-airline');
      name.append(html('span', 'swatch'), document.createTextNode(AIRLINES[r.airline] ?? r.airline));
      info.append(document.createTextNode(`${bits} · `), name);
      const price = html('span', `week-price${r.price === min ? ' lowest' : ''}`, fmtPrice(r.price));
      const link = html('a', 'btn-secondary week-search', 'Cerca');
      link.href = searchUrl(r.airline, route.from, route.to, r.date);
      link.target = '_blank';
      link.rel = 'noopener';
      link.setAttribute('aria-label', `Cerca il volo ${AIRLINES[r.airline] ?? r.airline} del ${fmtDeparture(r.date, year)}`);
      li.append(info, price, link);
      list.append(li);
    }
    parts.push(list);
  }
  if (unavailable > 0) parts.push(html('p', 'week-unavailable', `${unavailable} ${unavailable === 1 ? 'volo non prenotabile (esaurito o da verificare)' : 'voli non prenotabili (esauriti o da verificare)'}`));
  box.replaceChildren(...parts);
  note.textContent = rows.length ? 'Prezzi della raccolta di stanotte: sul sito della compagnia vedi quello di adesso.' : '';
}

// --- Grafico «I singoli voli» ---
function drawSteps() {
  const { file, codes, node, departure } = current;
  const host = node.querySelector('[data-chart="steps"]');
  const note = node.querySelector('.steps-note');
  if (!departure) {
    host.replaceChildren(html('p', 'chart-empty', 'Nessuna partenza in programma con prezzi nello storico.'));
    note.textContent = '';
    return;
  }
  const series = codes.map((c) => {
    const flight = (file.airlines[c].flights ?? []).find(([d]) => d === departure);
    return { code: c, points: flight ? stepPoints(flight[1], file.lastDay) : [] };
  }).filter((s) => s.points.length);

  node.querySelector('#flight-title').closest('.chart-card').querySelector('.legend')
    .replaceChildren(...legendItems(series.map((x) => x.code))); // solo le compagnie che hanno questo volo

  const first = index.firstDay < file.lastDay ? index.firstDay : file.lastDay;
  const nDays = Math.round((dayMs(file.lastDay) - dayMs(first)) / DAY_MS) + 1;
  const dayIdx = (d) => Math.round((dayMs(d) - dayMs(first)) / DAY_MS);
  const dayAt = (i) => new Date(dayMs(first) + i * DAY_MS).toISOString().slice(0, 10);
  const prices = series.flatMap((s) => s.points.map((p) => p[1]).filter((p) => p != null));

  const f = frame(host, {
    xDomain: [0, nDays - 1],
    yDomain: priceDomain(prices.length ? [Math.min(...prices) - 5, ...prices, Math.max(...prices) + 5] : []), // un po' d'aria sopra e sotto
    xTicks: (narrow) => {
      const max = narrow ? 4 : 8;
      const every = Math.max(1, Math.ceil((nDays - 1) / (max - 1)));
      const ticks = [];
      for (let i = nDays - 1; i >= 0; i -= every) ticks.unshift(i);
      return ticks.map((i) => [i, fmtDay(dayAt(i))]);
    },
    label: `Prezzo giorno per giorno del volo del ${fmtDeparture(departure, file.lastDay.slice(0, 4))}`,
  });

  for (const { code, points } of series) {
    const g = svg('g', { class: `series ${code}` }, f.plot);
    let d = '';
    let prev = null;
    for (const [day, price] of points) {
      if (price == null) { prev = null; continue; }
      const x = round1(f.sx(dayIdx(day)));
      const y = round1(f.sy(price));
      d += prev == null ? `M${x},${y}` : `H${x}V${y}`;
      prev = price;
    }
    if (d) svg('path', { d, class: 'line step' }, g);
    // Il prezzo di oggi (e un punto solo, quando lo storico ha un giorno) resta sempre visibile
    const known = points.filter((p) => p[1] != null);
    const dots = nDays <= 1 || known.length === 1 ? known : known.slice(-1);
    for (const [day, price] of dots) svg('circle', { cx: f.sx(dayIdx(day)), cy: f.sy(price), r: 4, class: 'dot' }, g);
  }

  const days = Array.from({ length: nDays }, (_, i) => i);
  const pick = (x) => {
    const i = days.reduce((best, k) => (Math.abs(f.sx(k) - x) < Math.abs(f.sx(best) - x) ? k : best), days[days.length - 1]);
    const day = dayAt(i);
    const rows = series.map(({ code, points }) => {
      const p = points.find((pt) => pt[0] === day);
      if (!p) return [code, `${AIRLINES[code]} non ancora nello storico`];
      return [code, `${AIRLINES[code]} ${p[1] == null ? 'non in vendita' : fmtPrice(p[1])}`];
    });
    return { x: f.sx(i), title: fmtDay(day), rows };
  };
  interact(f, pick, days.map((i) => f.sx(i)));

  const longest = Math.max(0, ...series.map((s) => s.points.length));
  note.textContent = longest <= 1
    ? 'Per ora c\'è un solo giorno di prezzi per questo volo: la linea si allunga ogni giorno.'
    : 'Prezzo dello stesso volo giorno per giorno, da quando è entrato nello storico.';
}

// --- Grafico «Quando partire» ---
const HOMES = ['BRI', 'BDS'];
const TRIP_NOTE = 'Prezzi della raccolta di stanotte: sul sito della compagnia vedi quello di adesso.';
const MISSING_TEXT = 'Ritorno non disponibile per questa tratta.';

function readTripMode() {
  try {
    const saved = localStorage.getItem(TRIP_KEY);
    if (saved === 'weekend' || saved === 'lungo') return saved;
  } catch { /* storage non disponibile */ }
  return 'weekend';
}

function saveTripMode(mode) {
  try { localStorage.setItem(TRIP_KEY, mode); } catch { /* storage non disponibile */ }
}

/**
 * Stato della carta per la tratta scelta: l'andata parte sempre da Bari/Brindisi,
 * qualunque direzione sia selezionata. `status`: ok, loading (manca il file dell'altra direzione), missing.
 */
function tripState(route) {
  const home = HOMES.includes(route.from) ? route.from : route.to;
  const dest = home === route.from ? route.to : route.from;
  const outKey = `${home}-${dest}`;
  const backKey = `${dest}-${home}`;
  const otherKey = `${route.from}-${route.to}` === outKey ? backKey : outKey;
  const listed = index.routes.some((r) => `${r.from}-${r.to}` === otherKey);
  const status = routes.has(otherKey) ? 'ok' : listed ? 'loading' : 'missing';
  return { home, dest, outKey, backKey, otherKey, status, mode: readTripMode(), saturday: null, list: null };
}

/** Scarica il file dell'altra direzione; risposte arrivate dopo un cambio di tratta si scartano. */
async function loadPartner(seq) {
  const { otherKey } = current.trip;
  let ok = true;
  try {
    routes.set(otherKey, await getJson(`${otherKey}.json`));
  } catch {
    ok = false;
  }
  if (seq !== loadSeq || !current) return;
  current.trip.status = ok ? 'ok' : 'missing';
  drawTrips();
  renderTrip();
}

function setupTripMode(node) {
  const mode = readTripMode();
  for (const input of node.querySelectorAll('input[name="trip-mode"]')) {
    input.checked = input.value === mode;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      current.trip.mode = input.value;
      saveTripMode(input.value);
      drawTrips(); // il sabato scelto resta: cambia solo la combinazione
      renderTrip();
    });
  }
}

/** Combinazioni del weekend per la vista scelta; null se mancano i dati. */
function tripList() {
  const t = current.trip;
  if (t.status !== 'ok') return null;
  const outFile = routes.get(t.outKey) ?? null;
  const backFile = routes.get(t.backKey) ?? null;
  const lastDay = outFile?.lastDay ?? backFile?.lastDay ?? index.lastDay;
  return { lastDay, trips: roundTrips(outFile, backFile, lastDay, t.mode) };
}

/** «ven 11 dic – dom 13 dic»: dal primo giorno di andata all'ultimo di ritorno. */
function weekendText(saturday, mode, year) {
  const { out, back } = weekendDays(saturday, mode);
  return `${fmtDeparture(out[0], year)} – ${fmtDeparture(back[back.length - 1], year)}`;
}

/** «13–14 dic» se nello stesso mese, altrimenti «31 gen – 1 feb». */
function spanText(a, b) {
  if (a.slice(0, 7) === b.slice(0, 7)) return `${+a.slice(8, 10)}–${fmtDay(b)}`;
  return `${fmtDay(a)} – ${fmtDay(b)}`;
}

function drawTrips() {
  const t = current.trip;
  const card = current.node.querySelector('[data-chart="trips"]').closest('.chart-card');
  const host = card.querySelector('[data-chart="trips"]');
  const best = card.querySelector('.trip-best');
  const empty = (text) => {
    t.list = null;
    best.replaceChildren();
    host.replaceChildren(html('p', 'chart-empty', text));
  };
  if (t.status === 'loading') { empty('Carico il ritorno…'); return; }
  let data = null;
  try {
    data = tripList();
  } catch {
    t.status = 'missing'; // file dell'altra direzione non nel formato atteso
  }
  if (!data) { empty(MISSING_TEXT); return; }
  const { lastDay, trips } = data;
  t.list = { lastDay, trips };
  const cheapest = cheapestTrip(trips);
  if (!cheapest) { empty('Nessuna combinazione con prezzo per ora.'); return; }

  best.replaceChildren(
    document.createTextNode(`Il più economico: ${spanText(cheapest.out.date, cheapest.back.date)} · `),
    html('b', 'trip-best-price', fmtPrice(cheapest.total)),
  );

  const year = lastDay.slice(0, 4);
  const totals = trips.map((x) => x.total).filter((v) => v != null);
  const monthOf = (d) => new Date(dayMs(d)).toLocaleDateString('it-IT', { month: 'short', timeZone: 'UTC' }).replace('.', '');
  const f = frame(host, {
    xDomain: [0, 52],
    yDomain: priceDomain([0, ...totals]), // le barre partono da zero: altezze confrontabili
    xTicks: (narrow) => {
      // Tacca al primo sabato di ogni mese; su schermo stretto un mese sì e uno no
      const firsts = trips.map((x, i) => [i, x.saturday]).filter(([, s]) => +s.slice(8, 10) <= 7);
      return firsts.filter((_, k) => !narrow || k % 2 === 0).map(([i, s]) => [i, monthOf(s)]);
    },
    label: `Prezzo di andata e ritorno per ogni weekend, ${t.mode === 'lungo' ? 'weekend lungo' : 'weekend'}`,
  });

  const step = Math.abs(f.sx(1) - f.sx(0));
  const barW = step * 0.7;
  const bars = svg('g', { class: 'trip-bars' }, f.plot);
  trips.forEach((trip, i) => {
    if (trip.total == null) return;
    const y = f.sy(trip.total);
    svg('rect', {
      x: round1(f.sx(i) - barW / 2), y: round1(y), width: round1(barW), height: round1(Math.max(0, f.H - f.m.bottom - y)),
      rx: Math.min(2, barW / 2), class: `trip-bar${trip.saturday === cheapest.saturday ? ' lowest' : ''}`,
    }, bars);
  });

  // Fascia del weekend scelto, sotto le barre
  const band = svg('rect', { y: f.m.top, height: f.H - f.m.bottom - f.m.top, width: step, class: 'week-band', visibility: 'hidden' });
  f.root.insertBefore(band, f.plot);
  const mark = (saturday) => {
    const i = trips.findIndex((x) => x.saturday === saturday);
    if (i < 0) { band.setAttribute('visibility', 'hidden'); return; }
    band.setAttribute('x', f.sx(i) - step / 2);
    band.setAttribute('width', step);
    band.setAttribute('visibility', 'visible');
  };
  mark(t.saturday);

  const pick = (x) => {
    const i = Math.min(52, Math.max(0, Math.round((x - f.sx(0)) / step)));
    const trip = trips[i];
    const text = trip.total == null ? 'nessuna combinazione' : `Totale ${fmtPrice(trip.total)}`;
    return { x: f.sx(i), title: weekendText(trip.saturday, t.mode, year), rows: [['trip', text]], saturday: trip.saturday };
  };
  interact(f, pick, trips.map((_, i) => f.sx(i)), (hit) => {
    t.saturday = hit.saturday;
    mark(hit.saturday);
    renderTrip();
  });
}

/** Riga di una gamba, nello stesso stile dei voli della settimana. */
function legRow(kind, leg, from, to, year) {
  const li = html('li', `week-row ${leg.airline}`);
  const info = html('p', 'week-info');
  const bits = [fmtDeparture(leg.date, year), timeText(leg.time)].filter(Boolean).join(' · ');
  const name = html('span', 'week-airline');
  name.append(html('span', 'swatch'), document.createTextNode(AIRLINES[leg.airline] ?? leg.airline));
  info.append(html('b', 'trip-kind', kind), document.createTextNode(` ${bits} · `), name);
  const price = html('span', 'week-price', fmtPrice(leg.price));
  const link = html('a', 'btn-secondary week-search', 'Cerca');
  link.href = searchUrl(leg.airline, from, to, leg.date);
  link.target = '_blank';
  link.rel = 'noopener';
  link.setAttribute('aria-label', `Cerca il volo di ${kind.toLowerCase()} ${AIRLINES[leg.airline] ?? leg.airline} del ${fmtDeparture(leg.date, year)}`);
  li.append(info, price, link);
  return li;
}

function renderTrip() {
  const t = current.trip;
  const card = current.node.querySelector('[data-chart="trips"]').closest('.chart-card');
  const box = card.querySelector('.trip-detail');
  const note = card.querySelector('.trip-note');
  note.textContent = '';
  if (!t.list || !cheapestTrip(t.list.trips)) { box.replaceChildren(); return; }
  const trip = t.list.trips.find((x) => x.saturday === t.saturday);
  if (!trip) {
    box.replaceChildren(html('p', 'week-hint', 'Tocca un weekend per vedere andata e ritorno.'));
    return;
  }
  const year = t.list.lastDay.slice(0, 4);
  const head = html('div', 'week-head');
  head.append(html('h4', null, weekendText(trip.saturday, t.mode, year)));
  if (trip.total == null) {
    box.replaceChildren(head, html('p', 'week-empty', 'Nessuna combinazione con prezzo per questo weekend.'));
    return;
  }
  const list = html('ul', 'week-list');
  list.append(
    legRow('Andata', trip.out, t.home, t.dest, year),
    legRow('Ritorno', trip.back, t.dest, t.home, year),
  );
  const total = html('p', 'trip-total');
  total.append(document.createTextNode('Totale '), html('b', 'trip-total-price', fmtPrice(trip.total)));
  box.replaceChildren(head, list, total);
  note.textContent = TRIP_NOTE;
}

// --- Avvio ---
if (new URLSearchParams(location.search).has('sample')) {
  for (const a of document.querySelectorAll('.brand, #back-link')) a.href = './?sample=1';
}

form.addEventListener('submit', (e) => e.preventDefault());
form.addEventListener('change', (e) => {
  if (e.target.name !== 'dest') fillDestinations();
  saveChoice();
  if (current) current.departure = null;
  showRoute();
});

let lastWidth = 0;
new ResizeObserver(() => {
  const w = content.clientWidth;
  if (w === lastWidth) return;
  lastWidth = w;
  requestAnimationFrame(drawAll);
}).observe(content);

loadIndex();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* la pagina funziona anche senza */ });
}
