#!/bin/sh
# Prepares four clean run copies OUTSIDE the home folder, so Claude Code's walk up the parent
# folders never reaches ~/.claude/CLAUDE.md (the pilot runs under ~ loaded it as project memory).
# without-*: baseline commit 99d913d, no AGENTS.md.  with-*: same + AGENTS.md v1 from docs/2-agents-md.
# Then saves each copy's /context report to logs/<run>.context.md as proof of what was loaded.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="${REPO:-$(git -C "$HERE" rev-parse --show-toplevel)}"
RUNS="$1"
mkdir -p "$RUNS" "$HERE/logs"
for r in without-1 without-2 with-1 with-2; do
  d="$RUNS/$r"
  [ -d "$d" ] || { git clone -q "$REPO" "$d"; git -C "$d" remote remove origin; }
  git -C "$d" checkout -q -B main 99d913d
  git -C "$d" for-each-ref --format='%(refname:short)' refs/heads | grep -vx main | xargs -n1 git -C "$d" branch -q -D 2>/dev/null || true
  git -C "$d" clean -fdq -e node_modules
  [ -d "$d/node_modules" ] || (cd "$d" && npm ci --silent >/dev/null 2>&1)
  case "$r" in with-*)
    git -C "$REPO" show docs/2-agents-md:AGENTS.md > "$d/AGENTS.md"
    git -C "$d" add AGENTS.md
    git -C "$d" commit -q -m "docs: add AGENTS.md v1 (#2)";;
  esac
  (cd "$d" && claude -p "/context" --setting-sources project,local > "$HERE/logs/$r.context.md" 2>&1)
  printf '== %s  %s  %s\n' "$r" "$(git -C "$d" log --oneline -1)" "$(sed -n '/### Memory Files/,/### Skills/p' "$HERE/logs/$r.context.md" | grep '^| Project\|^| User' || echo 'memory files: none')"
done
