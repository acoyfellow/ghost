import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Row = { id: string; label: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const holdout: Row[] = JSON.parse(readFileSync("gym/real/dom-rule-v2-facts.holdout.1.json", "utf8")).rows;

const labels = holdout.map((row) => {
  const path = join(".real/frames-v2", `${row.id}.json`);
  const record: unknown = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  const labelV2 = isRecord(record) && (record.label_v2 === "held" || record.label_v2 === "broken") ? record.label_v2 : null;
  return { id: row.id, label: row.label, labelV2 };
});

writeFileSync("gym/real/labels-v2.holdout.json", `${JSON.stringify(labels, null, 1)}\n`);
console.log("labels", labels.length, "changed", labels.filter((row) => row.labelV2 !== null && row.labelV2 !== row.label).length);
