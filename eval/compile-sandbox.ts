import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { splitOf } from "./baseline-dom.ts";

const framesDir = ".real/frames";
const sandbox = "/tmp/ghost-plan/compile";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const devFrames = readdirSync(framesDir)
  .filter((name) => name.endsWith(".json"))
  .map((name): unknown => JSON.parse(readFileSync(join(framesDir, name), "utf8")))
  .filter(isRecord)
  .filter((frame) => frame.ok === true && typeof frame.domain === "string" && splitOf(frame.domain) === "dev")
  .map((frame) => ({ id: frame.domain, label: frame.label, facts: { target: frame.target, box: frame.box, dom: frame.domFacts } }))
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));

mkdirSync(sandbox, { recursive: true });
const devText = `${devFrames.map((frame) => JSON.stringify(frame)).join("\n")}\n`;
writeFileSync(join(sandbox, "dev.jsonl"), devText);
writeFileSync(
  "eval/compiled/sandbox.manifest.json",
  `${JSON.stringify({ split: "dev", count: devFrames.length, sha256: createHash("sha256").update(devText).digest("hex"), ids: devFrames.map((frame) => frame.id) }, null, 1)}\n`,
);
console.log("dev frames in sandbox:", devFrames.length);
