import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { splitOf } from "./baseline-dom.ts";

type Label = "held" | "broken";
type Row = { id: string; label: Label; flagged: boolean | null; ms: number };

const framesDir = ".real/frames";
const rawDir = "eval/raw";
const endpoint = "https://ghost-eval-ai.customer0.dev";
const system = "workers-ai-vision";
const concurrency = 4;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const modelId = (): string => {
  const models = readJson("eval/models.json");
  if (!isRecord(models) || typeof models[system] !== "string") throw new Error("models.json missing model");
  return models[system];
};

const probeKey = readFileSync("probes/p1/.probe-key", "utf8").trim();
const prompt = readFileSync("eval/prompt.txt", "utf8").trim();

const loadFrames = (): { id: string; label: Label }[] =>
  readdirSync(framesDir)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      const value = readJson(join(framesDir, name));
      if (!isRecord(value) || value.ok !== true || typeof value.domain !== "string") return [];
      if (value.label !== "held" && value.label !== "broken") return [];
      return [{ id: value.domain, label: value.label }];
    })
    .sort((a, b) => a.id.localeCompare(b.id));

const parseReply = (text: string): boolean | null => {
  const lower = text.trim().toLowerCase();
  if (lower.startsWith("yes")) return true;
  if (lower.startsWith("no")) return false;
  return null;
};

const ask = async (id: string, model: string): Promise<{ text: string; ms: number }> => {
  const imageBase64 = readFileSync(join(framesDir, `${id}.jpg`)).toString("base64");
  const started = Date.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "x-probe-key": probeKey, "content-type": "application/json" },
    body: JSON.stringify({ model, prompt, imageBase64 }),
  });
  const body: unknown = await response.json();
  if (!response.ok || !isRecord(body) || typeof body.text !== "string") {
    return { text: `ERROR ${response.status} ${JSON.stringify(body)}`, ms: Date.now() - started };
  }
  return { text: body.text, ms: typeof body.ms === "number" ? body.ms : Date.now() - started };
};

const main = async () => {
  const model = modelId();
  const frames = loadFrames();
  const rows: Row[] = [];
  const replies: Record<string, string> = {};
  let next = 0;
  const worker = async () => {
    while (next < frames.length) {
      const frame = frames[next++];
      const { text, ms } = await ask(frame.id, model);
      replies[frame.id] = text.slice(0, 200);
      rows.push({ id: frame.id, label: frame.label, flagged: parseReply(text), ms });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  rows.sort((a, b) => a.id.localeCompare(b.id));
  mkdirSync(rawDir, { recursive: true });
  for (const split of ["dev", "holdout"] as const) {
    const splitRows = rows.filter((row) => splitOf(row.id) === split);
    writeFileSync(join(rawDir, `${system}.${split}.1.json`), `${JSON.stringify({ system, split, run: 1, rows: splitRows }, null, 1)}\n`);
    console.log(split, splitRows.length);
  }
  const sortedReplies = Object.fromEntries(Object.entries(replies).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join("eval/replies", `${system}.json`), `${JSON.stringify(sortedReplies, null, 1)}\n`);
  console.log("null", rows.filter((row) => row.flagged === null).length, "of", rows.length);
};

await main();
