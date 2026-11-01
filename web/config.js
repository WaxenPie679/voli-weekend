// Dati pubblicati da GitHub Actions sul branch `data`. Con ?sample=1 si usano i dati di esempio locali.
export const DATA_BASE_URL = new URLSearchParams(location.search).has('sample')
  ? './sample/'
  : 'https://raw.githubusercontent.com/WaxenPie679/voli-weekend/data/';

export const PAGE_SIZE = 20;
export const ALERT_THRESHOLD = 80;
export const MAX_PRICE = 200;
export const REFRESH_MS = 5 * 60 * 1000;
