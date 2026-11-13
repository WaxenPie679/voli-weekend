#!/usr/bin/env bash
# Pubblica il riepilogo sul branch `summary`: un solo commit orfano, sostituito ogni notte (push forzato).
# Uso: scripts/publish-summary.sh <cartella del riepilogo>
set -euo pipefail
src="$(cd "$1" && pwd)"
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
tmp="$(mktemp -d)"
wt="$tmp/pub"
# Mai dentro il worktree: il trap lo rimuove, e git non può girare con la cartella corrente cancellata
trap 'git worktree remove --force "$wt" 2>/dev/null || true; git worktree prune || true; git branch -D summary-pub >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT
git branch -D summary-pub >/dev/null 2>&1 || true
git worktree add -q --orphan -b summary-pub "$wt"
cp "$src"/*.json "$wt"/
git -C "$wt" config user.name "github-actions[bot]"
git -C "$wt" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git -C "$wt" add -A
git -C "$wt" commit -q -m "Riepilogo $(date -u +%F)"
git -C "$wt" push -q -f origin HEAD:refs/heads/summary
