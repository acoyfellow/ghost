# Test 1: check again at the moment of the click

Pre-registered. This file is frozen before any page is collected for this test.

## Question

In F3 (late overlay) and F9 (moving target), the page changes after the agent looks. No rule that reads one early observation can see that. Does the same frozen rule catch these cases when it reads the page a second time, just before the click?

## What does not change

- The rule: `gym/compiled/rule.ts`, hash `a38d89d30695fc323b156f4367b7d574a05ad4634551a7d2c572d8be097a1026`. No edits, no new compile.
- The gym pages, the families, the seeds, the salt and the labels protocol in `gym/RULE.md`.
- The F1 and bootstrap code in `gym/score.ts`.

## What changes

The collector records 3 observations per page, with the same `observe` script:

| Name | When | Purpose |
|---|---|---|
| `early` | after the page is ready, before `__ghostAct()` | the round 2 observation, for a check that the pages did not change |
| `act0` | at once after `__ghostAct()`, with no wait | a recheck that is too early: the change is not done yet |
| `recheck` | after the 300 ms wait, at once before the mouse events | the recheck at click time |

The collector also records `recheckToClickMs`: the time from the start of the `recheck` read to the `mousePressed` event.

## Systems

- `rule-early`: the frozen rule on `early`.
- `rule-act0`: the frozen rule on `act0`.
- `rule-recheck`: the frozen rule on `recheck`. This is the candidate.
- `dom-recheck`: `hitIsTarget !== true` on `recheck`.
- `flag-everything`: every page is blocked.

## Predictions, written before data

1. `rule-early` reproduces round 2: held-out F1 0.7374 within 0.02. If not, the pages or the collector changed, and the test stops.
2. `rule-act0` scores near `rule-early` on F3 and F9 (F1 at most 0.3), because the change takes 20 to 120 ms. This shows the recheck must come late enough.
3. `rule-recheck`:
   - F1 at least 0.90 on F3, and at least 0.90 on F9;
   - pooled held-out F1 at least 0.90;
   - false-positive rate at most 0.02 on F1 and F5;
   - pooled held-out F1 at least 0.05 above `dom-recheck`. I expect this to fail, because only F10 separates the rules.
4. On the 193 real holdout pages, labelled from the same collection, `rule-recheck` F1 is not more than 0.02 below `rule-early`.

## Verdict

- **Proven** if predictions 1, 3a, 3b, 3c and 4 hold.
- **Disproven** otherwise, with the failing prediction named.
- Prediction 2 and 3d are reported. They do not set the verdict.

## Amendment 1, after a 3-page smoke test and before collection

Smoke pages F3/1, F9/1 and F2/1 were collected to check the collector. On F9/1, `recheck` said the target was hit, but the click failed. `observe` aims at the target's current centre. In F9 the target moved, so `recheck` looked at its new position, and the click went to the old point.

The original predictions stay as written and are scored as written. Prediction 3b is now expected to fail. One system is added, defined before collection:

- `rule-recheck-planned`: the frozen rule on `recheck`, but with `hitIsTarget` taken from `elementFromPoint` at the planned click point (the `early` click point). The collector records this as `recheckPlannedHit`.

It is reported next to `rule-recheck` and does not set the verdict. If it wins F9 and `rule-recheck` does not, the finding is: a recheck must test the point that will be clicked.

## Known weakness, written before data

In the gym, every change ends within 120 ms, and the recheck comes 300 ms after the change starts. So the recheck is expected to win in the gym by design. This test shows that the mechanism works and how late the recheck must come. It does not show the latency real sites need. Prediction 4 and `recheckToClickMs` are the parts that can surprise us.
