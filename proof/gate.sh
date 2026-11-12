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
bun test ./gym >/dev/null 2>&1 || fail "gym tests"

echo "== eval"
bun eval/verify-frozen.ts || fail "eval/raw does not match eval/frozen.json"
committed=$(bun -e 'const r=require("./eval/receipt.json");console.log(JSON.stringify([r.verdict,r.systems.map(s=>[s.system,s.worstF1,s.bestF1])]))')
bash eval/score.sh >/dev/null || fail "score"
recomputed=$(bun -e 'const r=require("./eval/receipt.json");console.log(JSON.stringify([r.verdict,r.systems.map(s=>[s.system,s.worstF1,s.bestF1])]))')
git checkout -- eval/receipt.json
[ "$committed" = "$recomputed" ] || fail "committed receipt does not match the recomputed scores"
verdict=$(bun -e 'console.log(require("./eval/receipt.json").verdict)')
case "$verdict" in proven|disproven) echo "verdict: $verdict" ;; *) fail "verdict is $verdict" ;; esac

echo "== compiled"
grep -q '"eval/compiled/rule.ts"' eval/frozen.json || fail "compiled rule is not frozen"
if grep -E '\.real|/Users/|holdout|eval/raw' eval/compiled/tool-calls.jsonl; then fail "compile session touched data outside the dev sandbox"; fi
[ "$(bun -e 'console.log(require("./eval/compiled/sandbox.manifest.json").split)')" = "dev" ] || fail "sandbox was not dev only"
bun -e '
const m=require("./eval/compiled/sandbox.manifest.json");
const h=require("./eval/raw/ghost-compiled.holdout.1.json");
const dev=new Set(m.ids);
const leak=h.rows.filter(r=>dev.has(r.id));
if(leak.length){console.error("holdout ids in sandbox:",leak.length);process.exit(1)}
' || fail "dev and holdout overlap"

echo "== gym"
rule_commit=$(git log --diff-filter=A --format=%H -- gym/RULE.md | tail -1)
gen_commit=$(git log --diff-filter=A --format=%H -- gym/generator/families.ts | tail -1)
[ -n "$rule_commit" ] && [ -n "$gen_commit" ] || fail "gym/RULE.md or the generator is not committed"
git merge-base --is-ancestor "$rule_commit" "$gen_commit" && [ "$rule_commit" != "$gen_commit" ] || fail "gym/RULE.md was not committed before the generator"
frozen_rule=$(git log --format=%H -S 'gym/compiled/rule.ts' -- eval/frozen.json | tail -1)
first_run=$(git log --diff-filter=A --format=%H -- gym/raw/ghost-compiled-v2.1.json | tail -1)
[ -n "$frozen_rule" ] && [ -n "$first_run" ] || fail "candidate rule freeze or its run is not committed"
git merge-base --is-ancestor "$frozen_rule" "$first_run" && [ "$frozen_rule" != "$first_run" ] || fail "candidate rule was not frozen before its scored run"
if grep -E '\.real|gym/generator|\.salt|frames-v2|eval/raw|gym/raw|F3|F6|F7|F9|F10|/Users/' gym/compiled/tool-calls.jsonl; then fail "candidate compile touched data outside its sandbox"; fi
bun -e 'const m=require("./gym/compiled/sandbox.manifest.json");if(JSON.stringify(m.families)!==JSON.stringify(["F1","F2","F4","F5","F8"]))process.exit(1)' || fail "sandbox held more than the train families"
gym_committed=$(bun -e 'const r=require("./gym/receipt.json");console.log(JSON.stringify([r.verdict,r.failing,Object.entries(r.bySystem).map(([k,v])=>[k,v.heldOutF1])]))')
bash gym/score.sh >/dev/null || fail "gym score"
gym_recomputed=$(bun -e 'const r=require("./gym/receipt.json");console.log(JSON.stringify([r.verdict,r.failing,Object.entries(r.bySystem).map(([k,v])=>[k,v.heldOutF1])]))')
git checkout -- gym/receipt.json
[ "$gym_committed" = "$gym_recomputed" ] || fail "gym receipt does not match the recomputed scores"
gym_verdict=$(bun -e 'console.log(require("./gym/receipt.json").verdict)')
case "$gym_verdict" in proven|disproven) echo "gym verdict: $gym_verdict" ;; *) fail "gym verdict is $gym_verdict" ;; esac

echo "== docs"
for section in "## Why" "## What it does" "## Quick start" "## Proof" "## Limits"; do
  grep -q "^$section" README.md || fail "README missing $section"
done

echo "== live"
for path in / /llms.txt /proof.json /proof-real.json /gym /gym/F10/0; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "$host$path")
  [ "$code" = "200" ] || fail "$host$path answered $code"
done
page=$(curl -s -m 20 "$host/")
echo "$page" | grep -q "$verdict" || fail "live page does not show the verdict"
echo "$page" | grep -q "Verdict: <b>$gym_verdict</b>" || fail "live page does not show the gym verdict"
for f1 in $(bun -e 'const r=require("./gym/receipt.json");console.log(Object.values(r.bySystem).map(v=>v.heldOutF1).join(" ")+" "+r.realHoldoutF1)'); do
  echo "$page" | grep -q "$f1" || fail "live page does not show gym F1 $f1"
done
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
