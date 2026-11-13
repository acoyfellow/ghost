# H1 result: falsified

Scored by `bun gym/scoreH1.ts` into `gym/receipts/h1.json`, from the committed per-page decisions in `gym/real/h1-decisions.json`.

| Measure | Value |
|---|---|
| Pages loaded in all 3 passes | 189 of 193 |
| Pages with the same label in all 3 passes | 182 |
| Label disagreement D | 0.0247 |
| Guard error E | 0.0653 |
| Guard error on stable pages E_s | 0.0604 (95% interval 0.028 to 0.097) |
| E minus D | 95% interval 0.007 to 0.078 |

Both predictions fail: E_s is above 0.02, and E is above D + 0.02. H1 is **falsified**. The remaining error is not label noise.

Guard F1 per pass: 0.909, 0.908, 0.899. On stable pages the guard is wrong 6.0% of the time, the DOM recheck 6.6% and the Fable rule 7.1%. The guard is the best of the three, but by less than its interval.

## The 11 stable misses

Every miss is a page labelled broken in all 3 passes, which the guard passed in all 3 passes: cdiscount.com, hola.org, narto-drama.com, paychex.com, pearltrees.com, showcamrips.com, survicate.com, thesun.co.uk, tripadvisor.co.uk, ukdevilz.com, walkme.com.

On all of them:

- `elementFromPoint` at the planned point reached the target;
- the target box did not move between the observation and the click;
- the target was not disabled or inert, and was in the viewport;
- the capture listener on the target did not fire.

On survicate.com and narto-drama.com the window capture listener saw the click, with the target, or an image inside it, as the event target. On the other pages the window listener saw nothing.

## What this suggests, not yet tested

The label says whether **our** listener on the target fired. It does not directly say whether the click reached the target. The collector adds its listeners late, after the page's own scripts. A page listener added earlier on `window` or `document`, in the capture phase, runs first. If it calls `stopPropagation`, our listeners never run, even though the browser delivered the click to the target. A page that replaces the target node on `mousedown` gives the same result.

If this is the cause, the 11 misses are failures of the label, not of the guard. That is a new hypothesis, not a result. H1 stays falsified as written.

## Next test, H1b

- Install the label listener before any page script runs (`Page.addScriptToEvaluateOnNewDocument`), at `window` capture.
- Record, per click, whether the target node was still connected and was the same node at click time.
- Separate three outcomes: delivered to the target, delivered to another element, and not delivered.
- Prediction: on the 11 pages the click is delivered to the target, and E_s falls to at most 0.02.
