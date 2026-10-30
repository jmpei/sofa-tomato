#!/bin/sh
# Runs one headless Claude Code session in runs/<name> with the HW3 prompt.
# Usage: RUNS=<folder outside ~> ./run.sh <run-name>    Output: logs/<run-name>.jsonl (stream-json transcript)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
NAME="$1"
mkdir -p "$HERE/logs"
echo '{"mcpServers":{}}' > "$HERE/logs/empty-mcp.json"
PROMPT='Implement GitHub issue #3, "Export my movies as a CSV file": on the Movies page, let me download all my movies (watched and watchlist) as a CSV file. Create a branch, add tests, run them, and commit.'
cd "${RUNS:?set RUNS to the run-copies folder}/$NAME"
date +%s > "$HERE/logs/$NAME.start"
claude -p "$PROMPT" \
  --model claude-sonnet-5-5 \
  --setting-sources project,local \
  --strict-mcp-config --mcp-config "$HERE/logs/empty-mcp.json" \
  --permission-mode acceptEdits \
  --allowedTools "Bash(npm:*)" "Bash(npx:*)" "Bash(node:*)" "Bash(git:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(grep:*)" "Bash(find:*)" "Bash(sed:*)" "Bash(head:*)" "Bash(tail:*)" "Bash(wc:*)" "Bash(mkdir:*)" \
  --disallowedTools WebFetch WebSearch \
  --max-budget-usd 8 \
  --output-format stream-json --verbose \
  > "$HERE/logs/$NAME.jsonl" 2> "$HERE/logs/$NAME.err"
date +%s > "$HERE/logs/$NAME.end"
