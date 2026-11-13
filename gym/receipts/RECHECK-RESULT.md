
## Result

Scored by `bun gym/scoreRecheck.ts` into `gym/receipts/recheck.json`. Verdict: **disproven**, failing p3b (F9) and p3c pooled.

| System | Held-out F1 | F3 | F9 | F10 | Real holdout F1 (189 pages, same-collection labels) |
|---|---|---|---|---|---|
| rule-early | 0.7374 | 0 | 0 | 1.0 | 0.8571 |
| rule-act0 | 0.7514 | 0.16 | 0 | 1.0 | 0.8661 |
| rule-recheck (candidate) | 0.8812 | 1.0 | 0 | 1.0 | 0.8837 |
| rule-recheck-planned (amendment 1) | 1.0 | 1.0 | 1.0 | 1.0 | 0.8837 |
| dom-recheck | 0.8105 | 1.0 | 0 | 0.7 | 0.8923 |
| flag-everything | 0.6226 | 0.63 | 0.65 | 0.68 | 0.5517 |

No false alarms on F1 or F5 for any rule. Recheck to mouse press: p50 176 ms, p95 303 ms. 4 real pages failed to load.

On real pages the rule and the DOM check differ on 3 pages, all labelled broken. The rule wins matbao.com (a disabled button). It loses elmundo.es and zalando.de, where its "the hit is nested in the target" inference trusted an in-flow element that was not inside the target.
