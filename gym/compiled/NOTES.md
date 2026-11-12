# NOTES

`rule.ts` is 55 lines, deterministic, no dependencies. It answers one question: will a trusted click at the target's centre be delivered to the target?

## What the training rows cover

All 250 rows are one `BUTTON` with three ways to fail: an absolute cover, a fixed modal, and a target outside the viewport on a scroll-locked page. In every row `hitIsTarget` equals the label.

So the rows exercise only the baseline and the viewport check. Every other mechanism below is written from browser behaviour and is **not exercised by any training row**. I checked those branches only with 15 hand-built observations (all behaved as intended), which tests the code, not the browser.

## Mechanisms

Checked in this order; the first that applies decides.

| # | Mechanism | Result | Why a browser behaves that way |
|---|---|---|---|
| 1 | `pointInViewport === false` | blocked | Hit testing only happens inside the viewport, so a click at coordinates outside it is delivered to nothing. All 23 such rows are broken. |
| 2 | Target is disabled (`matchesDisabled` or `disabled` on the first `ancestorState` entry) | blocked | A disabled form control is still returned by `elementFromPoint`, but the browser does not dispatch `click` to it. This is the case the baseline misses: `hitIsTarget` is true and the click still fails. `:disabled` also covers a `fieldset[disabled]` ancestor. |
| 3 | Any `ancestorState` entry has `inert` | blocked | `inert` removes the whole subtree from hit testing and event targeting. |
| 4 | `hitIsTarget === true` | held | The topmost hit-testable element at the point is the target. |
| 5 | Hit is content nested inside the target | held | A click on a child bubbles to the parent, so the target still receives it. See below for how nesting is inferred. |
| 6 | Hit is inside the target's own shadow tree | held | Events are retargeted across shadow boundaries, so the host is on the click's path. Applies when the target is the top stack entry and `hitPathShadowRoots > 0`. |
| 7 | Anything else with `hitIsTarget !== true` | blocked | Another element receives the click (cover, modal, sticky header, dialog backdrop), or the target is not hit-testable (`pointer-events: none`, `visibility: hidden`, zero size, clipped). |

### How mechanism 5 infers nesting

The observation does not say whether the hit is a descendant of the target, so the rule infers it from layout:

- The target must appear in `chain`, matched by tag, id and class. The lowest matching entry is used, so a lookalike higher in the stack cannot pass as the target.
- Every hit-testable entry above the target, and the hit itself, must be `position: static` with `z-index: auto`. An in-flow box sitting over the target's centre is almost always nested in it. Occluders are out of flow (absolute, fixed, sticky) or carry a z-index.
- No entry above the target may be an `IFRAME`, `FRAME`, `EMBED` or `OBJECT`, because events do not cross document boundaries.
- The target must be able to have rendered children, so `INPUT`, `IMG`, `SELECT` and similar are excluded.

Entries with `pointer-events: none` or `visibility: hidden` are ignored when reading the stack, since they cannot receive the click.

### Deliberately not flagged

- `aria-disabled`: it is an accessibility hint and does not stop click delivery.
- Opacity: an `opacity: 0` target still receives clicks, and a transparent cover still blocks (caught by hit testing).
- Scroll lock on its own: 27 scroll-locked rows are held.
- A disabled ancestor that is not the target: in Chromium a child of a disabled button still receives the click itself.

## Assumptions that could be wrong

- `chain` is the z-ordered stack at the click point (`elementsFromPoint`), not the hit's DOM ancestors. The rows fit this: covers and modals sit above `BUTTON` in `chain` and are labelled broken.
- "Reach the target" means the target's click listener fires, so bubbling counts. If the scorer requires `event.target === target`, mechanisms 5 and 6 will cause misses.
- `hitIsTarget` is strict identity. If it already means "target contains hit", mechanisms 5 and 6 are redundant and add a small risk.
- `ancestorState[0]` is the target itself (true in all 250 rows).
- The click runs in Chromium.

## Known gaps

- A static element inside a positioned wrapper that is itself `pointer-events: none` would be read as nested content and missed.
- Positioned children of the target (ripple spans, stretched-link overlays) are still flagged, as in the baseline.
- A `label` forwarding its click to a visually hidden input is still flagged.
- Anything that changes after the observation (late overlay, layout shift, re-render, a listener that stops propagation) is not visible in the observation and is not predicted.

## Attempts

2 of 5 scoring runs used; both are in `attempts.log`.

| Run | Rule | n | F1 | Precision | Recall |
|---|---|---|---|---|---|
| 1 | Baseline `hitIsTarget !== true` | 250 | 1.0 | 1.0 | 1.0 |
| 2 | Final `rule.ts` | 250 | 1.0 | 1.0 | 1.0 |

Run 1 was unintended: my first write of `rule.ts` was refused by the editor, and the scorer ran against the untouched baseline.

The unchanged score is expected, since the rows cannot distinguish the new mechanisms from the baseline.
