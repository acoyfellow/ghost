# H1b: are the stable misses a label error?

Pre-registered. This file is frozen before any page is collected for H1b.

## Background

H1 was falsified (`gym/receipts/H1-RESULT.md`). 11 real pages are labelled broken in all 3 passes, while every fact says the click point reaches the target. The label in H1 is: a capture listener on the target, added after the page's scripts, fired. A page listener that runs earlier and calls `stopPropagation` makes that label say broken even if the click reached the target.

## Hypothesis

Most of the 11 stable misses are clicks that reached the target. Two independent labels show this.

## Instrument

The H1 collector, with two additions. Nothing else changes: the same pages, target rule, waits, guard and click.

1. **Early delivery label.** Before navigation, `Page.addScriptToEvaluateOnNewDocument` installs capture listeners on `window` for `pointerdown`, `mousedown` and `click`. These run before any page listener. Each stores the event's composed path. After the click, `delivered` is true if the target node is in the composed path of the `click` event. `sameNode` is true if the target is still connected.
2. **Effect label.** Between the mouse press and 1500 ms later, record:
   - `urlChanged`: `location.href` differs from before the click;
   - `domMutations`: the count of MutationObserver records on `document`;
   - `requests`: the count of CDP `Network.requestWillBeSent` events.

   `effect` is true if `urlChanged`, or `requests > 0`, or `domMutations >= 5`.
3. The H1 label (`fired`, the late target listener) is still recorded, as `labelLate`.

## Data

- The 193 real holdout pages, 1 pass, into `.real/h1b`.
- The 11 stable misses are named in advance: cdiscount.com, hola.org, narto-drama.com, paychex.com, pearltrees.com, showcamrips.com, survicate.com, thesun.co.uk, tripadvisor.co.uk, ukdevilz.com, walkme.com.

## Predictions

1. **Primary.** Of the 11 that load, at least 8 have `delivered` true.
2. Of those with `delivered` true, at least 75% have `effect` true.
3. Over all pages, the guard error against `delivered` on pages where `labelLate` and `delivered` agree with H1's stable label is at most 0.02. Reported, does not set the verdict.
4. **Control.** On pages that H1 labelled held in all 3 passes, `delivered` is true on at least 95%. This checks that the early label does not lose clicks the late label saw.

## Verdict

- **Supported** if predictions 1 and 4 hold.
- **Falsified** if prediction 1 fails while 4 holds. Then the 11 pages block the click in a way no pre-click fact shows. They are listed with the event path.
- **Instrument fails** if prediction 4 fails. Then nothing is concluded about the 11.

## What each outcome means for the product

- Supported: the guard is close to done. The next test is a task-level one.
- Falsified: study the 11 pages. Prefer click, then check, over prediction.
- Delivered but no effect on many pages: "the click worked" is not one thing. The label must be defined per task.
