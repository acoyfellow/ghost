import { AutoProcessor, AutoModelForVision2Seq, load_image } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3";
const out = document.getElementById("out");
const prompt = "Is there a cookie banner, popup, modal or overlay covering part of this web page? Answer yes or no.";
const modelId = "HuggingFaceTB/SmolVLM-256M-Instruct";
const g = (window.__ghost = { ready: false, results: [], model: modelId, adapterInfo: null, loadMs: null, device: null, errors: [], hasGpu: !!navigator.gpu });
const show = () => (out.textContent = JSON.stringify(g, null, 1));
async function adapter() {
  if (!navigator.gpu) return "navigator.gpu is undefined";
  const a = await navigator.gpu.requestAdapter();
  return a ? { ...(a.info || {}) } : "requestAdapter returned null";
}
async function load(device) {
  const t = performance.now();
  const processor = await AutoProcessor.from_pretrained(modelId);
  const model = await AutoModelForVision2Seq.from_pretrained(modelId, {
    dtype: { embed_tokens: "q4", vision_encoder: "q4", decoder_model_merged: "q4" },
    device,
  });
  return { processor, model, ms: performance.now() - t };
}
async function run() {
  g.adapterInfo = await adapter();
  show();
  let m;
  for (const device of navigator.gpu ? ["webgpu", "wasm"] : ["wasm"]) {
    try { m = await load(device); g.device = device; break; } catch (e) { g.errors.push(device + ": " + e); show(); }
  }
  if (!m) { g.ready = true; return show(); }
  g.loadMs = m.ms;
  const frames = await (await fetch("./frames.json")).json();
  const messages = [{ role: "user", content: [{ type: "image" }, { type: "text", text: prompt }] }];
  const text = m.processor.apply_chat_template(messages, { add_generation_prompt: true });
  for (const { url, label } of frames) {
    const t = performance.now();
    try {
      const img = await load_image(url);
      const inputs = await m.processor(text, [img]);
      const ids = await m.model.generate({ ...inputs, max_new_tokens: 8, do_sample: false });
      const raw = m.processor.batch_decode(ids.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: true })[0].trim();
      const l = raw.toLowerCase();
      g.results.push({ url, label, raw, flagged: l.startsWith("yes") ? true : l.startsWith("no") ? false : null, ms: performance.now() - t });
    } catch (e) { g.results.push({ url, label, raw: String(e), flagged: null, ms: performance.now() - t }); }
    show();
  }
  g.ready = true; show();
}
run().catch((e) => { g.errors.push(String(e)); g.ready = true; show(); });
