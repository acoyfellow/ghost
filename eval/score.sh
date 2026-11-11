#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bun eval/score.ts eval/raw ghost-compiled 0.02 dom-rule workers-ai-vision ghost-local
