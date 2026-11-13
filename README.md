# ghost

**Disproven, with a real win inside it.** Before a browser agent clicks, will the click reach the target? We asked a model to *write a rule* instead of judging every page. On kinds of page it never saw, its rule beat the hand-written rule and two vision models. It still missed the bar we set, because some pages change after the agent looks, and no rule can see that.

> Ask a model to play the game and it burns tokens. Ask it to design a system that plays the game and it writes software that runs 1000x faster.

Live: https://ghost.customer0.dev · Gym: https://ghost.customer0.dev/gym · Receipts: [`gym/receipt.json`](gym/receipt.json), [`eval/receipt.json`](eval/receipt.json)

Held-out gym families, 250 pages, F1 on blocked clicks:

| System | Held-out F1 | F10 inert / disabled (unseen mechanism) |
|---|---|---|
| ghost-compiled-v2 (candidate, written by Fable 5.2) | **0.7374** | **1.0** |
| dom-rule (hand-written) | 0.6467 | 0.7 |
| ghost-compiled-v1 (round 1 rule) | 0.6467 | 0.7 |
| workers-ai-vision (median of 3 runs) | 0.4444 | 0.3721 |
| ghost-local (SmolVLM-256M, WebGPU) | 0.1899 | 0.2286 |

Pre-registered conditions in [`gym/RULE.md`](gym/RULE.md): beats the best baseline by 0.05 **passes** (+0.09). Held-out F1 at least 0.90 **fails** (0.7374). Real holdout pages at least 0.883 **fails** (0.8387).

**Audit** ([`gym/receipts/AUDIT.md`](gym/receipts/AUDIT.md), post hoc, the verdict stays): the 0.90 bar was above the 0.7374 ceiling that any rule reading only the observation can reach, and the candidate hit that ceiling. The real-site check scored round 2 facts against round 1 labels. With labels from the same collection, both rules score 0.8837: no regression. Flagging every page as blocked scores 0.6226, above both vision models.

**Test 1, recheck at click time** ([`gym/RECHECK.md`](gym/RECHECK.md), pre-registered, receipt [`gym/receipts/recheck.json`](gym/receipts/recheck.json)): **disproven** on F9. The same frozen rule, run again just before the click, scores 0.8812 on held-out families (late overlay 0 → 1.0) but 0 on the moving target, because it re-aimed at the target's new position. A variant added before collection that tests the planned click point scores **1.0 on every family**, with no false alarms. On 189 real pages, labelled from the same collection, it scores 0.8837 against 0.8923 for the plain DOM recheck. That result needs its own frozen test before it is a claim.

## Why

Most browser agents send a screenshot to a model and ask "is something in the way?". That is the model playing the game: slow, paid per page, and in round 1 it lost to one free DOM call. The better use of a model is to write the mechanism once. ghost measures whether a model-written rule generalises to pages it was never shown, or only memorises the ones it was.

## What it does

Two rounds, each frozen before scoring.

**Round 2, the gym (current result).**
- [`gym/RULE.md`](gym/RULE.md) defines 10 families of pages, the split, the facts and the verdict. It was reviewed by an adversarial model ([`gym/receipts/rule-critic.md`](gym/receipts/rule-critic.md)) and frozen before any page existed.
- [`gym/generator/`](gym/generator/) serves each family at `/gym/<family>/<seed>`. The answer for each page is set by construction, with a secret salt so the rule author cannot guess labels from seed numbers. Every label was confirmed by a real click in Browser Run: 500 of 500 agreed.
- Fable 5.2 got a sandbox with only the 5 train families (F1, F2, F4, F5, F8), no page ids, no URLs, and a scorer it could run 5 times. It used 2. It wrote [`gym/compiled/rule.ts`](gym/compiled/rule.ts), 55 lines. Its notes are in [`gym/compiled/NOTES.md`](gym/compiled/NOTES.md) and every tool call is in [`gym/compiled/tool-calls.jsonl`](gym/compiled/tool-calls.jsonl).
- The rule was frozen, then scored once on the 5 held-out families (F3, F6, F7, F9, F10) and on the real sites.

**Round 1, real sites.** 285 real pages captured in Browser Run, labelled by a real click, split 92 dev and 193 holdout. One `elementFromPoint` call scored 0.8833. A Workers AI vision model scored 0.6615 and SmolVLM-256M on WebGPU 0.3485. A rule Fable wrote from the dev pages made the same call as the DOM check on all 193 holdout pages.

## What we learned

1. **The model wrote mechanisms, not memories.** No train page had a disabled or inert target. Fable's rule still says a disabled control gets no click and an inert subtree is skipped, because that is how browsers work. On the unseen F10 family it scored 1.0; the hand-written rule scored 0.7.
2. **Some failures are out of reach for every rule.** In F3 and F9 the page changes after the agent looks. Every system scored 0 there except vision, which is close to guessing. This was written down before any page existed. The fix is not a better rule: check again at the moment of the click.
3. **The real-site drop is the data moving, not the rule.** The pages were collected again with the gym protocol. The plain DOM rule scores the same 0.8387 on the new facts. The two rules disagree on 2 of 193 pages, one each way.

## Quick start

```sh
bun install
bash gym/score.sh          # recompute the gym receipt from gym/raw
bash eval/score.sh         # recompute the round 1 receipt from eval/raw
bun eval/verify-frozen.ts  # check every frozen file against eval/frozen.json
bash proof/gate.sh         # the full release contract
```

Open any gym page, such as https://ghost.customer0.dev/gym/F10/3, to see a case. Collecting new frames needs a Cloudflare account with Browser Run: deploy `gym/collector` with wrangler and run `bun gym/mine.ts`. Frames go to `.real/`, which is not committed.

## Proof

- Fit first: [`FIT.md`](FIT.md) and [`fit/spec.json`](fit/spec.json), checked by `fit/spike-fit.ts`.
- [`eval/frozen.json`](eval/frozen.json) holds hashes of every rule, site list, prompt, model id, frame index and scorer, with a log of every refreeze and its reason.
- [`proof/gate.sh`](proof/gate.sh) checks, from git history, that `gym/RULE.md` was committed before the generator and that the candidate rule was frozen before its scored run. It checks that the model never touched files outside its sandbox, recomputes both receipts, and checks that the live page shows the verdict and every number. It also checks that GitHub `main` matches, that gitleaks is clean and that no frames are tracked.

## Limits

- **Condition 3 compares two collections.** The 0.883 threshold came from round 1 facts. The candidate was scored on facts collected again a day later. 13 pages changed their click label between the two, and 3 failed to load.
- **`ghost-local` has 1 complete gym run, not 3.** The cmux browser tab grew past 6 GB and was restarted while the run was going. Run 1 finished all 500 pages, and run 2 stopped at 469.
- **Same model family on both sides.** Sonnet wrote the gym generator and Fable wrote the rule. Fable never saw the generator code, but both come from one model family.
- **Gym pages are simpler than real sites.** Every gym target is one button. A rule that wins here can still lose on real pages, which is why condition 3 exists.
- **One prompt for all vision models, no tuning.** One egress location for real sites.
