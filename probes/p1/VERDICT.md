# Probe 1 verdict: PROVEN on all four counts

1. Acquire: `env.BROWSER.acquire({targets:true})` + `connectSession(id,{targetId})` works from a plain Worker; CDP over the WebSocket Fetcher.
2. Screencast: `Page.startScreencast` (jpeg, maxWidth 1280) gave 17 frames on bbc.co.uk and 10 on example.com, each acked. First frame came 121ms and 43ms after start. Frames were 27-44 KB.
3. `Runtime.evaluate` with `document.elementFromPoint(200,200)` worked: IMG on BBC, P on example.com.
4. Live View: `getLiveView(id,{targetId,mode:"devtools"})` returned a devtoolsFrontendUrl on live.browser.run. It carries a JWT, so result.json omits it.
Gotcha: connect with `targetId`. A browser-level socket rejects `Page.enable` ("wasn't found").
Gotcha: `ghost-probe1.customer0.workers.dev` returned Cloudflare error 1050 on this account, even for a trivial worker. The probe is served from the custom domain https://ghost-probe1.customer0.dev (key-gated, 404 without `x-probe-key`).
Caveat: BBC showed no consent banner in this run, so banner handling was not exercised. Screencast frames only arrive on visual change, so the probe scrolls to force them.
