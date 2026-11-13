// Dati pubblicati da GitHub Actions sul branch `data`. Con ?sample=1 si usano i dati di esempio locali.
export const DATA_BASE_URL = new URLSearchParams(location.search).has('sample')
  ? './sample/'
  : 'https://raw.githubusercontent.com/WaxenPie679/voli-weekend/data/';

// Riepilogo dello storico prezzi, sul branch `summary` (lo crea il primo giro notturno). Con ?sample=1 i dati di esempio.
export const HISTORY_BASE_URL = new URLSearchParams(location.search).has('sample')
  ? './sample/summary/'
  : 'https://raw.githubusercontent.com/WaxenPie679/voli-weekend/summary/';

export const PAGE_SIZE = 20;
export const ALERT_THRESHOLD = 80;
export const MAX_PRICE = 200;
export const REFRESH_MS = 5 * 60 * 1000;

// Chiave pubblica delle notifiche (la privata è solo nei Secrets di GitHub)
export const VAPID_PUBLIC_KEY = 'BM3YtStpMqHxhFaGmVcYYxsfQN5WTpQW2c3LSIPee_dgGNIysgucdq22uqTAgqjWC4-OXrwgSPIAkPLRMCUQBks';
export const SECRETS_URL = 'https://github.com/WaxenPie679/voli-weekend/settings/secrets/actions/new';
