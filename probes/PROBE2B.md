Rerun probe 2 (read probes/PROBE2.md and probes/p2/*). The previous run used a wrong repo id. Use HuggingFaceTB/SmolVLM-256M-Instruct (it has onnx/ files; pick dtype per its files: embed_tokens/vision_encoder/decoder_model_merged with q4 or fp16).
frames.json: probes/p1/frame0.jpg plus 10 jpgs copied from .real/frames/ (5 whose .json label is broken, 5 held; copy into probes/p2/frames/, which is gitignored).
Drive only with cmux browser (open a new surface, poll window.__ghost with `cmux browser --surface <ref> eval`, at most every 15s, max 10 min).
Record per frame: label, answer, flagged, ms; plus load ms, device, adapter info. If WKWebView WebGPU fails, record the error verbatim and use wasm.
Write probes/p2/result.json and probes/p2/VERDICT.md (10 lines: load ms, p50 ms, accuracy on the 10). Close your surface. Then touch /tmp/ghost-plan/p2b.done. No source comments.
