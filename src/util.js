export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pausa casuale tra min e max ms (0 nei test). */
export const jitter = (min, max) => sleep(min + Math.random() * (max - min));

export async function fetchJson(fetchImpl, url, init) {
  const res = await fetchImpl(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
  return res.json();
}

/** Status che significano «rallenta»: si riprova dopo una pausa invece di contare un errore. */
const THROTTLE_STATUS = new Set([429, 503]);
export const FETCH_TIMEOUT_MS = 20000;

/** `fetchImpl` con un tempo massimo per ogni chiamata (risposta e corpo compresi). */
export const withTimeout = (fetchImpl, timeoutMs) => (url, init) => fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });

/**
 * Scarica un JSON; su HTTP 429 o 503 (Wizz blocca per circa un minuto con 503 se si va troppo veloci)
 * attende baseMs × 2^tentativo e riprova.
 * Esauriti i tentativi lancia un errore con `rateLimited = true`; gli altri status non ok lanciano subito.
 * Ogni chiamata ha un tempo massimo di `timeoutMs`: scaduto, lancia (conta come richiesta fallita).
 */
export async function fetchRetry(fetchImpl, url, init, { retries = 3, baseMs = 30000, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const timed = withTimeout(fetchImpl, timeoutMs);
  for (let attempt = 0; ; attempt++) {
    const res = await timed(url, init);
    if (res.ok) return res.json();
    if (!THROTTLE_STATUS.has(res.status)) {
      const err = new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
      err.status = res.status;
      throw err;
    }
    if (attempt >= retries) {
      const err = new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
      err.rateLimited = true;
      throw err;
    }
    await sleep(baseMs * 2 ** attempt);
  }
}
