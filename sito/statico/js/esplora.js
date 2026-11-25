// L'esploratore nel browser: legge i filtri dall'indirizzo e dal modulo, ridisegna la lista da /voli.json.
// Senza JavaScript (o se voli.json non arriva) la pagina resta quella preparata e il modulo va col GET.
import { biglietto, nessunVolo } from './biglietto-html.js';
import { leggiFiltri, scriviFiltri, filtra, daPartire, riepilogo, filtriPerVolo, altriFiltriAttivi, BLOCCO, PREZZO_MAX } from './logica.js';

const modulo = document.querySelector('form.filtri');
const esploratore = document.querySelector('.esploratore');

const ATTESA_INDIRIZZO = 250;

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

  const scheda = v => biglietto(v, {
    adesso,
    affiliato: p.affiliato,
    altre: futuri.filter(a => a.k !== v.k && a.o === v.o && a.citta === v.citta),
  });

  // Il riquadro canale sta dopo il biglietto `dopo`; se i biglietti sono meno, chiude la lista.
  function disegna() {
    const primi = voli.slice(0, mostrati);
    const pezzi = primi.length
      ? primi.map((v, i) => scheda(v) + (i + 1 === p.dopo ? p.riquadro : ''))
      : [nessunVolo(p.pagina)];
    if (primi.length < p.dopo) pezzi.push(p.riquadro);
    lista.innerHTML = pezzi.join('');
    altri.parentElement.hidden = voli.length <= mostrati;
    riga.textContent = riepilogo(voli.length, filtri, p.nomi);
    if (valoreMax) valoreMax.textContent = String(filtri.max);
  }

  function applica(nuovi) {
    filtri = nuovi;
    voli = filtra(dati.voli, filtri, dati.bacini, adesso);
    mostrati = BLOCCO;
    disegna();
  }

  // Prima apertura: filtri dall'indirizzo. ?volo= apre sempre quel biglietto se il volo esiste:
  // se i filtri lo escludono, si allargano quanto basta e il modulo e l'indirizzo lo dicono.
  const params = new URLSearchParams(location.search);
  applica(leggiFiltri(params, opzioni));
  let testoMeta = (params.get('a') ?? '').trim();
  const chiave = params.get('volo');
  const cercato = futuri.find(v => v.k === chiave);
  if (cercato && !voli.includes(cercato)) {
    applica(filtriPerVolo(filtri, cercato, opzioni));
    if (!filtri.a) testoMeta = '';
    const query = [scriviFiltri(filtri, { bacino: p.bacino }), `volo=${encodeURIComponent(chiave)}`].filter(Boolean).join('&');
    scriviIndirizzo(`?${query}`);
  }
  riempiModulo(filtri, testoMeta);
  const posto = cercato ? voli.indexOf(cercato) : -1;
  if (posto >= 0) {
    mostrati = Math.ceil((posto + 1) / BLOCCO) * BLOCCO;
    disegna();
    const articolo = [...lista.querySelectorAll('article[data-k]')].find(a => a.dataset.k === chiave);
    articolo?.querySelector('details')?.setAttribute('open', '');
    articolo?.scrollIntoView({ block: 'start' });
  }

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
    applica(leggiFiltri(new URLSearchParams(new FormData(modulo)), opzioni));
    clearTimeout(attesa);
    attesa = setTimeout(indirizzoDeiFiltri, ATTESA_INDIRIZZO);
  });
  modulo.addEventListener('submit', evento => {
    evento.preventDefault();
    applica(leggiFiltri(new URLSearchParams(new FormData(modulo)), opzioni));
    clearTimeout(attesa);
    indirizzoDeiFiltri();
  });

  altri.addEventListener('click', () => {
    const prima = mostrati;
    mostrati += BLOCCO;
    lista.insertAdjacentHTML('beforeend', voli.slice(prima, mostrati).map(scheda).join(''));
    altri.parentElement.hidden = voli.length <= mostrati;
    // Chi usa la tastiera continua dal primo biglietto nuovo.
    lista.querySelectorAll('article.biglietto')[prima]?.querySelector('summary')?.focus();
  });
}

if (modulo && esploratore) avvia().catch(e => console.warn('DoVai esplora:', e));
