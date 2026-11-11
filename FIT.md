# Fit

Written before any build. All links returned HTTP 200 on 2026-11-10.

## Problem

A browser agent must know, before it clicks, whether something covers the target: a consent banner, a modal, a login wall. Many agents answer this by sending a screenshot to a vision model. The question for ghost: does a small vision model that runs on the user's own GPU (WebGPU in the browser) answer it better than the free signal that the agent already has over CDP (the DOM)?

## Existing tools

- Browser Run Live View and Human in the Loop already give a person a URL to watch and take over a session: https://developers.cloudflare.com/browser-run/features/live-view/ and https://developers.cloudflare.com/browser-run/features/human-in-the-loop/
- Stagehand, DOM-first agent actions: https://github.com/browserbase/stagehand
- browser-use, DOM plus vision agent loop: https://github.com/browser-use/browser-use
- Playwright MCP, accessibility snapshot with no pixels: https://github.com/microsoft/playwright-mcp
- autoconsent, rules that detect and dismiss consent overlays: https://github.com/duckduckgo/autoconsent
- OmniParser, screenshot to labelled boxes: https://github.com/microsoft/OmniParser
- Moondream, small VLM with point and detect: https://github.com/vikhyat/moondream
- Transformers.js, WebGPU models in the browser: https://github.com/huggingface/transformers.js
- SmolVLM-256M: https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct

## Public benchmark

- ScreenSpot-v2, GUI grounding: https://huggingface.co/datasets/OS-Copilot/ScreenSpot-v2
- ScreenSpot-Pro: https://github.com/likaixin2000/ScreenSpot-Pro-GUI-Grounding
- Mind2Web, real-site web tasks: https://osu-nlp-group.github.io/Mind2Web/
- Tranco, the fixed site list for frame collection: https://tranco-list.eu/

No public benchmark measures "overlay blocks the target" on live pages. ghost builds a small frozen one from Browser Run frames.

## Baselines

From `fit/spec.json`, holdout split, F1 on blocked frames. The candidate is scored on its worst run and the baselines on their best run.

| System | F1 |
|---|---|
| dom-rule | 0.8833 |
| workers-ai-vision | 0.6615 |
| ghost-local | 0.3485 |
| ghost-compiled (candidate) | 0.8833 |

## Decision

Live View already covers watching and taking over a session, so the Gemini "ghost browser" streaming stack is not needed. The remaining question is triage. Test it against the DOM rule before any build.

ghost-local scored 0.3485 on its worst of 3 runs (all 3 identical, greedy decoding). The DOM rule scored 0.8833 for free.

Second candidate, ghost-compiled: Fable 5.2 wrote a deterministic rule from the 92 dev frames only (1 of 5 dev attempts). It agreed with dom-rule on all 193 holdout frames: 0.8833, not 0.8833 + 0.02. Stop.

Decision: stop
