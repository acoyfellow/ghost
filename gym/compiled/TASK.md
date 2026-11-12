You are writing mechanistic software: a rule, not a judgement.

Task: edit rule.ts so `blocked(observation)` predicts whether a trusted mouse click at the target's centre will NOT reach the target (label "broken") or will reach it (label "held").

When the observation is taken: after the page has loaded and settled, just before the agent would click. Things can still change between the observation and the click. The observation is all you get.

Data: train.jsonl in this directory. One JSON object per line: {id, label, observation}. The observation holds: target (tag, text, attributes, box), clickPoint, pointInViewport, chain (elementFromPoint ancestors at the click point with pointerEvents, visibility, opacity, position, zIndex), hit, hitIsTarget, stickyAncestor, ancestorState (inert/disabled along the target's ancestors), scrollLock, hitPathShadowRoots, hitPathIframes, openShadowRootsOnPage, iframesOnPage, title, finalUrl.

This file is a sample from SOME kinds of page. The rule will be scored once on DIFFERENT kinds of page you cannot see, and on real websites. A rule that only fits these rows will fail there. Write the rule from how browsers deliver clicks, and use the rows to check it, not to tune it.

Rules:
- Work only in this directory. Do not read anything outside it. No network.
- rule.ts: deterministic TypeScript, no dependencies, no model calls, under 150 lines, exported signature unchanged. No string literals copied from page text, ids, class names, titles or URLs.
- Score with `bun score-train.ts`. At most 5 runs in total; each run is logged to attempts.log automatically.
- The current rule (hitIsTarget !== true) already scores F1 1.0 on these rows. That is expected: the rows do not show every way a click can fail. Your job is to add mechanisms the browser really has that this rule misses, without adding false alarms on the rows here.
- When done, write NOTES.md: each mechanism you added, why a browser behaves that way, and each attempt's score.
