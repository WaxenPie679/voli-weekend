// Lettura e scrittura del corpo di una issue «tratta seguita».
// Gira sia in Node (via src/tracking/spec.js) sia nel browser: niente moduli
// esterni, solo Date in UTC su stringhe ISO.

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const GIORNI_INTERI = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'];
const CITTA = { BRI: 'Bari', BDS: 'Brindisi', DBV: 'Dubrovnik' };

const senzaAccenti = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const chiave = (s) => senzaAccenti(s).toLowerCase().trim().replace(/\s+/g, ' ');

function dataValida(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Legge righe «chiave: valore»; le chiavi sconosciute vengono ignorate.
function leggiRighe(body) {
  const campi = {};
  for (const riga of String(body ?? '').split(/\r?\n/)) {
    const m = riga.match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const k = chiave(m[1]);
    if (!(k in campi)) campi[k] = m[2];
  }
  return campi;
}

export function parseTracking(body, { today }) {
  const c = leggiRighe(body);
  const errors = [];

  const aeroporto = (k, etichetta) => {
    const v = (c[k] ?? '').trim();
    if (!v) { errors.push(`Manca «${k}»: scrivi il codice aeroporto di ${etichetta} (3 lettere).`); return null; }
    if (!/^[A-Za-z]{3}$/.test(v)) { errors.push(`«${k}» non è un codice aeroporto di 3 lettere: «${v}».`); return null; }
    return v.toUpperCase();
  };
  const from = aeroporto('da', 'partenza');
  const to = aeroporto('a', 'arrivo');
  if (from && to && from === to) errors.push('«da» e «a» sono lo stesso aeroporto.');

  let roundTrip = true;
  if (c.tipo !== undefined && c.tipo !== '') {
    const t = chiave(c.tipo);
    if (t.includes('solo')) roundTrip = false;
    else if (t.includes('ritorno')) roundTrip = true;
    else errors.push(`«tipo» non riconosciuto: «${c.tipo}» (usa «andata e ritorno» oppure «solo andata»).`);
  }

  let mode = 'finestra';
  if (c.date !== undefined && c.date !== '') {
    const d = chiave(c.date);
    if (d.startsWith('precis')) mode = 'precise';
    else if (d.startsWith('finestr')) mode = 'finestra';
    else errors.push(`«date» non riconosciuto: «${c.date}» (usa «finestra» oppure «precise»).`);
  }

  let people = 1;
  if (c.persone !== undefined && c.persone !== '') {
    const n = Number(c.persone);
    if (!/^\d+$/.test(c.persone.trim()) || n < 1 || n > 9) errors.push(`«persone» deve essere un numero da 1 a 9 (trovato «${c.persone}»).`);
    else people = n;
  }

  const t = { from, to, roundTrip, mode, people, name: (c.nome ?? '').trim() };

  if (mode === 'precise') {
    const out = (c.andata ?? '').trim();
    if (!out) errors.push('Manca «andata»: scrivi la data di andata (AAAA-MM-GG).');
    else if (!dataValida(out)) errors.push(`«andata» non è una data valida (AAAA-MM-GG): «${out}».`);
    else if (out < today) errors.push(`«andata» è già passata: ${out}.`);
    else t.out = out;
    if (roundTrip) {
      const back = (c.ritorno ?? '').trim();
      if (!back) errors.push('Manca «ritorno»: scrivi la data di ritorno (AAAA-MM-GG) oppure usa «tipo: solo andata».');
      else if (!dataValida(back)) errors.push(`«ritorno» non è una data valida (AAAA-MM-GG): «${back}».`);
      else if (t.out && back < t.out) errors.push(`«ritorno» (${back}) è prima dell’andata (${t.out}).`);
      else if (back < today) errors.push(`«ritorno» è già passata: ${back}.`);
      else t.back = back;
    }
  } else {
    const mesiTesto = (c.mesi ?? '').trim();
    if (!mesiTesto) errors.push('Manca «mesi»: elenca i mesi come AAAA-MM, separati da virgola.');
    else {
      const mesi = [];
      for (const m of mesiTesto.split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) errors.push(`«mesi»: «${m}» non è un mese valido (usa AAAA-MM).`);
        else if (!mesi.includes(m)) mesi.push(m);
      }
      mesi.sort();
      if (mesi.length && mesi.every((m) => m < today.slice(0, 7))) errors.push('«mesi»: tutti i mesi indicati sono già passati.');
      else if (mesi.length) t.months = mesi;
    }

    const giorniTesto = (c.giorni ?? '').trim();
    if (!giorniTesto) errors.push('Manca «giorni»: elenca i giorni di partenza (es. gio, ven) oppure «tutti».');
    else {
      const giorni = new Set();
      let tutti = false;
      for (const w of giorniTesto.split(/[\s,;]+/).map(chiave).filter((x) => x && x !== 'e')) {
        if (w === 'tutti' || w === 'tutto') { tutti = true; continue; }
        let i = GIORNI.indexOf(w);
        if (i < 0) i = GIORNI_INTERI.indexOf(w);
        if (i < 0) errors.push(`«giorni»: «${w}» non è un giorno (usa lun mar mer gio ven sab dom).`);
        else giorni.add(i + 1);
      }
      if (tutti) t.weekdays = [1, 2, 3, 4, 5, 6, 7];
      else if (giorni.size) t.weekdays = [...giorni].sort((x, y) => x - y);
    }

    if (roundTrip) {
      const nottiTesto = (c.notti ?? '').trim();
      if (!nottiTesto) errors.push('Manca «notti»: scrivi un numero (es. 7) o un intervallo (es. 5-7).');
      else {
        const m = nottiTesto.match(/^(\d+)\s*(?:[-–—]|a)?\s*(\d+)?$/);
        if (!m || (m[2] === undefined && /\d\s+\d/.test(nottiTesto))) errors.push(`«notti» non è un numero o un intervallo: «${nottiTesto}».`);
        else {
          const min = Number(m[1]);
          const max = m[2] === undefined ? min : Number(m[2]);
          if (min < 1) errors.push('«notti» deve essere almeno 1.');
          else if (min > max) errors.push(`«notti»: il minimo (${min}) supera il massimo (${max}).`);
          else t.nights = [min, max];
        }
      }
    }
  }

  if (errors.length) return { tracking: null, errors };
  return { tracking: t, errors: [] };
}

export function formatBody(t) {
  const righe = [`da: ${t.from}`, `a: ${t.to}`, `tipo: ${t.roundTrip ? 'andata e ritorno' : 'solo andata'}`, `date: ${t.mode}`];
  if (t.mode === 'precise') {
    righe.push(`andata: ${t.out}`);
    if (t.roundTrip) righe.push(`ritorno: ${t.back}`);
  } else {
    righe.push(`mesi: ${t.months.join(', ')}`);
    righe.push(`giorni: ${t.weekdays.length === 7 ? 'tutti' : t.weekdays.map((d) => GIORNI[d - 1]).join(', ')}`);
    if (t.roundTrip) righe.push(`notti: ${t.nights[0] === t.nights[1] ? t.nights[0] : `${t.nights[0]}-${t.nights[1]}`}`);
  }
  righe.push(`persone: ${t.people}`);
  if (t.name) righe.push(`nome: ${t.name}`);
  return righe.join('\n');
}

function dataBreve(iso, conAnno) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MESI_BREVI[m - 1]}${conAnno ? ` ${y}` : ''}`;
}

export function describeTracking(t) {
  const citta = (c) => CITTA[c] ?? c;
  const parti = [`${citta(t.from)} → ${citta(t.to)}${t.roundTrip ? ' e ritorno' : ''}`];
  if (t.mode === 'precise') {
    if (t.roundTrip) {
      const stessoAnno = t.out.slice(0, 4) === t.back.slice(0, 4);
      parti.push(stessoAnno ? `${dataBreve(t.out, false)} → ${dataBreve(t.back, true)}` : `${dataBreve(t.out, true)} → ${dataBreve(t.back, true)}`);
    } else parti.push(dataBreve(t.out, true));
  } else {
    const anni = new Set(t.months.map((m) => m.slice(0, 4)));
    const nome = (m) => MESI[Number(m.slice(5)) - 1];
    parti.push(anni.size === 1
      ? `${t.months.map(nome).join(', ')} ${[...anni][0]}`
      : t.months.map((m) => `${nome(m)} ${m.slice(0, 4)}`).join(', '));
    parti.push(t.weekdays.length === 7 ? 'tutti i giorni' : t.weekdays.map((d) => GIORNI[d - 1]).join(', '));
    if (t.roundTrip) {
      const [a, b] = t.nights;
      parti.push(a === b ? `${a} ${a === 1 ? 'notte' : 'notti'}` : `${a}–${b} notti`);
    }
  }
  parti.push(`${t.people} ${t.people === 1 ? 'persona' : 'persone'}`);
  return parti.join(' · ');
}

// JSON stabile: chiavi in ordine fisso, così una modifica vera cambia il valore.
export function trackingHash(t) {
  return JSON.stringify([t.from, t.to, !!t.roundTrip, t.mode, t.out ?? null, t.back ?? null, t.months ?? null, t.weekdays ?? null, t.nights ?? null, t.people, t.name ?? '']);
}

// FNV-1a a 32 bit sul testo normalizzato (sincrono, uguale in Node e nel browser).
export function bodyHash(body) {
  const testo = String(body ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < testo.length; i++) {
    h ^= testo.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
