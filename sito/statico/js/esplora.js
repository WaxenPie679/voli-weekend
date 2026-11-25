// L'esploratore nel browser: legge i filtri dall'indirizzo e dal modulo, ridisegna la lista da /voli.json.
// Senza JavaScript (o se voli.json non arriva) la pagina resta quella preparata e il modulo va col GET.
import { biglietto, nessunVolo } from './biglietto-html.js';
import { leggiFiltri, scriviFiltri, filtra, daPartire, riepilogo, filtriPerVolo, altriFiltriAttivi, BLOCCO, PREZZO_MAX } from './logica.js';

const modulo = document.querySelector('form.filtri');
const esploratore = document.querySelector('.esploratore');

const ATTESA_INDIRIZZO = 250;
// Sotto questa larghezza il volo del giorno non sta nell'apertura (vedi .del-giorno nel CSS).
const TELEFONO = matchMedia('(max-width: 899px)');

// Il movimento della lista (View Transitions): solo dove il browser lo sa fare e il movimento va bene.
// Altrove la lista cambia di colpo, come prima.
const muovi = () => typeof document.startViewTransition === 'function'
  && !matchMedia('(prefers-reduced-motion: reduce)').matches;

// Ogni biglietto ha il suo nome di transizione (dalla chiave del volo): così chi resta scorre al nuovo posto.
function nomina(lista) {
  for (const a of lista.querySelectorAll('article[data-k]')) {
    a.style.viewTransitionName = `v-${a.dataset.k.replace(/[^\w-]/g, '-')}`;
  }
  const riquadro = lista.querySelector('.riquadro');
  if (riquadro) riquadro.style.viewTransitionName = 'riquadro-canale';
}

// Cambia la query dell'indirizzo senza ricaricare, tenendo l'eventuale #ancora.
// Alcuni browser limitano o vietano replaceState: allora l'indirizzo resta com'è.
function scriviIndirizzo(query) {
  try {
    history.replaceState(history.state, '', location.pathname + query + location.hash);
  } catch {
    // L'indirizzo non cambia; la lista è già giusta.
  }
}

async function caricaVoli() {
  try {
    const risposta = await fetch('/voli.json');
    if (!risposta.ok) return null;
    const dati = await risposta.json();
    return Array.isArray(dati?.voli) && Array.isArray(dati?.bacini) ? dati : null;
  } catch {
    return null;
  }
}

// Quello che la pagina preparata sa già: bacino, mesi liberi, nomi da mostrare, affiliato, riquadro.
function leggiPagina() {
  const da = modulo.elements.da;
  const scelto = [...da.options].find(o => o.defaultSelected)?.value;
  return {
    bacino: scelto && scelto !== 'tutti' ? scelto : undefined,
    mesi: [...modulo.elements.mese.options].map(o => o.value).filter(v => v !== 'tre'),
    nomi: Object.fromEntries([...da.options].map(o => [o.value, o.textContent.trim()])),
    pagina: modulo.getAttribute('action') || location.pathname,
    affiliato: esploratore.dataset.affiliato ?? '',
    dopo: Number(esploratore.dataset.dopo) || 0,
    riquadro: esploratore.querySelector('.riquadro')?.outerHTML ?? '',
  };
}

function riempiModulo(filtri, testoMeta) {
  const campi = modulo.elements;
  campi.da.value = filtri.da;
  campi.mese.value = filtri.mese;
  campi.max.value = String(filtri.max);
  campi.resta.value = String(filtri.resta);
  campi.a.value = testoMeta;
  // Se l'indirizzo sceglie mese, permanenza o meta, «Altri filtri» si apre: chi arriva vede cosa è attivo.
  if (altriFiltriAttivi({ ...filtri, a: testoMeta })) modulo.querySelector('.filtri__altri')?.setAttribute('open', '');
}

function bottoneAltri() {
  let bottone = esploratore.querySelector('[data-altri]');
  if (!bottone) {
    esploratore.insertAdjacentHTML('beforeend', '<p class="altri" hidden><button class="bottone bottone--contorno" type="button" data-altri>Mostra altri voli</button></p>');
    bottone = esploratore.querySelector('[data-altri]');
  }
  return bottone;
}

async function avvia() {
  const dati = await caricaVoli();
  if (!dati) return;

  const p = leggiPagina();
  // Con JavaScript la lista cambia mentre si sceglie: «Mostra i voli» serve solo senza.
  modulo.classList.add('filtri--vivo');
  const opzioni = { bacino: p.bacino, bacini: dati.bacini, mesi: p.mesi };
  const lista = esploratore.querySelector('.biglietti');
  const altri = bottoneAltri();
  const riga = modulo.querySelector('.filtri__riepilogo');
  const valoreMax = modulo.querySelector('#f-max-valore');
  const adesso = new Date();
  // voli.json può avere qualche ora: i voli partiti nel frattempo non si mostrano, nemmeno tra le altre date.
  const futuri = daPartire(dati.voli, adesso);
  let filtri;
  let voli = [];
  let mostrati = 0;
  let primoDisegno = true;

  const scheda = (v, tabellone = false) => biglietto(v, {
    adesso,
    tabellone,
    affiliato: p.affiliato,
    altre: futuri.filter(a => a.k !== v.k && a.o === v.o && a.citta === v.citta),
  });

  // Il riquadro canale sta dopo il biglietto `dopo`; se i biglietti sono meno, chiude la lista.
  function disegna() {
    const primi = voli.slice(0, mostrati);
    const pezzi = primi.length
      ? primi.map((v, i) => scheda(v, primoDisegno && i === 0) + (i + 1 === p.dopo ? p.riquadro : ''))
      : [nessunVolo(p.pagina)];
    if (primi.length < p.dopo) pezzi.push(p.riquadro);
    lista.innerHTML = pezzi.join('');
    altri.parentElement.hidden = voli.length <= mostrati;
    riga.textContent = riepilogo(voli.length, filtri, p.nomi);
    if (valoreMax) valoreMax.textContent = String(filtri.max);
    // Sul telefono il volo del giorno è il primo della lista: al primo disegno il suo prezzo gira
    // come un tabellone e poi il timbro batte (da computer lo fa il biglietto dell'apertura).
    if (primoDisegno && TELEFONO.matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      lista.querySelector('article .bollino')?.classList.add('bollino--gira');
    }
    primoDisegno = false;
  }

  function applica(nuovi) {
    filtri = nuovi;
    voli = filtra(dati.voli, filtri, dati.bacini, adesso);
    mostrati = BLOCCO;
    disegna();
  }

  // Quando cambia un filtro i biglietti che restano scorrono al nuovo posto, gli esclusi escono, i nuovi arrivano.
  // Se la lista non cambia (stessi voli, stesso ordine) non si anima niente. Mentre si trascina il cursore
  // del prezzo, una transizione nuova chiude subito quella in corso.
  let inCorso = null;
  const chiavi = () => voli.slice(0, mostrati).map(v => v.k).join();
  function applicaMuovendo(nuovi) {
    const prima = chiavi();
    if (!muovi()) return applica(nuovi);
    inCorso?.skipTransition();
    let cambiata = false;
    const radice = document.documentElement;
    radice.classList.add('vt-lista');
    nomina(lista);
    const t = document.startViewTransition(() => {
      applica(nuovi);
      cambiata = chiavi() !== prima;
      if (cambiata) nomina(lista);
    });
    inCorso = t;
    t.ready.then(() => { if (!cambiata) t.skipTransition(); }).catch(() => {});
    t.finished.finally(() => {
      if (inCorso === t) { inCorso = null; radice.classList.remove('vt-lista'); }
    });
  }

  // Apre un volo nella lista: se i filtri lo escludono si allargano quanto basta, e il modulo e l'indirizzo
  // lo dicono. Mostra abbastanza biglietti da arrivarci, lo apre e lo restituisce.
  let testoMeta = '';
  function apriVolo(cercato) {
    const escluso = !voli.includes(cercato);
    if (escluso) {
      applica(filtriPerVolo(filtri, cercato, opzioni));
      if (!filtri.a) testoMeta = '';
    }
    if (escluso) {
      const query = [scriviFiltri(filtri, { bacino: p.bacino }), `volo=${encodeURIComponent(cercato.k)}`].filter(Boolean).join('&');
      scriviIndirizzo(`?${query}`);
    }
    riempiModulo(filtri, testoMeta);
    const posto = voli.indexOf(cercato);
    if (posto < 0) return null;
    mostrati = Math.max(mostrati, Math.ceil((posto + 1) / BLOCCO) * BLOCCO);
    disegna();
    const articolo = [...lista.querySelectorAll('article[data-k]')].find(a => a.dataset.k === cercato.k);
    articolo?.querySelector('details')?.setAttribute('open', '');
    return articolo ?? null;
  }

  // Prima apertura: filtri dall'indirizzo. ?volo= apre sempre quel biglietto se il volo esiste.
  const params = new URLSearchParams(location.search);
  applica(leggiFiltri(params, opzioni));
  testoMeta = (params.get('a') ?? '').trim();
  const cercato = futuri.find(v => v.k === params.get('volo'));
  if (cercato) apriVolo(cercato)?.scrollIntoView({ block: 'start' });
  else riempiModulo(filtri, testoMeta);

  // Le mete suggerite nel campo «Dove vuoi andare».
  const mete = modulo.querySelector('#f-a-mete');
  if (mete) {
    const tutte = filtra(dati.voli, { da: p.bacino ?? 'tutti', mese: 'tre', max: PREZZO_MAX, resta: 0, a: '' }, dati.bacini, adesso);
    mete.replaceChildren(...[...new Set(tutte.map(v => v.citta))].sort((x, y) => x.localeCompare(y, 'it')).map(c => new Option(c)));
  }

  // La lista si ridisegna subito; l'indirizzo si aggiorna quando ci si ferma un attimo.
  let attesa;
  const indirizzoDeiFiltri = () => {
    const query = scriviFiltri(filtri, { bacino: p.bacino });
    scriviIndirizzo(query ? `?${query}` : '');
  };
  modulo.addEventListener('input', () => {
    applicaMuovendo(leggiFiltri(new URLSearchParams(new FormData(modulo)), opzioni));
    clearTimeout(attesa);
    attesa = setTimeout(indirizzoDeiFiltri, ATTESA_INDIRIZZO);
  });
  modulo.addEventListener('submit', evento => {
    evento.preventDefault();
    applicaMuovendo(leggiFiltri(new URLSearchParams(new FormData(modulo)), opzioni));
    clearTimeout(attesa);
    indirizzoDeiFiltri();
  });

  altri.addEventListener('click', () => {
    const prima = mostrati;
    mostrati += BLOCCO;
    lista.insertAdjacentHTML('beforeend', voli.slice(prima, mostrati).map(scheda).join(''));
    altri.parentElement.hidden = voli.length <= mostrati;
    // I nuovi arrivano in fila (il CSS li anima solo se il movimento va bene).
    [...lista.querySelectorAll('article.biglietto')].slice(prima).forEach((a, i) => {
      a.style.setProperty('--i', String(Math.min(i, 12)));
      a.classList.add('biglietto--arriva');
    });
    // Chi usa la tastiera continua dal primo biglietto nuovo.
    lista.querySelectorAll('article.biglietto')[prima]?.querySelector('summary')?.focus();
  });
}

if (modulo && esploratore) avvia().catch(e => console.warn('DoVai esplora:', e));
