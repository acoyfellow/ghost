import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadGymFrames, trainFamilies } from "./frames.ts";

const sandbox = "/tmp/ghost-plan/compile2";

const opaqueId = (id: string) => createHash("sha256").update(`ghost-gym-opaque:${id}`).digest("hex").slice(0, 12);

const leakingKeys = new Set(["finalUrl", "title"]);

const withoutLeaks = (observation: Record<string, unknown>) => Object.fromEntries(Object.entries(observation).filter(([key]) => !leakingKeys.has(key)));

const rows = loadGymFrames()
  .filter((frame) => trainFamilies.includes(frame.family))
  .map((frame) => ({ id: opaqueId(frame.id), label: frame.label, observation: withoutLeaks(frame.observation) }))
  .sort((a, b) => a.id.localeCompare(b.id));

mkdirSync(sandbox, { recursive: true });
const text = `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
writeFileSync(join(sandbox, "train.jsonl"), text);
writeFileSync(
  "gym/compiled/sandbox.manifest.json",
  `${JSON.stringify({ families: trainFamilies, count: rows.length, broken: rows.filter((row) => row.label === "broken").length, sha256: createHash("sha256").update(text).digest("hex") }, null, 1)}\n`,
);
console.log("train rows in sandbox:", rows.length);
