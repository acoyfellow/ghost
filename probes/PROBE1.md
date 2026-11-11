# Probe 1: screencast frames from Browser Run inside a Worker/DO

Goal: prove or disprove that a Worker (customer0 account 29db7c74093386544fed8046ef083a4b) can
1. acquire a Browser Run session via the `browser` binding,
2. send raw CDP `Page.startScreencast` (jpeg, maxWidth 1280) and receive >= 10 `Page.screencastFrame` events (ack each),
3. run `Runtime.evaluate` with `document.elementFromPoint(x,y)` on the same page,
4. get a Live View URL for the session.
Use https://www.bbc.co.uk (consent banner likely) then https://example.com.

Rules: put code in probes/p1/ (wrangler.jsonc, src/index.ts). Deploy with `npx wrangler deploy` to account 29db7c74093386544fed8046ef083a4b, worker name `ghost-probe1`. Gate the route: require header `x-probe-key` equal to a secret PROBE_KEY you set with `wrangler secret put` (generate with openssl rand -hex 16, store value only in probes/p1/.probe-key which is gitignored). No other public surface.
Hit it with curl, save JSON results (frame count, frame byte sizes, first-frame-ms, elementFromPoint result, liveView url present yes/no, any errors verbatim) to probes/p1/result.json, and one decoded frame to probes/p1/frame0.jpg.
Then `npx wrangler delete ghost-probe1 --force` is NOT wanted; leave it deployed.
Docs: probes/reference_browser-binding-api.md, probes/cdp_session-management.md, probes/features_live-view.md.
Write a 10-line verdict at the end of probes/p1/VERDICT.md. Do not add source comments. Do not mock anything.
