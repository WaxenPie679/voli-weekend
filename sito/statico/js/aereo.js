// L'aereo dell'apertura (home e pagine dei bacini, una volta per visita): entra da destra nella fascia sopra
// il titolo, vira verso l'alto e atterra nel logo, dove diventa la D. Lo fa partire il pezzo in intestazione.js,
// che segna la pagina con .aereo-in-volo solo se il movimento va bene; qui l'aereo vola e poi si toglie il segno.
// Se qualcosa manca, la D torna subito al suo posto (e comunque il CSS la rimette dopo 3 s).
const radice = document.documentElement;

// Le misure della D nel disegno del logo (unità del viewBox): larga 70,44, alta 69,35; l'asta sta a 21,64.
const LARGA = 70.44;
const ALTA = 69.35;
const ASTA_X = 21.64;
const MEZZO_Y = 34.67;

const fine = aereo => {
  aereo?.remove();
  radice.classList.remove('aereo-in-volo');
};

async function vola() {
  const logo = document.querySelector('.intestazione__logo .logo');
  const testata = document.querySelector('.intestazione');
  const titolo = document.querySelector('.apertura h1');
  const pezzi = logo ? [...logo.querySelectorAll('.logo__d path')].map(p => p.getAttribute('d')) : [];
  if (!titolo || !testata || pezzi.length !== 3 || typeof Element.prototype.animate !== 'function') return fine();
  const [pancia, ala, asta] = pezzi;

  // Aspetta i caratteri (sono già precaricati) così il titolo è al suo posto quando si misura.
  await Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 300))]);

  const r = logo.getBoundingClientRect();
  const k = r.height / ALTA;
  const ns = 'http://www.w3.org/2000/svg';
  const aereo = document.createElementNS(ns, 'svg');
  aereo.setAttribute('viewBox', `0 0 ${LARGA} ${ALTA}`);
  aereo.setAttribute('aria-hidden', 'true');
  aereo.setAttribute('class', 'aereo');
  Object.assign(aereo.style, {
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${LARGA * k}px`,
    height: `${r.height}px`,
    transformOrigin: `${ASTA_X * k}px ${MEZZO_Y * k}px`,
  });
  // L'aereo dell'icona app: asta, ala sinistra e la stessa ala ribaltata. La pancia aspetta l'atterraggio.
  aereo.innerHTML = `<g fill="#2A1A14"><path class="aereo__pancia" opacity="0" d="${pancia}"/><path d="${ala}"/><g class="aereo__ala"><path transform="translate(43.28 0) scale(-1 1)" d="${ala}"/></g><path d="${asta}"/></g>`;
  document.body.append(aereo);

  // Il percorso, misurato dalla posizione finale (la D del logo): dritto verso sinistra a metà della fascia
  // tra intestazione e titolo, poi un quarto di cerchio che lo porta su, col muso in alto, dentro il logo.
  const computer = innerWidth >= 900;
  const grande = computer ? 1.6 : 1.15;
  // Sul telefono la fascia è stretta: l'aereo passa appena sotto l'intestazione, sfiorando il titolo che sta comparendo.
  const sotto = testata.getBoundingClientRect().bottom;
  const fascia = Math.max((sotto + titolo.getBoundingClientRect().top) / 2, sotto + (r.height * grande) / 2 + 6);
  const raggio = Math.max(24, fascia - (r.top + MEZZO_Y * k));
  const partenza = Math.max(raggio + 40, innerWidth + 40 - (r.left + ASTA_X * k));
  const dritto = partenza - raggio;
  const curva = Math.PI * raggio / 2;
  const tot = dritto + curva;
  const passo = (x, y, gradi, s) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${gradi.toFixed(1)}deg) scale(${s.toFixed(3)})`;
  const tappe = [{ offset: 0, transform: passo(partenza, raggio, -90, grande) }];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI / 2;
    const quanto = (dritto + raggio * t) / tot;
    const s = grande + (1 - grande) * (i / N);
    tappe.push({ offset: quanto, transform: passo(raggio - raggio * Math.sin(t), raggio * Math.cos(t), -90 + (t * 180) / Math.PI, s) });
  }
  const durata = computer ? 1300 : 1000;
  try {
    await aereo.animate(tappe, { duration: durata, easing: 'cubic-bezier(.3, .2, .25, 1)', fill: 'both' }).finished;
    // Atterrato: l'ala destra si allarga e diventa la pancia della D.
    const origine = { transformOrigin: '27.4px 34.67px' };
    Object.assign(aereo.querySelector('.aereo__pancia').style, origine);
    await Promise.all([
      aereo.querySelector('.aereo__pancia').animate(
        [{ opacity: 0, transform: 'scaleX(.37)' }, { opacity: 1, transform: 'scaleX(1)' }],
        { duration: 280, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'both' },
      ).finished,
      aereo.querySelector('.aereo__ala').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'both' }).finished,
    ]);
  } catch {
    // Animazione interrotta: la D torna al suo posto.
  }
  fine(aereo);
}

if (radice.classList.contains('aereo-in-volo')) vola().catch(() => fine());
