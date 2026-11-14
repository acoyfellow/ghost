# H1b result: the instrument fails its own control

Scored by `bun gym/scoreH1B.ts` into `gym/receipts/h1b.json`, from `gym/real/h1b-decisions.json`. 187 of 193 pages loaded.

## Verdict by the frozen rule

| Prediction | Result |
|---|---|
| 1. At least 8 of the 11 misses have `delivered` true | **holds**: 8 of 11 |
| 2. At least 75% of those have an effect | **holds**: 8 of 8 |
| 4. Control: at least 95% of stable-held pages have `delivered` true | **fails**: 106 of 113, 93.8% |

Prediction 4 fails, so the frozen verdict is **instrument fails**. Nothing is concluded about the 11 pages. Predictions 1 and 2 are reported, not claimed.

## Why the control failed

The 7 control pages where `delivered` is false:

- **4 pages are an instrument error.** On 360buyimg.com, lokmat.com, sandia.gov and sengkiper.site, the late target listener fired and `pointerdown` reached the target. The early `click` path did not contain the target. Two listeners on one click disagree, so at least one is wrong. The cause is not known.
- **2 pages changed.** On bonappetit.com and chron.com, both labels now say broken. These are real changes since H1, not instrument errors.
- **1 page navigated before the click.** On longisland.com the page loaded a new URL before any `click` event. The early label cannot see that click.

## What is described, not claimed

- 8 of the 11 misses: the click event reached the target, before any page script, and something happened after it (requests, DOM changes or a new URL). Their old label said broken.
- The other 3 (showcamrips.com, tripadvisor.co.uk, ukdevilz.com): no `click` event at all, but the page navigated, with 73 to 192 requests. The page acted on `pointerdown` or `mousedown` and left before `click`.
- So on all 11, the old label said broken while the page did react.
- Guard F1 against the late label is 0.910, and against the early label 0.939.

## Next instrument

One label cannot be a check on another label built from the same kind of listener. The next instrument must use a source that page scripts cannot touch: CDP `Input` events with `Network` and `Page.frameNavigated`, or a screenshot diff after the click. It must also pass the control before it scores anything.
