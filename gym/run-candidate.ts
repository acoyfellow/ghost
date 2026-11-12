import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { splitOf } from "../eval/baseline-dom.ts";
import { blocked } from "./compiled/rule.ts";
import { loadGymFrames } from "./frames.ts";

const system = "ghost-compiled-v2";
const leakingKeys = new Set(["finalUrl", "title"]);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const observationOf = (observation: Record<string, unknown>) => Object.fromEntries(Object.entries(observation).filter(([key]) => !leakingKeys.has(key)));

const gymRows = loadGymFrames().map((frame) => ({ id: frame.id, family: frame.family, label: frame.label, flagged: blocked(observationOf(frame.observation)) }));
writeFileSync(join("gym/raw", `${system}.1.json`), `${JSON.stringify({ system, run: 1, rows: gymRows }, null, 1)}\n`);

const index: unknown = JSON.parse(readFileSync("eval/frames.index.json", "utf8"));
const realRows = (Array.isArray(index) ? index : [])
  .filter(isRecord)
  .filter((entry) => entry.ok === true && typeof entry.domain === "string" && splitOf(entry.domain) === "holdout")
  .map((entry) => {
    const domain = String(entry.domain);
    const path = join(".real/frames-v2", `${domain}.json`);
    const record: unknown = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
    const observation = isRecord(record) && isRecord(record.observation) ? record.observation : null;
    return { id: domain, label: entry.label, flagged: observation === null ? null : blocked(observationOf(observation)), recollected: observation !== null };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(join("gym/real", `${system}.holdout.1.json`), `${JSON.stringify({ system, split: "holdout", run: 1, rows: realRows.map(({ recollected, ...row }) => row) }, null, 1)}\n`);
console.log(system, "gym", gymRows.length, "real holdout", realRows.length, "recollected", realRows.filter((row) => row.recollected).length);
