#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

host="https://ghost.customer0.dev"
repo="https://github.com/acoyfellow/ghost.git"
fail() { echo "GATE FAIL: $*" >&2; exit 1; }

echo "== fit"
shared="$HOME/cloudflare/.context/bin/spike-fit.ts"
[ ! -f "$shared" ] || cmp -s fit/spike-fit.ts "$shared" || fail "fit/spike-fit.ts differs from the shared copy; run spike-fit-sync"
bun fit/spike-fit.ts . || fail "fit"

echo "== code"
bun test ./eval >/dev/null 2>&1 || fail "tests"

echo "== eval"
bun eval/verify-frozen.ts || fail "eval/raw does not match eval/frozen.json"
committed=$(bun -e 'const r=require("./eval/receipt.json");console.log(JSON.stringify([r.verdict,r.systems.map(s=>[s.system,s.worstF1,s.bestF1])]))')
bash eval/score.sh >/dev/null || fail "score"
recomputed=$(bun -e 'const r=require("./eval/receipt.json");console.log(JSON.stringify([r.verdict,r.systems.map(s=>[s.system,s.worstF1,s.bestF1])]))')
git checkout -- eval/receipt.json
[ "$committed" = "$recomputed" ] || fail "committed receipt does not match the recomputed scores"
verdict=$(bun -e 'console.log(require("./eval/receipt.json").verdict)')
case "$verdict" in proven|disproven) echo "verdict: $verdict" ;; *) fail "verdict is $verdict" ;; esac

echo "== docs"
for section in "## Why" "## What it does" "## Quick start" "## Proof" "## Limits"; do
  grep -q "^$section" README.md || fail "README missing $section"
done

echo "== live"
for path in / /llms.txt /proof.json; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "$host$path")
  [ "$code" = "200" ] || fail "$host$path answered $code"
done
page=$(curl -s -m 20 "$host/")
echo "$page" | grep -q "$verdict" || fail "live page does not show the verdict"
for f1 in $(bun -e 'const r=require("./eval/receipt.json");console.log(r.systems.map(s=>s.system==="ghost-local"?s.worstF1:s.bestF1).join(" "))'); do
  echo "$page" | grep -q "$f1" || fail "live page does not show F1 $f1"
done

echo "== public"
[ -z "$(git status --porcelain)" ] || fail "tree not clean"
remote_head=$(git ls-remote "$repo" refs/heads/main | cut -f1)
[ "$(git rev-parse HEAD)" = "$remote_head" ] || fail "GitHub main $remote_head != local HEAD"

echo "== hygiene"
gitleaks git . --no-banner >/dev/null 2>&1 || fail "gitleaks found secrets"
if git ls-files | grep -E '(^|/)\.real/|\.jpe?g$|\.png$|probe-key'; then fail "raw frames or keys are tracked"; fi
if git grep -nE 'cfdata\.org|@cloudflare\.com|BEGIN [A-Z ]*PRIVATE KEY' -- . ':!proof/gate.sh'; then fail "internal text in tree"; fi

echo "ghost gate: pass"
