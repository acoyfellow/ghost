Probe 2b: HuggingFaceTB/SmolVLM-256M-Instruct, dtype q4 (embed_tokens, vision_encoder, decoder_model_merged), transformers.js v3 in cmux WKWebView.
Device: webgpu (navigator.gpu present; adapter info object was empty {}). No wasm fallback was needed.
Load ms: 851 (model files were cached by the earlier run).
Per-frame p50 ms: 6833 (all 11 frames) (range 6050-7264; the first run's 15-44 s frames included cold downloads).
Accuracy on the 10 labelled frames: 5/10 (broken=overlay present, held=none; unparseable answers count as wrong).
Broken: 20minutes yes, 5movierulz yes, amocrm yes, adsmoloco no (wrong), elmundo "Cookie." (unparsed).
Held: adspower no, arte.tv no, aiscore yes (false positive), asurascans yes (false positive), amazon.co.jp "Cookie banner." (unparsed).
frame0 (p1) answered No.
Verdict: WebGPU runs in WKWebView, but ~7 s/frame and 50% accuracy is too slow and unreliable for gating.
Note: the first attempt failed on frames because serve died mid-run; rerun with serve restarted was clean.
