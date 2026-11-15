import { DATA_BASE_URL, HISTORY_BASE_URL } from './config.js';
import { describeTracking } from './tracking-spec.js';
import { scale, priceDomain } from './storico-view.js';
import {
  newIssueUrl, priceLine, ageText, isStale, buyAdvice, formToTracking, romeToday, comboText,
  namesMap, nextMonths, fmtPrice,
} from './seguite-view.js';

const $ = (id) => document.getElementById(id);
const content = $('content');
const form = $('follow-form');
const follow = $('follow');
const SVG_NS = 'http://www.w3.org/2000/svg';
const DAY_MS = 86400000;
const NO_PRICE = 'Nessun prezzo disponibile ora: la tratta potrebbe non essere ancora in vendita.';
const DONE = 'Conferma la richiesta su GitHub: entro pochi minuti la tratta compare qui e ricevi un messaggio.';

let airports = [];
let names = {};
let items = [];
const summaries = new Map(); // id voce → riepilogo storico dell'andata (null se non nello storico)
let historyOk = true;

// --- Aiuti DOM ---
function html(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function svg(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.append(node);
  return node;
}

function link(cls, text, href) {
  const a = html('a', cls, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

const dayMs = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const shortDay = (d) => new Date(dayMs(d)).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
const round1 = (n) => Math.round(n * 10) / 10;

// --- Caricamento ---
async function getJson(base, name) {
  const res = await fetch(`${base}${name}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${name}`);
  return res.json();
}

async function loadAirports() {
  try {
    const data = await getJson(DATA_BASE_URL, 'airports.json');
    airports = Array.isArray(data?.airports) ? data.airports : [];
  } catch {
    airports = []; // il modulo funziona anche scrivendo i codici a mano
  }
  names = namesMap(airports);
  const list = $('airports');
  list.replaceChildren(...[...airports]
    .sort((a, b) => a.city.localeCompare(b.city, 'it'))
    .map((a) => { const o = document.createElement('option'); o.value = `${a.city} (${a.code})`; return o; }));
}

/** Riepiloghi dello storico per le voci con prezzo: solo per le tratte presenti nell'indice. */
async function loadSummaries() {
  summaries.clear();
  let index;
  try {
    index = await getJson(HISTORY_BASE_URL, 'index.json');
    historyOk = true;
  } catch (err) {
    historyOk = /HTTP 404/.test(err.message); // 404: storico non ancora nato, quindi «in costruzione»
    return;
  }
  const known = new Set((index?.routes ?? []).map((r) => `${r.from}-${r.to}`));
  const cache = new Map();
  await Promise.all(items.filter((it) => it.tracking).map(async (it) => {
    const key = `${it.tracking.from}-${it.tracking.to}`;
    if (!known.has(key)) { summaries.set(it.id, null); return; }
    if (!cache.has(key)) cache.set(key, getJson(HISTORY_BASE_URL, `${key}.json`).catch(() => undefined));
    const file = await cache.get(key);
    if (file !== undefined) summaries.set(it.id, file);
  }));
}

async function load() {
  $('status').textContent = 'Carico le tratte…';
  content.replaceChildren(html('p', 'loading-note', 'Un momento…'));
  await loadAirports();
  let data;
  try {
    data = await getJson(DATA_BASE_URL, 'tracking.json');
  } catch (err) {
    if (/HTTP 404/.test(err.message)) data = { generatedAt: null, items: [] }; // nessuna tratta ancora pubblicata
    else {
      $('status').textContent = 'Tratte non disponibili.';
      showMessage('Tratte non raggiungibili', 'Non riesco a scaricare le tratte seguite. Controlla la connessione e riprova.', load);
      return;
    }
  }
  items = Array.isArray(data?.items) ? data.items : [];
  await loadSummaries();
  try {
    render(data);
  } catch {
    $('status').textContent = 'Tratte non disponibili.';
    showMessage('Tratte non leggibili', 'I dati delle tratte non sono nel formato atteso. Riprova più tardi.', load);
  }
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

// --- Elenco ---
function statusText(data) {
  const n = items.length;
  const parts = [`${n} ${n === 1 ? 'tratta seguita' : 'tratte seguite'}`, 'controllo ogni 2 ore'];
  if (data.generatedAt) {
    const time = new Date(data.generatedAt).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
    parts.push(`elenco aggiornato alle ${time}`);
  }
  return parts.join(' · ');
}

function render(data) {
  if (!items.length) {
    $('status').textContent = 'Non segui ancora nessuna tratta: compila il modulo qui sotto e ricevi un messaggio quando il prezzo scende.';
    content.replaceChildren();
    follow.open = true;
    return;
  }
  $('status').textContent = statusText(data);
  const list = html('ul', 'track-list');
  for (const it of items) list.append(it.status === 'errore' || !it.tracking ? errorCard(it) : trackCard(it));
  content.replaceChildren(list);
  drawCharts();
}

function errorCard(it) {
  const li = html('li', 'track track-error');
  li.append(html('h2', 'track-name', (it.title ?? '').replace(/^Segui:\s*/, '') || `Richiesta n. ${it.id}`));
  const box = html('div', 'track-alert');
  box.append(html('p', 'track-alert-title', 'Non riesco a leggere questa richiesta:'));
  const ul = html('ul');
  for (const e of it.errors?.length ? it.errors : ['Errore sconosciuto.']) ul.append(html('li', null, e));
  box.append(ul);
  li.append(box);
  const actions = html('div', 'track-actions');
  actions.append(link('btn-book', 'Correggi su GitHub', it.url));
  li.append(actions);
  return li;
}

function trackCard(it) {
  const t = it.tracking;
  const now = new Date();
  const li = html('li', 'track');
  li.dataset.id = it.id;
  const desc = describeTracking(t, names);
  li.append(html('h2', 'track-name', t.name || desc));
  if (t.name) li.append(html('p', 'track-desc', desc));

  const price = priceLine(it);
  if (price) {
    const row = html('p', 'track-price');
    const amount = html('span', 'price');
    amount.append(html('span', 'amount', price.perPerson), html('span', 'per', ' a persona'));
    row.append(amount);
    if (price.total) row.append(html('span', 'track-total', price.total));
    if (price.drop) row.append(html('span', 'track-drop', price.drop));
    li.append(row, html('p', 'track-legs', comboText(it.best)));
    if (t.people > 1) li.append(html('p', 'track-note', 'Per un gruppo il prezzo può essere più alto, soprattutto vicino alla partenza.'));
  } else {
    li.append(html('p', 'track-noprice', NO_PRICE));
  }

  if (it.series?.length) {
    const chart = html('div', 'chart track-chart');
    chart.dataset.id = it.id;
    li.append(chart);
  }

  const advice = historyOk && summaries.has(it.id) ? buyAdvice(it, summaries.get(it.id), romeToday(now))
    : historyOk ? buyAdvice(it, null, romeToday(now)) : null;
  if (advice) li.append(html('p', 'track-advice', advice));

  const age = html('p', isStale(it.checkedAt, now) ? 'stale-note track-age' : 'track-age', ageText(it.checkedAt, now));
  li.append(age);
  if (it.sourceErrors?.length) {
    li.append(html('p', 'stale-note', `Ultimo controllo non riuscito (${it.sourceErrors.join('; ')}): il prezzo mostrato è del controllo precedente.`));
  }

  if (it.top?.length > 1) li.append(otherCombos(it));

  const actions = html('div', 'track-actions');
  for (const l of it.links ?? []) {
    const a = link('btn-book', it.links.length > 1 ? `Prenota ${l.label}` : 'Prenota', l.url);
    a.setAttribute('aria-label', `Prenota su ${l.label}`);
    actions.append(a);
  }
  const stop = link('btn-secondary', 'Smetti di seguire', it.url);
  stop.title = 'Apre la richiesta su GitHub: chiudila per smettere di seguire la tratta';
  actions.append(stop);
  li.append(actions);
  return li;
}

function otherCombos(it) {
  const box = html('details', 'track-more');
  box.append(html('summary', null, 'Altre combinazioni'));
  const ul = html('ul', 'week-list');
  const people = it.tracking.people;
  for (const c of it.top) {
    const row = html('li', 'week-row');
    const info = html('p', 'week-info', comboText(c));
    const total = people > 1 ? ` · ${fmtPrice(Math.round(c.price * people * 100) / 100)} in ${people}` : '';
    row.append(info, html('span', `week-price${c === it.top[0] ? ' lowest' : ''}`, `${fmtPrice(c.price)}${total}`));
    ul.append(row);
  }
  box.append(ul);
  return box;
}

// --- Grafico: prezzo migliore giorno per giorno ---
function drawCharts() {
  for (const host of content.querySelectorAll('.track-chart')) {
    const it = items.find((x) => String(x.id) === host.dataset.id);
    if (it) drawSeries(host, it);
  }
}

function drawSeries(host, it) {
  const series = [...it.series].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const W = Math.max(280, Math.round(host.clientWidth || 600));
  const narrow = W < 560;
  const H = narrow ? 170 : 200;
  const m = { top: 14, right: 14, bottom: 26, left: 46 };
  const first = series[0][0];
  const last = series[series.length - 1][0];
  const nDays = Math.round((dayMs(last) - dayMs(first)) / DAY_MS) + 1;
  const idx = (d) => Math.round((dayMs(d) - dayMs(first)) / DAY_MS);
  const prices = series.map((p) => p[1]);
  const ref = it.alertRef ?? null;
  const all = ref != null ? [...prices, ref] : prices;
  const [y0, y1] = priceDomain([Math.min(...all) - 5, ...all, Math.max(...all) + 5]);
  const sx = scale(0, nDays - 1, m.left, W - m.right);
  const sy = scale(y0, y1, H - m.bottom, m.top);
  const label = `Prezzo migliore a persona giorno per giorno, da ${shortDay(first)} a ${shortDay(last)}: oggi ${fmtPrice(prices[prices.length - 1])}`;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': label, tabindex: '0' });

  const grid = svg('g', { class: 'grid' }, root);
  const span = y1 - y0;
  const step = [5, 10, 20, 25, 50, 100, 200].find((s) => span / s <= (narrow ? 3 : 4)) ?? 500;
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
    svg('line', { x1: m.left, x2: W - m.right, y1: sy(v), y2: sy(v) }, grid);
    svg('text', { x: m.left - 8, y: sy(v), class: 'tick y' }, grid).textContent = `${v} €`;
  }
  const axis = svg('g', { class: 'axis' }, root);
  svg('line', { x1: m.left, x2: W - m.right, y1: H - m.bottom, y2: H - m.bottom }, axis);
  const ticks = nDays === 1 ? [0] : [0, nDays - 1];
  for (const i of ticks) {
    const t = svg('text', { x: sx(i), y: H - m.bottom + 16, class: `tick x${i === nDays - 1 && nDays > 1 ? ' end' : ''}` }, axis);
    if (i === 0 && nDays > 1) t.setAttribute('style', 'text-anchor: start');
    t.textContent = shortDay(i === 0 ? first : last);
  }

  const g = svg('g', { class: 'series ryanair' }, root);
  if (ref != null) {
    svg('line', { x1: m.left, x2: W - m.right, y1: sy(ref), y2: sy(ref), class: 'rise-line' }, g);
    svg('text', { x: W - m.right, y: sy(ref) - 5, class: 'rise-label' }, g).textContent = `ultimo avviso ${fmtPrice(ref)}`;
  }
  let d = '';
  for (const [day, price] of series) {
    const x = round1(sx(idx(day)));
    const y = round1(sy(price));
    d += d ? `H${x}V${y}` : `M${x},${y}`;
  }
  if (nDays > 1) d += `H${round1(sx(nDays - 1))}`;
  svg('path', { d, class: 'line step' }, g);
  const [lastDay, lastPrice] = series[series.length - 1];
  svg('circle', { cx: sx(idx(lastDay)), cy: sy(lastPrice), r: 4, class: 'dot' }, g);

  // Tocco e mouse: prezzo del giorno più vicino
  const guide = svg('line', { y1: m.top, y2: H - m.bottom, class: 'guide', visibility: 'hidden' }, root);
  const tip = html('div', 'chart-tip');
  tip.hidden = true;
  const priceOn = (i) => {
    let p = null;
    for (const [day, price] of series) if (idx(day) <= i) p = price;
    return p;
  };
  const dayAt = (i) => new Date(dayMs(first) + i * DAY_MS).toISOString().slice(0, 10);
  const show = (clientX) => {
    const box = root.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * W;
    const i = nDays === 1 ? 0 : Math.min(nDays - 1, Math.max(0, Math.round(((x - m.left) / (W - m.left - m.right)) * (nDays - 1))));
    guide.setAttribute('x1', sx(i));
    guide.setAttribute('x2', sx(i));
    guide.setAttribute('visibility', 'visible');
    tip.textContent = `${shortDay(dayAt(i))}: ${fmtPrice(priceOn(i))} a persona`;
    tip.hidden = false;
    const px = (sx(i) / W) * box.width;
    tip.style.left = `${Math.min(Math.max(px - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth)}px`;
  };
  const hide = () => { guide.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  root.addEventListener('pointermove', (e) => show(e.clientX));
  root.addEventListener('pointerdown', (e) => show(e.clientX));
  root.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
  root.addEventListener('blur', hide);

  const caption = html('p', 'chart-note', nDays <= 1
    ? 'Per ora c\'è un solo giorno di prezzi: la linea si allunga a ogni controllo.'
    : 'Prezzo migliore a persona giorno per giorno, da quando segui la tratta.');
  host.replaceChildren(root, tip, caption);
}

// --- Modulo «Segui una tratta» ---
function setupForm() {
  const today = romeToday();
  $('months').replaceChildren(...nextMonths(today, 12).map(({ value, label }) => {
    const l = html('label', 'chip');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'mesi';
    input.value = value;
    l.append(input, html('span', null, label));
    return l;
  }));
  for (const name of ['andata', 'ritorno']) form.elements[name].min = today;
  syncForm();
  form.addEventListener('change', (e) => {
    if (['tipo', 'date'].includes(e.target.name)) syncForm();
    $('follow-done').hidden = true;
  });
  form.addEventListener('submit', onSubmit);
}

/** Mostra solo i campi che servono: date precise o finestra, ritorno solo per andata e ritorno. */
function syncForm() {
  const mode = form.elements.date.value;
  const roundTrip = form.elements.tipo.value !== 'solo';
  for (const el of form.querySelectorAll('[data-mode]')) el.hidden = el.dataset.mode !== mode;
  for (const el of form.querySelectorAll('[data-roundtrip]')) el.hidden = !roundTrip;
}

function readFields() {
  const d = new FormData(form);
  const fields = {};
  for (const key of ['da', 'a', 'tipo', 'date', 'andata', 'ritorno', 'nottiMin', 'nottiMax', 'persone', 'nome']) fields[key] = d.get(key) ?? '';
  fields.mesi = d.getAll('mesi');
  fields.giorni = d.getAll('giorni');
  return fields;
}

function onSubmit(e) {
  e.preventDefault();
  const { tracking, errors } = formToTracking(readFields(), { today: romeToday(), airports });
  const box = $('form-errors');
  const done = $('follow-done');
  if (errors.length) {
    box.replaceChildren(...errors.map((x) => html('li', null, x)));
    box.hidden = false;
    done.hidden = true;
    return;
  }
  box.hidden = true;
  const url = newIssueUrl(tracking, names);
  window.open(url, '_blank', 'noopener');
  // Se il browser blocca la nuova scheda, il link resta a portata di mano
  done.replaceChildren(document.createTextNode(`${DONE} `), link('follow-link', 'Apri GitHub', url));
  done.hidden = false;
}

// --- Avvio ---
if (new URLSearchParams(location.search).has('sample')) {
  for (const a of document.querySelectorAll('.brand, #back-link')) a.href = './?sample=1';
  $('history-link').href = 'storico.html?sample=1';
}

document.querySelector('.follow-open').addEventListener('click', (e) => {
  e.preventDefault();
  follow.open = true;
  follow.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.elements.a.focus({ preventScroll: true });
});

let lastWidth = 0;
new ResizeObserver(() => {
  const w = content.clientWidth;
  if (w === lastWidth) return;
  lastWidth = w;
  requestAnimationFrame(drawCharts);
}).observe(content);

setupForm();
load();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* la pagina funziona anche senza */ });
}
