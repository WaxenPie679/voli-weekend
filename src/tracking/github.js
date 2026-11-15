// Issue GitHub delle tratte seguite: elenco, commenti, chiusura, etichetta.
const API = 'https://api.github.com';
export const LABEL = 'tracking';

/**
 * @param {{repo:string, token:string, fetchImpl?:typeof fetch}} opts  repo come «proprietario/nome»
 */
export function createGitHub({ repo, token, fetchImpl = fetch }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'voli-weekend',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  /** Chiamata all'API; lancia con lo stato HTTP se la risposta non è ok (tranne gli stati in `allow`). */
  async function call(method, path, body, allow = []) {
    const init = { method, headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetchImpl(`${API}/repos/${repo}${path}`, init);
    if (!res.ok && !allow.includes(res.status)) throw new Error(`GitHub HTTP ${res.status} (${method} ${path})`);
    return res;
  }

  return {
    /** Issue aperte con etichetta `tracking` (le pull request sono escluse). */
    async listTrackingIssues() {
      const res = await call('GET', `/issues?state=open&labels=${LABEL}&per_page=100`);
      const list = await res.json();
      return list.filter((i) => !i.pull_request);
    },
    async comment(number, text) {
      await call('POST', `/issues/${number}/comments`, { body: text });
    },
    /** Commento finale, poi chiusura. */
    async close(number, text) {
      await call('POST', `/issues/${number}/comments`, { body: text });
      await call('PATCH', `/issues/${number}`, { state: 'closed' });
    },
    /** Crea l'etichetta `tracking`; se esiste già (422) va bene così. */
    async ensureLabel() {
      await call('POST', '/labels', { name: LABEL, color: '1d76db', description: 'Tratta seguita da Voli Weekend' }, [422]);
    },
  };
}
