import { readFileSync, writeFileSync } from "node:fs";
import { loadGymFrames } from "./frames.ts";

type Result = { id: string; answer: string; flagged: boolean | null };

const isResult = (value: unknown): value is Result =>
  typeof value === "object" && value !== null && "id" in value && "flagged" in value && typeof value.id === "string";

const system = "ghost-local";
const frames = loadGymFrames();

for (const run of [1, 2]) {
  const results = new Map(
    readFileSync(`.real/local-progress/gym-run-${run}.jsonl`, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line): unknown => JSON.parse(line))
      .filter(isResult)
      .map((result) => [result.id, result]),
  );
  const complete = frames.every((frame) => results.has(frame.id));
  console.log(system, "run", run, "frames", results.size, complete ? "complete" : "partial, not written");
  if (!complete) continue;
  const rows = frames.map((frame) => ({ id: frame.id, family: frame.family, label: frame.label, flagged: results.get(frame.id)?.flagged ?? null }));
  writeFileSync(`gym/raw/${system}.${run}.json`, `${JSON.stringify({ system, run, rows }, null, 1)}\n`);
}
