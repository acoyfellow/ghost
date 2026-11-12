#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
real=$(bun gym/compare-real.ts gym/real/ghost-compiled-v2.holdout.1.json gym/real/ghost-compiled-v2.holdout.1.json | head -1 | sed 's/^left //' | bun -e 'const t=await Bun.stdin.text();console.log(JSON.parse(t).f1)')
bun gym/score.ts ghost-compiled-v2 "$real"
