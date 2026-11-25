// Il contatore di DoVai nel browser: manda a /api/conta solo il nome di cosa è successo e la pagina.
// Niente cookie, niente memoria sul telefono, niente servizi di terzi. Se l'invio fallisce non succede niente.

const FILTRO_OGNI_MS = 2000;

// Arrivo da fuori: senza provenienza o da un altro sito.
export function eIngresso(referrer, host) {
  if (!referrer) return true;
  try {
    return new URL(referrer).hostname !== host;
  } catch {
    return true;
  }
}

export const percorsoPulito = percorso => percorso.split(/[?#]/)[0];

// Cosa contare per un clic: il data-conta più vicino. Tasto centrale sì, destro no.
// I campi dei filtri si contano col change, non col clic.
export function daContare({ type, button, target }) {
  if (type === 'auxclick' && button !== 1) return null;
  const el = target?.closest?.('[data-conta]');
  if (!el) return null;
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return null;
  return el.dataset.conta || null;
}

function invia(e) {
  try {
    const corpo = JSON.stringify({ e, p: percorsoPulito(location.pathname) });
    if (navigator.sendBeacon?.('/api/conta', corpo)) return;
    fetch('/api/conta', { method: 'POST', body: corpo, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
  } catch {
    // Un conteggio perso non deve mai disturbare chi visita.
  }
}

function avvia() {
  invia('pagina');
  if (eIngresso(document.referrer, location.hostname)) invia('ingresso');
  const suClic = ev => {
    const nome = daContare(ev);
    if (nome) invia(nome);
  };
  document.addEventListener('click', suClic, { capture: true, passive: true });
  document.addEventListener('auxclick', suClic, { capture: true, passive: true });
  let ultimoFiltro = 0;
  document.addEventListener('change', ev => {
    if (!ev.target?.matches?.('[data-conta="filtro"]')) return;
    const ora = Date.now();
    if (ora - ultimoFiltro < FILTRO_OGNI_MS) return;
    ultimoFiltro = ora;
    invia('filtro');
  }, { capture: true, passive: true });
}

if (typeof document !== 'undefined') avvia();
