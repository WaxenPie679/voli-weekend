#!/usr/bin/env bash
# Prepara ./history come worktree del branch `history` (orfano se non esiste ancora).
set -euo pipefail
# --exit-code: 0 = il branch esiste, 2 = non esiste; qualsiasi altro codice è un errore (rete, permessi)
rc=0
git ls-remote --exit-code --heads origin history >/dev/null || rc=$?
case "$rc" in
  0)
    git fetch -q --depth 1 origin +refs/heads/history:refs/remotes/origin/history
    git worktree add -q -B history history origin/history
    ;;
  2)
    git worktree add -q --orphan -b history history
    ;;
  *)
    echo "impossibile verificare il branch history sul remoto (git ls-remote, codice $rc)" >&2
    exit 1
    ;;
esac
