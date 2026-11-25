// Il <head> di ogni pagina: meta, anteprima del link, caratteri nostri e, se c'è il token, Cloudflare Web Analytics.
import { h, grezzo } from '../statico/js/html.js';
import { SITO } from '../config.js';

// I caratteri da caricare subito (gli altri pesi stanno negli stessi file variabili).
const CARATTERI = ['dm-sans.woff2', 'gabarito.woff2', 'jetbrains-mono.woff2'];

function beacon() {
  const token = process.env.CF_BEACON?.trim();
  if (!token) return '';
  return h`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon="${JSON.stringify({ token })}"></script>`;
}

export function testa({ titolo, descrizione, percorso, indicizza }) {
  const indirizzo = SITO + percorso;
  const precarica = CARATTERI.map(f => grezzo(h`<link rel="preload" href="/caratteri/${f}" as="font" type="font/woff2" crossorigin>\n`));
  return h`<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titolo}</title>
<meta name="description" content="${descrizione}">
<link rel="canonical" href="${indirizzo}">
${grezzo(indicizza ? '' : '<meta name="robots" content="noindex">\n')}<meta property="og:type" content="website">
<meta property="og:site_name" content="DoVai">
<meta property="og:locale" content="it_IT">
<meta property="og:title" content="${titolo}">
<meta property="og:description" content="${descrizione}">
<meta property="og:url" content="${indirizzo}">
<meta name="theme-color" content="#FFDD45">
<link rel="icon" href="/img/favicon.ico" sizes="any">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
${precarica}<link rel="stylesheet" href="/css/sito.css">
${grezzo(beacon())}
</head>`;
}
