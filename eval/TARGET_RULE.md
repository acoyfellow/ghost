# Target rule

Viewport 1280x800, scroll position 0, page load event plus 4 seconds.

Candidates are visible `a` and `button` elements (display not none, visibility not hidden, opacity not 0, non-empty box) whose box center is inside the viewport.
An element is excluded if it or any ancestor is `position: fixed` or `sticky`, is a `header` element, or has `role=banner`.
If a `main`, `[role=main]` or `article` element exists and contains at least one candidate, only candidates inside it are considered.
The target is the candidate with the largest box area (width times height). Ties go to document order.

Ground truth: a capture-phase click listener is installed on the target, which calls preventDefault. A trusted `Input.dispatchMouseEvent` press and release at the target box center follows. `held` means the listener fired. `broken` means it did not, so something else received the click.
