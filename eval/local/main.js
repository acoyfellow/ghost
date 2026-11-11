import { AutoProcessor, AutoModelForVision2Seq, RawImage } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3";

const params = new URLSearchParams(location.search);
const split = params.get("split") ?? "dev";
const run = params.get("run") ?? "1";
const limit = Number(params.get("limit") ?? "0");
const visionDtype = params.get("vision") ?? "fp16";
const embedDtype = params.get("embed") ?? "fp16";
const decoderDtype = params.get("decoder") ?? "q4";
const longestSide = 512;
const out = document.getElementById("out");
const state = (window.__ghost = { model: null, device: null, dtypes: { embedDtype, visionDtype, decoderDtype }, results: [], errors: [] });
const show = (progress) => {
  document.title = progress;
  out.textContent = `${progress}\n${JSON.stringify(state, null, 1)}`;
};

const downscale = async (id) => {
  const blob = await (await fetch(`/frames/${encodeURIComponent(id)}.jpg`)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, longestSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  const scaled = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
  return RawImage.fromBlob(scaled);
};

const parse = (text) => {
  const lower = text.trim().toLowerCase();
  if (lower.startsWith("yes")) return true;
  if (lower.startsWith("no")) return false;
  return null;
};

const loadModel = async (modelId) => {
  const processor = await AutoProcessor.from_pretrained(modelId, { do_image_splitting: false });
  const model = await AutoModelForVision2Seq.from_pretrained(modelId, {
    dtype: { embed_tokens: embedDtype, vision_encoder: visionDtype, decoder_model_merged: decoderDtype },
    device: "webgpu",
  });
  state.device = "webgpu";
  return { processor, model };
};

const main = async () => {
  const [models, prompt, allFrames, done] = await Promise.all([
    fetch("/models").then((r) => r.json()),
    fetch("/prompt").then((r) => r.text()),
    fetch(`/frames?split=${split}`).then((r) => r.json()),
    fetch(`/done?run=${run}`).then((r) => r.json()),
  ]);
  state.model = models["ghost-local"];
  const frames = limit ? allFrames.slice(0, limit) : allFrames;
  const finished = new Set(done);
  show(`${frames.filter((f) => finished.has(f.id)).length}/${frames.length} loading`);
  const { processor, model } = await loadModel(state.model);
  const text = processor.apply_chat_template([{ role: "user", content: [{ type: "image" }, { type: "text", text: prompt }] }], { add_generation_prompt: true });
  let count = frames.filter((f) => finished.has(f.id)).length;
  for (const frame of frames) {
    if (finished.has(frame.id)) continue;
    const started = performance.now();
    let answer;
    try {
      const image = await downscale(frame.id);
      const inputs = await processor(text, [image], { do_image_splitting: false });
      const ids = await model.generate({ ...inputs, max_new_tokens: 3, do_sample: false });
      answer = processor.batch_decode(ids.slice(null, [inputs.input_ids.dims.at(-1), null]), { skip_special_tokens: true })[0].trim();
    } catch (error) {
      answer = `ERROR ${error}`;
      state.errors.push(`${frame.id}: ${error}`);
    }
    const result = { id: frame.id, answer, flagged: parse(answer), ms: Math.round(performance.now() - started) };
    state.results.push({ ...result, label: frame.label });
    await fetch(`/result?run=${run}`, { method: "POST", body: JSON.stringify(result) });
    count += 1;
    show(`${count}/${frames.length}`);
  }
  show(`${count}/${frames.length} done`);
};

main().catch((error) => {
  state.errors.push(String(error));
  show("error");
});
