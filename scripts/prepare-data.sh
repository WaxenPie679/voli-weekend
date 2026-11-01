#!/usr/bin/env bash
# Prepara ./data come worktree del branch `data` (orfano se non esiste ancora).
set -euo pipefail
if git ls-remote --exit-code --heads origin data >/dev/null; then
  git fetch -q --depth 1 origin +refs/heads/data:refs/remotes/origin/data
  git worktree add -q -B data data origin/data
else
  git worktree add -q --orphan -b data data
fi
