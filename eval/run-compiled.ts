import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { splitOf } from "./baseline-dom.ts";
import { blocked } from "./compiled/rule.ts";

const framesDir = ".real/frames";
const system = "ghost-compiled";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const frames = readdirSync(framesDir)
  .filter((name) => name.endsWith(".json"))
  .map((name): unknown => JSON.parse(readFileSync(join(framesDir, name), "utf8")))
  .filter(isRecord)
  .filter((frame) => frame.ok === true && typeof frame.domain === "string" && (frame.label === "held" || frame.label === "broken"))
  .sort((a, b) => String(a.domain).localeCompare(String(b.domain)));

for (const split of ["dev", "holdout"] as const) {
  const rows = frames
    .filter((frame) => splitOf(String(frame.domain)) === split)
    .map((frame) => {
      const started = performance.now();
      const flagged = blocked({ target: frame.target, box: frame.box, dom: frame.domFacts });
      return { id: String(frame.domain), label: frame.label, flagged, ms: Number((performance.now() - started).toFixed(3)) };
    });
  writeFileSync(join("eval/raw", `${system}.${split}.1.json`), `${JSON.stringify({ system, split, run: 1, rows }, null, 1)}\n`);
  console.log(system, split, rows.length);
}
