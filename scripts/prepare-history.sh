#!/usr/bin/env bash
# Prepara ./history come worktree del branch indicato (orfano se non esiste ancora).
# Uso: scripts/prepare-history.sh [branch]   (default: history; la cartella resta ./history)
set -euo pipefail
branch="${1:-history}"
# --exit-code: 0 = il branch esiste, 2 = non esiste; qualsiasi altro codice è un errore (rete, permessi)
rc=0
git ls-remote --exit-code --heads origin "$branch" >/dev/null || rc=$?
case "$rc" in
  0)
    git fetch -q --depth 1 origin "+refs/heads/$branch:refs/remotes/origin/$branch"
    git worktree add -q -B "$branch" history "origin/$branch"
    ;;
  2)
    git worktree add -q --orphan -b "$branch" history
    ;;
  *)
    echo "impossibile verificare il branch $branch sul remoto (git ls-remote, codice $rc)" >&2
    exit 1
    ;;
esac
