#!/usr/bin/env bash
# Pubblica il riepilogo sul branch `summary`: un solo commit orfano, sostituito ogni notte (push forzato).
# Uso: scripts/publish-summary.sh <cartella del riepilogo>   (da lanciare dalla radice del repo)
set -euo pipefail
src="$(cd "$1" && pwd)"
tmp="$(mktemp -d)"
wt="$tmp/pub"
trap 'git worktree remove --force "$wt" 2>/dev/null || true; git worktree prune; git branch -D summary-pub >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
git worktree add -q --orphan -b summary-pub "$wt"
cp "$src"/*.json "$wt"/
cd "$wt"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -q -m "Riepilogo $(date -u +%F)"
git push -q -f origin HEAD:refs/heads/summary
