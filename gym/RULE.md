# ghost gym rule

Frozen before any gym page exists. Changes go through `bun eval/freeze.ts <reason>` and are logged in `eval/frozen.json` `changes[]`. An adversarial review of the first draft is in `gym/receipts/rule-critic.md`; this version applies it.

## Question

Before a browser agent clicks the centre of a target element, will the click reach the target? `broken` = it will not. `held` = it will.

## Protocol (one page)

1. Load `/gym/<family>/<seed>` in Browser Run, viewport 1280x800.
2. Wait until `window.__ghostReady === true` (the page sets it when its scripted timeline is done), then 200 ms more. Pages finish their timeline within 3 s.
3. Take the screenshot and record the **observation facts** (below). This is the moment an agent decides.
4. Click at the screenshot-time centre of the target box with a trusted `Input.dispatchMouseEvent` press and release, with a capture-phase listener on the target that calls `preventDefault`.
5. Record the **outcome facts** (below). Outcome facts are used for labelling and diagnosis only. No system sees them.

The click point is always the screenshot-time centre of the target.

Timeline events in F3 and F9 are scheduled between step 3 and step 4: the page holds them back until the collector calls `window.__ghostAct()` after the screenshot, and the collector waits 300 ms before clicking. This makes "changed after the agent looked" exact, and visible to no observation fact.

## Truth

The generator states the intended truth in a response header `x-ghost-truth: broken|held` and in `window.__ghostTruth`. The label is the trusted click: `broken` if the target listener did not fire, else `held`. A page whose click disagrees with its intended truth is dropped and logged in `gym/receipts/dropped.json`, never relabelled. The header and `__ghostTruth` are never given to any system.

## Families

Each family uses seeds 0..49. Whether a seed is broken or held is decided by a keyed hash of (family, seed) with a salt that is held in a git-ignored file until scoring, so the rule author cannot derive labels from seed numbers. Layout, colours, text, target size and position, and overlay size are randomised by seed.

| id | family | broken when | held when |
|---|---|---|---|
| F1 | clean | never | always (scored as false-positive rate only) |
| F2 | modal | an opaque fixed modal covers the target | the modal is placed away from the target |
| F3 | late-overlay | after the screenshot, an overlay appears over the target | after the screenshot, an overlay appears away from the target |
| F4 | invisible-cover | a transparent element covers the target | the transparent element has `pointer-events: none` |
| F5 | looks-blocked | never | a visible overlay over the target has `pointer-events: none` (scored as false-positive rate only) |
| F6 | canvas-modal | a canvas with no fixed position and no z-index above the content receives clicks over the target; a modal is drawn on it | the same canvas has `pointer-events: none` |
| F7 | shadow-iframe | a same-origin `srcdoc` iframe or open shadow root sits over the target and its inner content covers the target point | the same host box sits over the target, with `pointer-events: none` on the host, or the inner content not under the target point and the host transparent to hits |
| F8 | offscreen-lock | the body is scroll-locked and the target centre is outside the viewport | the target centre is inside the viewport |
| F9 | moving-target | after the screenshot, the target moves so that the click point leaves its box | after the screenshot, the target moves but its box still contains the click point |
| F10 | disabled-or-inert | the target is inside an `inert` ancestor, or a `disabled` fieldset makes a button target dead | decoys: `inert` or `disabled` on a sibling or unrelated element, or `aria-disabled` / a `disabled` class on a live target |

F1 and F5 have no broken seeds. They are reported as false-positive rate and excluded from F1.

## Split

Split by family, frozen now.

- Train (the rule author may see these): F1, F2, F4, F5, F8.
- Held out (scoring only): F3, F6, F7, F9, F10.

Pre-registered expectation of `dom-rule` on held-out families: fails F3 and F9 (the change happens after observation and no observation fact can see it), fails F10 broken pages (the hit is the target), passes F6, passes or partly passes F7. F3 and F9 are therefore expected to cap every system; they are in the set to measure that cap honestly, not to be won.

## Facts given to systems (observation facts only)

At step 3: the screenshot; the target's tag, text, attributes and box; the `elementFromPoint` chain at the click point, including into open shadow roots and same-origin iframes; hit-is-target; the nearest fixed / sticky / high-z ancestor of the hit; computed `pointer-events`, `visibility`, `opacity` along the chain; `inert` and `disabled` state of the target's ancestors; whether the click point is inside the viewport; scroll-lock state of `html` and `body`; the count of open shadow roots and iframes on the hit path.

Vision systems get only the screenshot and the target box.

## Systems

- `dom-rule`: hit-is-target from the observation facts.
- `workers-ai-vision`: model id in `eval/models.json`, prompt in `eval/prompt.txt`. 3 runs, median reported.
- `ghost-local`: same prompt. 3 runs, median reported.
- `ghost-compiled-v1`: frozen `eval/compiled/rule.ts`.
- `ghost-compiled-v2`, the candidate: a deterministic TypeScript rule written by Fable 5.2 in a sandbox holding only train-family observation facts and labels, and a train-family scorer. It does not see the generator code, the salt, held-out families, outcome facts or the real-site set. At most 5 scorer runs. Under 150 lines. No string literal copied from page text, ids or class names. No model call at decision time.

## Metric and verdict

F1 on `broken`, pooled over the held-out families F3, F6, F7, F9, F10 (250 pages minus drops), with a 1,000-sample bootstrap 95% interval. Per-family F1 is reported alongside. Deterministic systems run once; vision systems use the median of 3 runs.

Proven only if all hold:
1. Candidate pooled held-out F1 >= 0.90.
2. Candidate pooled F1 >= best baseline pooled F1 + 0.05.
3. Candidate F1 on the 193 real holdout pages (labelled by the same trusted-click protocol, `eval/frames.index.json`) >= 0.883, the score of `dom-rule` and `ghost-compiled-v1` there.

Otherwise disproven, and the receipt names each failing condition. Because F3 and F9 are pre-registered as unwinnable from observation facts, condition 1 can fail by design; that outcome is itself the finding and is reported with the per-family table.

## Discrimination check (before the candidate is written)

After the baselines run: if `dom-rule` scores F1 >= 0.97 on every held-out family, or no system scores below 0.9 on any held-out family, the gym does not discriminate. Stop and redesign before the candidate exists.

## Budget

$25 total. Caps: gym generator and review $6; collection in Browser Run $3; Workers AI baseline $3; candidate compile $6; everything else $7.
