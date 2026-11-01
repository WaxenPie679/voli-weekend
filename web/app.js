import { DATA_BASE_URL, PAGE_SIZE, ALERT_THRESHOLD, MAX_PRICE, REFRESH_MS } from './config.js';
import { combine, applyFilters, bestPerDestination, stayHours, airlinesOf, freshness, legTimes } from './view.js';

const $ = (id) => document.getElementById(id);
const form = $('filters');
const list = $('passes');
const tpl = $('pass-template');
const STORE_KEY = 'voli-weekend-filtri';
const SOURCE_NAMES = { ryanair: 'Ryanair', wizz: 'Wizz Air', google: 'Google Voli' };
const MAX_STAY_HOURS = 54; // da venerdì 18:00 a domenica 24:00

let all = [];
let files = { direct: null, connections: null };
let shown = PAGE_SIZE;

// --- Formattazione ---
const fmtPrice = (n) => n.toLocaleString('it-IT', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
const day = (iso) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const fmtDay = (iso) => day(iso).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtWeekend = (friday) => {
  const f = day(friday);
  const s = new Date(f.getTime() + 2 * 864e5);
  const opt = { day: 'numeric', month: 'short', timeZone: 'UTC' };
  return f.getUTCMonth() === s.getUTCMonth()
    ? `${f.getUTCDate()}–${s.toLocaleDateString('it-IT', opt)}`
    : `${f.toLocaleDateString('it-IT', opt)} – ${s.toLocaleDateString('it-IT', opt)}`;
};
const fmtDuration = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const airportName = (code) => (code === 'BRI' ? 'Bari' : code === 'BDS' ? 'Brindisi' : code);

function legText(leg) {
  const first = leg.segments[0];
  const last = leg.segments.at(-1);
  const hubs = leg.segments.slice(0, -1).map((s) => s.to);
  const layovers = leg.layovers ?? [];
  const stops = hubs.length
    ? `1 scalo a ${hubs.join(', ')}${layovers[0] != null ? ` (${fmtDuration(layovers[0])})` : ''}`
    : 'diretto';
  return { day: fmtDay(first.dep), time: legTimes(leg), meta: `${first.airline} · ${stops}` };
}

// --- Filtri ---
function readFilters() {
  const d = new FormData(form);
  return {
    origin: d.get('origin') || undefined,
    directOnly: d.get('kind') === 'direct',
    stopsOnly: d.get('kind') === 'stops',
    weekend: d.get('weekend') || undefined,
    airline: d.get('airline') || undefined,
    maxPrice: Number(d.get('max')),
    perDest: d.get('perDest') === 'on',
  };
}

function saveFilters() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(new FormData(form)))); } catch { /* storage non disponibile */ }
}

function restoreFilters() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { /* storage non disponibile */ }
  if (!saved) return;
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'radio') el.checked = (saved[el.name] ?? '') === el.value;
    else if (el.type === 'checkbox') el.checked = saved[el.name] === 'on';
    else if (saved[el.name] != null) el.value = saved[el.name];
  }
}

function fillSelect(select, options, labelOf) {
  const current = select.value;
  select.length = 1;
  for (const value of options) select.add(new Option(labelOf(value), value));
  select.value = options.includes(current) ? current : '';
}

function filtersSummary(f) {
  const parts = [f.origin ? airportName(f.origin) : 'Bari e Brindisi', f.directOnly ? 'diretti' : f.stopsOnly ? 'con scalo' : 'tutti i voli'];
  if (f.weekend) parts.push(`weekend ${fmtWeekend(f.weekend)}`);
  if (f.airline) parts.push(f.airline);
  parts.push(`fino a ${f.maxPrice} €`);
  return parts.join(' · ');
}

// Su telefono i filtri partono chiusi; da desktop sono sempre aperti
const narrow = window.matchMedia('(max-width: 720px)');
const syncFiltersBox = () => { $('filters-box').open = !narrow.matches; };
narrow.addEventListener('change', syncFiltersBox);
syncFiltersBox();

// --- Rendering ---
function renderSources(now) {
  const entries = [
    ...Object.entries(files.direct?.sources ?? { ryanair: undefined, wizz: undefined }),
    ...Object.entries(files.connections?.sources ?? { google: undefined }),
  ];
  const stale = [];
  $('sources').replaceChildren(...entries.map(([name, status]) => {
    const f = freshness(name, status, now);
    const li = document.createElement('li');
    li.className = f.stale ? 'stale' : '';
    li.innerHTML = '<span class="dot" aria-hidden="true"></span>';
    const b = document.createElement('b');
    b.textContent = SOURCE_NAMES[name] ?? name;
    li.append(b, ` ${f.label.replace('aggiornato ', '')}`);
    li.title = status?.error ? `Errore: ${status.error}` : f.label;
    if (f.stale) stale.push(`${SOURCE_NAMES[name] ?? name} ${status?.error ? `non risponde (${status.error})` : 'non si aggiorna'}: dati ${f.label.replace('aggiornato ', 'di ')}`);
    return li;
  }));
  const note = $('stale-note');
  note.hidden = stale.length === 0;
  note.textContent = stale.length ? `${stale.join(' · ')}. I prezzi potrebbero essere cambiati.` : '';
}

function renderPass(it) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  const q = (sel) => node.querySelector(sel);
  q('.from').textContent = it.origin;
  q('.to').textContent = it.destination.code;
  q('.route').setAttribute('aria-label', `Da ${airportName(it.origin)} a ${it.destination.city}`);
  q('.city').textContent = it.destination.city;
  q('.country').textContent = it.destination.country;
  for (const [cls, leg] of [['.out', it.outbound], ['.back', it.inbound]]) {
    const t = legText(leg);
    const dd = q(`${cls} dd`);
    dd.innerHTML = '<span class="day"></span> · <span class="time"></span> <span class="meta"></span>';
    dd.querySelector('.day').textContent = t.day;
    dd.querySelector('.time').textContent = t.time;
    dd.querySelector('.meta').textContent = `· ${t.meta}`;
  }
  const hours = stayHours(it);
  q('.stay-fill').style.transform = `scaleX(${Math.min(1, Math.max(0, hours / MAX_STAY_HOURS))})`;
  q('.stay-label').innerHTML = `<b>${Math.round(hours)} h</b> a ${it.destination.city.replace(/[<>&]/g, '')}`;
  q('.weekend').textContent = `Weekend ${fmtWeekend(it.weekend)} · da ${airportName(it.origin)}`;
  q('.amount').textContent = fmtPrice(it.price);
  const book = q('.btn-book');
  book.href = it.bookingUrl;
  book.setAttribute('aria-label', `Prenota ${it.destination.city} a ${fmtPrice(it.price)} euro su ${SOURCE_NAMES[it.source]}`);
  q('.price-note').textContent = `andata e ritorno · via ${SOURCE_NAMES[it.source] ?? it.source}`;
  return node;
}

function render() {
  const f = readFilters();
  $('max-out').textContent = `${f.maxPrice} €`;
  $('filters-summary').textContent = filtersSummary(f);
  let its = applyFilters(all, f);
  const under = applyFilters(all, { ...f, maxPrice: Math.min(f.maxPrice, ALERT_THRESHOLD - 0.01) }).length;
  if (f.perDest) its = bestPerDestination(its);

  const finding = $('finding');
  if (!its.length) {
    finding.textContent = all.length ? 'Nessun volo con questi filtri.' : 'Nessun volo disponibile al momento.';
  } else {
    const top = its[0];
    finding.innerHTML = '';
    const city = document.createElement('strong');
    city.textContent = top.destination.city;
    const price = document.createElement('strong');
    price.className = 'hue';
    price.textContent = `${fmtPrice(top.price)} €`;
    finding.append(city, ` da ${airportName(top.origin)} a `, price, `, weekend ${fmtWeekend(top.weekend)}. `,
      under ? `${under} ${under === 1 ? 'volo' : 'voli'} sotto ${ALERT_THRESHOLD} €.` : `Nessun volo sotto ${ALERT_THRESHOLD} €.`);
  }

  list.classList.remove('loading');
  if (!its.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.innerHTML = '<h3>Nessun volo con questi filtri</h3><p>Prova ad alzare il prezzo massimo o a scegliere tutti i weekend.</p><button type="button" class="btn-secondary">Azzera filtri</button>';
    li.querySelector('button').addEventListener('click', () => { form.reset(); saveFilters(); render(); });
    list.replaceChildren(all.length ? li : emptyNoData());
  } else {
    list.replaceChildren(...its.slice(0, shown).map(renderPass));
  }
  const more = $('more');
  const rest = its.length - shown;
  more.hidden = rest <= 0;
  more.textContent = `Mostra altre ${Math.min(PAGE_SIZE, rest)}`;
  $('count').textContent = its.length
    ? `${Math.min(shown, its.length)} di ${its.length} ${f.perDest ? 'destinazioni' : 'offerte'}`
    : '';
}

function emptyNoData() {
  const li = document.createElement('li');
  li.className = 'empty';
  li.innerHTML = '<h3>Ancora nessun dato</h3><p>La prima ricerca automatica non è ancora terminata. Riprova tra qualche minuto.</p>';
  return li;
}

function renderError(message) {
  list.classList.remove('loading');
  $('finding').textContent = 'Non riesco a caricare le offerte.';
  const li = document.createElement('li');
  li.className = 'empty';
  li.innerHTML = '<h3>Dati non raggiungibili</h3><p></p><button type="button" class="btn-secondary">Riprova</button>';
  li.querySelector('p').textContent = `${message}. Controlla la connessione e riprova.`;
  li.querySelector('button').addEventListener('click', load);
  list.replaceChildren(li);
}

// --- Caricamento ---
async function getJson(name) {
  const res = await fetch(`${DATA_BASE_URL}${name}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${name}`);
  return res.json();
}

async function load() {
  const [d, c] = await Promise.allSettled([getJson('direct.json'), getJson('connections.json')]);
  if (d.status === 'rejected' && c.status === 'rejected') {
    renderError(d.reason.message);
    return;
  }
  files = { direct: d.value ?? files.direct, connections: c.value ?? files.connections };
  all = combine(files.direct, files.connections).filter((it) => it.price <= MAX_PRICE);
  const weekends = [...new Set(all.map((it) => it.weekend))].sort();
  fillSelect($('weekend'), weekends, (w) => `Weekend ${fmtWeekend(w)}`);
  fillSelect($('airline'), airlinesOf(all), (a) => a);
  renderSources(new Date());
  render();
}

function loadingState() {
  list.classList.add('loading');
  list.replaceChildren(...Array.from({ length: 3 }, () => tpl.content.firstElementChild.cloneNode(true)));
}

restoreFilters();
form.addEventListener('input', () => { shown = PAGE_SIZE; saveFilters(); render(); });
form.addEventListener('submit', (e) => e.preventDefault());
$('more').addEventListener('click', () => { shown += PAGE_SIZE; render(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
setInterval(load, REFRESH_MS);
setInterval(() => renderSources(new Date()), 60 * 1000);
loadingState();
load();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* la pagina funziona anche senza */ });
}
