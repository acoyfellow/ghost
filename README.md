# ghost

**Disproven.** A browser agent wants to know, before it clicks, whether something covers the target. On 193 frozen real pages from Cloudflare Browser Run, one free CDP call (`elementFromPoint`) beat a Workers AI vision model and a vision model running on your own GPU in the browser. Then we asked a model to *write* a better rule instead of judging frames. It wrote the same rule.

> Ask a model to play the game and it burns tokens. Ask it to design a system that plays the game and it writes software that runs 1000x faster.

ghost tests that idea on browser agents. The compiled rule runs in microseconds for $0. It did not beat the hand-written one, because the misses leave no trace in the DOM facts we recorded.

Live: https://ghost.customer0.dev · Receipt: [`eval/receipt.json`](eval/receipt.json)

| System | F1 (holdout) |
|---|---|
| dom-rule | 0.8833 |
| workers-ai-vision | 0.6615 |
| ghost-local | 0.3485 |
| ghost-compiled (candidate) | 0.8833 |

## Why

Many browser agents send a screenshot to a vision model to ask "is a cookie banner or modal in the way?". The idea we tested came from a design chat: run a small vision model on the user's GPU (WebGPU) and the triage becomes free and private. Before building that stack, we asked whether it beats the signal the agent already has.

## What it does

- `eval/collector/` is a Worker that opens a site in Browser Run, picks a click target with a fixed rule ([`eval/TARGET_RULE.md`](eval/TARGET_RULE.md)), takes a screenshot, records DOM facts at the target, and then sends a real click. The label is `broken` when the target did not receive the click.
- Four systems answer the same question on the same frames:
  - `dom-rule`: does `elementFromPoint` at the target centre hit the target? ([`eval/baseline-dom.ts`](eval/baseline-dom.ts))
  - `workers-ai-vision`: a Workers AI vision model, one yes/no prompt ([`eval/run-wai.ts`](eval/run-wai.ts), model in [`eval/models.json`](eval/models.json))
  - `ghost-local`: SmolVLM-256M through Transformers.js on WebGPU, run three times in a browser ([`eval/local/`](eval/local/))
  - `ghost-compiled`: Fable 5.2 got a sandbox with only the 92 dev frames and a dev scorer, and wrote [`eval/compiled/rule.ts`](eval/compiled/rule.ts). Its notes and every tool call are in [`eval/compiled/`](eval/compiled/). The rule was frozen before its one holdout run.
- [`eval/score.ts`](eval/score.ts) recomputes F1 from the raw per-frame runs in `eval/raw/`. The candidate is scored on its worst run, the baselines on their best.

## Quick start

```sh
bun install
bash eval/score.sh        # recompute the receipt from eval/raw
bun eval/verify-frozen.ts # check that the cases and harness match eval/frozen.json
bash proof/gate.sh        # the full release contract
```

Collecting new frames needs a Cloudflare account with Browser Run: deploy `eval/collector` with wrangler and run `bun eval/mine.ts`. Frames are written to `.real/`, which is not committed.

## Proof

- Fit first: [`FIT.md`](FIT.md) and [`fit/spec.json`](fit/spec.json), checked by `fit/spike-fit.ts`.
- Frozen before scoring: [`eval/frozen.json`](eval/frozen.json) holds hashes of the site list, the target rule, the prompt, the model ids, the frame index and the scorer.
- Probes: [`probes/p1/VERDICT.md`](probes/p1/VERDICT.md) (screencast, `elementFromPoint` and Live View work from a Worker) and [`probes/p2/VERDICT.md`](probes/p2/VERDICT.md) (WebGPU model in the browser).
- [`proof/gate.sh`](proof/gate.sh) checks fit, the frozen hashes, the recomputed verdict, the live page, GitHub `main`, gitleaks, and that no frames are tracked.

## Limits

- The label and `dom-rule` use the same browser. An overlay that appears between the screenshot and the click counts against every system equally, but `dom-rule` reads the DOM at the same moment as the click.
- One prompt for all models, no per-model tuning. A larger local model or a tuned prompt can score higher. It must still beat a free call.
- One egress location. Consent banners depend on the visitor's country.
- Canvas, image and video content is invisible to the DOM. ghost does not test that stratum, where pixels can matter.
- 205 of 490 sites failed to load or had no eligible target and are not in the set.
