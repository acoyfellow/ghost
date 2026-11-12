import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { splitOf } from "../eval/baseline-dom.ts";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const index: unknown = JSON.parse(readFileSync("eval/frames.index.json", "utf8"));
const rows = (Array.isArray(index) ? index : [])
  .filter(isRecord)
  .filter((entry) => entry.ok === true && typeof entry.domain === "string" && splitOf(entry.domain) === "holdout")
  .map((entry) => {
    const path = join(".real/frames-v2", `${String(entry.domain)}.json`);
    const record: unknown = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
    const observation = isRecord(record) && isRecord(record.observation) ? record.observation : null;
    return {
      id: String(entry.domain),
      label: entry.label,
      flagged: observation === null ? null : observation.hitIsTarget !== true,
      labelV2: isRecord(record) ? record.label_v2 : null,
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

writeFileSync("gym/real/dom-rule-v2-facts.holdout.1.json", `${JSON.stringify({ system: "dom-rule-v2-facts", split: "holdout", run: 1, rows: rows.map(({ labelV2, ...row }) => row) }, null, 1)}\n`);
const agree = rows.filter((row) => row.labelV2 === row.label).length;
console.log(JSON.stringify({ rows: rows.length, labelAgreement: agree, nulls: rows.filter((row) => row.flagged === null).length }));
