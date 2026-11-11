Build the workers-ai-vision baseline for the ghost eval.

1. eval/wai/ : a Worker named ghost-eval-ai (wrangler.jsonc, src/index.ts), account 29db7c74093386544fed8046ef083a4b, custom domain ghost-eval-ai.customer0.dev (workers.dev gives error 1050 on this account), AI binding, gated by x-probe-key (value in probes/p1/.probe-key, set as secret PROBE_KEY). POST {model, prompt, imageBase64} returns {text, ms}. Model id comes from the request, which reads it from eval/models.json.
2. eval/models.json: {"workers-ai-vision": "@cf/meta/llama-4-scout-17b-16e-instruct", "ghost-local": "HuggingFaceTB/SmolVLM-256M-Instruct"}. If llama-4-scout rejects images, try @cf/moondream/moondream3.1-9B-A2B, then @cf/mistralai/mistral-small-3.1-24b-instruct, and record which one worked in models.json.
3. eval/prompt.txt holds the one shared prompt: "Is there a cookie banner, popup, modal or overlay covering part of this web page? Answer yes or no."
4. eval/run-wai.ts: import splitOf from eval/baseline-dom.ts. For every ok frame in .real/frames (*.json with ok true, label held|broken), send the jpg and parse the reply: starts with yes -> true, no -> false, else null. Write eval/raw/workers-ai-vision.<split>.1.json in the same row shape as eval/raw/dom-rule.holdout.1.json ({id,label,flagged,ms}). Concurrency 4. Also write eval/raw/workers-ai-vision.replies.json with id -> raw text (truncate each to 200 chars).
5. Run it once on all frames present now. Then touch /tmp/ghost-plan/wai.done.
No source comments. No mocks. TypeScript strict, no `as` casts.
