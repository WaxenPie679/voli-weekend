#!/usr/bin/env bash
# Prepara ./history come worktree del branch `history` (orfano se non esiste ancora).
set -euo pipefail
if git ls-remote --exit-code --heads origin history >/dev/null; then
  git fetch -q --depth 1 origin +refs/heads/history:refs/remotes/origin/history
  git worktree add -q -B history history origin/history
else
  git worktree add -q --orphan -b history history
fi
