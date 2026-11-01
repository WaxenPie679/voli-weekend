import { isValid } from './filter.js';

/**
 * Aggiorna un file dati con il risultato di una fonte.
 * Se la fonte fallisce si tengono i suoi itinerari precedenti, segnando l'errore.
 */
export function mergeSource(prevFile, sourceName, result, now) {
  const nowIso = now.toUTC().toISO();
  const prevItins = prevFile?.itineraries ?? [];
  const prevStatus = prevFile?.sources?.[sourceName];
  const own = result.ok ? result.itineraries : prevItins.filter((i) => i.source === sourceName);
  const others = prevItins.filter((i) => i.source !== sourceName);

  const byId = new Map();
  for (const it of [...others, ...own]) {
    if (!isValid(it, now)) continue;
    const prev = byId.get(it.id);
    if (!prev || it.price < prev.price) byId.set(it.id, it);
  }

  return {
    generatedAt: nowIso,
    sources: {
      ...(prevFile?.sources ?? {}),
      [sourceName]: result.ok
        ? { status: 'ok', error: null, lastSuccessAt: nowIso }
        : { status: 'error', error: result.error, lastSuccessAt: prevStatus?.lastSuccessAt ?? null },
    },
    itineraries: [...byId.values()].sort((a, b) => a.price - b.price),
  };
}
