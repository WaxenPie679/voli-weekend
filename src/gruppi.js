// Gruppi di raccolta: lo stesso codice gira una volta per gruppo (env GRUPPO).
// Questo modulo non deve importare filter.js (filter.js importa questo).
const gruppo = (aeroporti, bacino) => Object.freeze({ aeroporti: Object.freeze(aeroporti), bacino });

export const GRUPPI = Object.freeze({
  puglia: gruppo(['BRI', 'BDS'], 'Puglia'),
  milano: gruppo(['MXP', 'LIN'], 'Milano e Bergamo'),
  bergamo: gruppo(['BGY'], 'Milano e Bergamo'),
  roma: gruppo(['FCO', 'CIA'], 'Roma'),
});

export function gruppoDaEnv(env) {
  const nome = env.GRUPPO;
  if (!nome) return 'puglia';
  if (!Object.hasOwn(GRUPPI, nome)) {
    throw new Error(`gruppo sconosciuto: ${nome} (usa puglia, milano, bergamo, roma)`);
  }
  return nome;
}

export const GRUPPO = gruppoDaEnv(process.env);

// Il gruppo puglia mantiene i nomi storici; gli altri hanno il suffisso.
export function dataFile(mode, gruppoNome) {
  return gruppoNome === 'puglia' ? `${mode}.json` : `${mode}-${gruppoNome}.json`;
}

export function historyBranch(gruppoNome) {
  return gruppoNome === 'puglia' ? 'history' : `history-${gruppoNome}`;
}
