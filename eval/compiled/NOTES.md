# Notes

## Attempts

Scorer runs used: 1 of 5.

| # | Dev F1 | Precision | Recall | Change |
|---|--------|-----------|--------|--------|
| 0 | 0.98 (quoted in TASK.md, not run by me) | – | – | Baseline: flag when `hitIsTargetOrDescendant === false`. |
| 1 | 0.9818 | 1.0 | 0.9643 | Final rule, described below. One dev miss: `windguru.cz` (broken, not flagged). |

Before attempt 1 I tabulated dev.jsonl with a throwaway script (since deleted). It printed label counts against individual facts and listed rows. It never imported rule.ts and never computed F1.

## Final rule

`blocked` is true unless both of these hold:

1. **The probe confirms the target.** `dom.hitIsTargetOrDescendant` must be exactly `true`. The baseline flagged only an explicit `false`. This one also flags a missing `dom`, a missing or null flag, and a null `hit`.
2. **The hit element can deliver the click to the target.** If the hit is an `IFRAME`, `FRAME`, `OBJECT` or `EMBED` nested in the target, the click is dispatched inside the nested document and never reaches the target in the parent page. Those are flagged, unless the target itself is that kind of element.

## What the dev data shows

- `hitIsTargetOrDescendant` separates dev almost perfectly: 27 of 27 `false` rows are broken, and 64 of 65 `true` rows are held.
- No dev row exercises either change. Every row has a complete `dom` record and no hit-true row has a frame-like hit, so the dev score is the same as the baseline's.
- The hidden-set gain is therefore unmeasured. It depends on whether the hidden set contains rows with missing probe facts or frame hits.

## Why it should generalise

- It rests on two mechanisms, not on dev rows: a click reaches the target only if the hit test lands on it, and events do not cross a nested-document boundary.
- TASK.md says hidden misses are mostly broken frames the baseline does not flag. Requiring positive evidence turns every "no evidence" row from unflagged to flagged, which is the direction those misses point.
- It uses no domain names, ids, class names, titles or pixel thresholds.

## Considered and rejected

- **Thin full-width strip** (the `windguru.cz` shape: 1280x22 at the top of the page). It would bring dev to 1.0, but it is fitted to one row and I could not name a mechanism for it. I left it out as memorising.
- **`cmpPresent` with a hit on target.** 12 held, 0 broken in dev. A consent tool that is present but not covering the target did no harm.
- **Position near the top, full width, `pool`, redirected `finalUrl`, challenge-page titles, high-z `relative` ancestor.** Each was held in most or all hit-true dev rows.
- **Box geometry checks** (centre off-viewport, zero area). They are redundant: a confirmed hit already implies the point is on screen, and an unconfirmed one is already flagged.

## Known limit

`windguru.cz` is broken even though the probe hit the target's own descendant with nothing above it. Whatever intercepted that click is not visible in the recorded facts. If the hidden misses are mostly of this kind, this rule will score close to the baseline's 0.88.
