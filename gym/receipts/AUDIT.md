# Audit of the gym verdict

This audit is post hoc. It does not change the frozen verdict in `gym/receipt.json`, which stays `disproven`. It shows that the failure is in our test design, not in the rule. Run `bun gym/audit.ts` to recompute every number below from committed files into `gym/receipts/audit.json`.

## Finding 1: condition 1 could not be met by any rule

- F3 (late overlay) and F9 (moving target) change the page after the observation. `gym/RULE.md` says so, before any page existed.
- They hold 47 of the 113 blocked held-out pages. A rule that reads only the observation can catch at most the other 66.
- With perfect precision, the best possible F1 is 2 × (66/113) / (1 + 66/113) = **0.7374**.
- The candidate scored **0.7374**, the ceiling. We set the threshold at 0.90, above it. That is a design error in the test.

## Finding 2: condition 3 compared facts and labels from two collections

- The real pages were collected again for the gym protocol. On 10 of the 193 holdout pages, the click result changed between the two collections.
- The frozen scorer used round 1 labels with round 2 facts. Both rules then score 0.8387.
- With labels from the same collection as the facts, both rules score **0.8837**, above the 0.883 threshold.
- The margin is 0.0007, and both rules score the same. The honest reading is "no regression", not "pass".

## Finding 3: the win on an unseen mechanism holds

- F10 (inert or disabled target) did not appear in any train page. Candidate F1 1.0, hand-written rule 0.70, no false alarms for either.
- On F6, F7 and F10 together: candidate 1.0, hand-written rule 0.90.

## Finding 4: the vision baselines scored below a trivial guess

- Flagging every page as blocked scores 0.6226 pooled, 0.63 on F3 and 0.65 on F9.
- workers-ai-vision scored 0.4444 pooled, 0.37 on F3 and 0.51 on F9. The 3 runs gave the same answers.
- ghost-local gave no yes or no on 329 of 500 pages. Its score measures broken output more than vision.

## Corrected reading

| Condition | Frozen result | Audit |
|---|---|---|
| Held-out F1 at least 0.90 | fail, 0.7374 | Mis-specified: the ceiling for any observation-only rule is 0.7374, and the candidate reached it |
| Beats the best baseline by 0.05 | pass, +0.09 | Holds. The gain comes from a mechanism the model never saw |
| Real holdout at least 0.883 | fail, 0.8387 | Tie within noise: 0.8837 with labels from the same collection, same as the hand-written rule |

## Next tests, pre-registered in this order

1. **Check again at click time.** Run the same frozen rule a second time just before the click. Success: F3 and F9 F1 at least 0.9, pooled held-out F1 at least 0.90.
2. **Repeat the compile 5 times** with the same sandbox. Success: the inert/disabled mechanism appears in at least 4 of 5 rules.
3. **New families from a different model family.** Freeze the rule, then score it on 3 new families. Success: it still beats the hand-written rule.
4. **Collect the real sites 3 times in a row**, labels and facts from one pass. Report the candidate minus the hand-written rule with a bootstrap interval.
5. **Force a yes or no answer from ghost-local**, then run it again.
6. **Report the flag-everything baseline** in every table.
