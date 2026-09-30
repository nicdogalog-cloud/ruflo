#!/usr/bin/env bash
# Structural smoke test for ruflo-platform-center.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
PASS=0
FAIL=0
step() { printf -- "-> %s ... " "$1"; }
ok()   { printf "PASS\n"; PASS=$((PASS+1)); }
bad()  { printf "FAIL: %s\n" "$1"; FAIL=$((FAIL+1)); }

step "1. plugin.json declares 0.1.0 and the right name"
M="$ROOT/.claude-plugin/plugin.json"
v=$(grep -E '"version"' "$M" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
if [[ "$v" != "0.1.0" ]]; then bad "expected 0.1.0, got '$v'"
elif ! grep -q '"name": "ruflo-platform-center"' "$M"; then bad "name mismatch"
else ok; fi

step "2. all 7 crew agents have name, description and model"
miss=""
for a in nova forge pixel atlas sol ledger cog; do
  f="$ROOT/agents/$a.md"
  [[ -f "$f" ]] || { miss="$miss missing-$a"; continue; }
  for k in "name: $a" 'description:' 'model:'; do
    grep -q "^$k" "$f" || miss="$miss $a-no-${k%%:*}"
  done
done
[[ -z "$miss" ]] && ok || bad "$miss"

step "3. morning-brief and delegate commands present"
miss=""
for c in morning-brief delegate; do
  f="$ROOT/commands/$c.md"
  [[ -f "$f" ]] || { miss="$miss missing-$c"; continue; }
  grep -q "^name: $c" "$f" || miss="$miss $c-no-name"
done
[[ -z "$miss" ]] && ok || bad "$miss"

step "4. agents and commands only use the plugin MCP prefix"
# audit-allow: standalone-mcp-prefix (this check looks for the legacy prefix)
if grep -rq 'mcp__claude-flow__' "$ROOT/agents" "$ROOT/commands"; then bad "legacy prefix found"
elif ! grep -rq 'mcp__plugin_ruflo-core_ruflo__memory_retrieve' "$ROOT/agents" "$ROOT/commands"; then bad "no memory_retrieve reference"
else ok; fi

step "5. city UI files exist in docs/platform-center"
miss=""
for f in index.html styles.css store.js ui.js city.js ai.js panel.js app.js; do
  [[ -f "$REPO/docs/platform-center/$f" ]] || miss="$miss $f"
done
[[ -z "$miss" ]] && ok || bad "missing:$miss"

step "6. registered in the marketplace"
if grep -q '"./plugins/ruflo-platform-center"' "$REPO/.claude-plugin/marketplace.json"; then ok; else bad "no marketplace entry"; fi

printf "\n%d passed, %d failed\n" "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
