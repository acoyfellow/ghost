import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadGymFrames } from "./frames.ts";

type Row = { id: string; family: string; label: string; flagged: boolean | null };

const imagesDir = ".real/gym";
const rawDir = "gym/raw";
const repliesDir = "gym/replies";
const endpoint = process.env.WAI_ENDPOINT ?? "https://ghost-eval-ai.customer0.dev";
const system = "workers-ai-vision";
const concurrency = 4;
const run = Number(process.argv[2] ?? "1");

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const modelId = (): string => {
  const models: unknown = JSON.parse(readFileSync("eval/models.json", "utf8"));
  if (!isRecord(models) || typeof models[system] !== "string") throw new Error("models.json missing model");
  return models[system];
};

const probeKey = readFileSync("probes/p1/.probe-key", "utf8").trim();
const prompt = readFileSync("eval/prompt.txt", "utf8").trim();

const parseReply = (text: string): boolean | null => {
  const lower = text.trim().toLowerCase();
  if (lower.startsWith("yes")) return true;
  if (lower.startsWith("no")) return false;
  return null;
};

const ask = async (id: string, model: string): Promise<string> => {
  const imageBase64 = readFileSync(join(imagesDir, `${id}.jpg`)).toString("base64");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "x-probe-key": probeKey, "content-type": "application/json" },
    body: JSON.stringify({ model, prompt, imageBase64 }),
  });
  const body: unknown = await response.json();
  if (!response.ok || !isRecord(body) || typeof body.text !== "string") return `ERROR ${response.status} ${JSON.stringify(body)}`;
  return body.text;
};

const main = async () => {
  const model = modelId();
  const frames = loadGymFrames(imagesDir);
  const rows: Row[] = [];
  const replies: Record<string, string> = {};
  let next = 0;
  const worker = async () => {
    while (next < frames.length) {
      const frame = frames[next++];
      const text = await ask(frame.id, model);
      replies[frame.id] = text.slice(0, 200);
      rows.push({ id: frame.id, family: frame.family, label: frame.label, flagged: parseReply(text) });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const order = new Map(frames.map((frame, index) => [frame.id, index]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(repliesDir, { recursive: true });
  writeFileSync(join(rawDir, `${system}.${run}.json`), `${JSON.stringify({ system, run, rows }, null, 1)}\n`);
  const sorted = Object.fromEntries(frames.map((frame) => [frame.id, replies[frame.id]]));
  writeFileSync(join(repliesDir, `${system}.${run}.json`), `${JSON.stringify(sorted, null, 1)}\n`);
  console.log("run", run, "rows", rows.length, "null", rows.filter((row) => row.flagged === null).length);
};

await main();
