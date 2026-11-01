#!/usr/bin/env bash
# Pubblica i file indicati sul branch `data`, che contiene sempre un solo commit.
# Uso: scripts/publish-data.sh <cartella dati> <file>...
# Si riallinea all'ultima versione remota prima del push, così le due ricerche non si sovrascrivono.
set -euo pipefail
dir="$1"; shift
tmp="$(mktemp -d)"
for f in "$@"; do
  if [ -f "$dir/$f" ]; then cp "$dir/$f" "$tmp/"; fi
done
cd "$dir"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
for attempt in 1 2 3; do
  if git ls-remote --exit-code --heads origin data >/dev/null; then
    git fetch -q --depth 1 origin +refs/heads/data:refs/remotes/origin/data
    git reset -q --hard origin/data
  fi
  cp "$tmp"/* . 2>/dev/null || true
  git add -A
  if git rev-parse -q --verify HEAD >/dev/null; then
    git commit -q --amend -m "Dati aggiornati $(date -u +%FT%TZ)"
  else
    git commit -q -m "Dati aggiornati $(date -u +%FT%TZ)"
  fi
  # Il lease fallisce se nel frattempo l'altra ricerca ha pubblicato: si riparte dall'ultima versione
  expected="$(git rev-parse -q --verify refs/remotes/origin/data || true)"
  if git push -q --force-with-lease=refs/heads/data:"$expected" origin HEAD:refs/heads/data; then exit 0; fi
  echo "push fallito (tentativo $attempt), riprovo"; sleep $((attempt * 5))
done
exit 1
