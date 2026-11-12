#!/usr/bin/env bash
# Pubblica sul branch `history` i file raccolti oggi: un commit nuovo al giorno, che si accumula.
# Uso: scripts/publish-history.sh <cartella storico>
# Mai --amend né push forzato: la storia del branch non si riscrive.
set -euo pipefail
cd "$1"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
# File temporanei di una scrittura interrotta (run.js scrive <file>.tmp e poi rinomina): mai nel commit
find . -path ./.git -prune -o -type f -name '*.tmp' -print -delete
git add -A
if git diff --cached --quiet; then echo "nessuna modifica da pubblicare"; exit 0; fi
# Ogni file del giorno nuovo o cambiato deve essere un gzip integro, altrimenti niente pubblicazione
while IFS= read -r f; do
  if ! gzip -t "$f" 2>/dev/null; then echo "file compresso danneggiato, pubblicazione annullata: $f" >&2; exit 1; fi
done < <(git diff --cached --name-only --diff-filter=AM -- '*.csv.gz')
msg="Storico $(date -u +%F)"
git commit -q -m "$msg"
for attempt in 1 2 3; do
  if git push -q origin HEAD:refs/heads/history; then exit 0; fi
  echo "push rifiutato (tentativo $attempt), mi riallineo e riprovo"
  sleep $((attempt * 5))
  # Il worktree nasce da un fetch --depth 1: un `pull --rebase` ripeterebbe il commit di base
  # (senza genitori) e darebbe conflitti. Si riparte invece dall'ultima versione remota e si
  # rimettono sopra i file del nostro commit (sono file nuovi del giorno), con un commit nuovo.
  ours="$(git rev-parse HEAD)"
  git fetch -q --depth 1 origin +refs/heads/history:refs/remotes/origin/history
  git reset -q --hard origin/history
  git checkout -q "$ours" -- .
  git add -A
  if git diff --cached --quiet; then echo "già pubblicato"; exit 0; fi
  git commit -q -m "$msg"
done
exit 1
