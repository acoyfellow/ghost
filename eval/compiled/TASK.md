You are writing mechanistic software. Do not judge frames yourself at decision time; write a rule.

Task: edit rule.ts so `blocked(facts)` predicts whether a browser click at the target centre will be intercepted (label "broken") or reach the target (label "held").

Data: dev.jsonl in this directory, one JSON object per line: {id, label, facts: {target, box, dom}}. `dom` holds facts recorded at the target centre just before a real click: hit element, elementFromPoint ancestor chain, hitIsTargetOrDescendant, nearest fixed/sticky/high-z ancestor (stickyAncestor), cmpPresent, cmpSelectors, title, finalUrl. `target` holds the chosen element (tag, text, pool, candidates). `box` is its rectangle in a 1280x800 viewport.

Rules:
- Work only in this directory. Do not read any file outside it. Do not use the network.
- rule.ts must be deterministic TypeScript with no dependencies, no model calls, no network, no domain names or ids hard-coded (no memorising rows). Keep it under 120 lines. Keep the exported signature.
- Score with `bun score-dev.ts`. You may run it at most 5 times in total. Each run is an attempt. Count them.
- These dev rows are a sample; a hidden set of about 190 rows from the same distribution decides the result. Prefer general, physically motivated rules over fitting single rows. The current rule (hitIsTargetOrDescendant === false) scores F1 0.98 here and about 0.88 on the hidden set, so hidden misses are mostly broken frames it does not flag.
- When done, write NOTES.md: each attempt with its dev F1 and what changed, and why the final rule should generalise.
