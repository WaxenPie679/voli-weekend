export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pausa casuale tra min e max ms (0 nei test). */
export const jitter = (min, max) => sleep(min + Math.random() * (max - min));

export async function fetchJson(fetchImpl, url, init) {
  const res = await fetchImpl(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
  return res.json();
}
