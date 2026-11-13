import { readFileSync, writeFileSync } from "node:fs";

type Row = { id: string; family?: string; label: string; flagged: boolean | null };

type Label = { id: string; label: string; labelV2: string | null };

const rowsOf = (path: string): Row[] => JSON.parse(readFileSync(path, "utf8")).rows;

const f1 = (rows: Row[]) => {
  const truePositives = rows.filter((row) => row.label === "broken" && row.flagged === true).length;
  const flagged = rows.filter((row) => row.flagged === true).length;
  const broken = rows.filter((row) => row.label === "broken").length;
  const precision = flagged === 0 ? 0 : truePositives / flagged;
  const recall = broken === 0 ? 0 : truePositives / broken;
  return Number((precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)).toFixed(4));
};

const heldOut = ["F3", "F6", "F7", "F9", "F10"];
const changesAfterObservation = ["F3", "F9"];

const candidate = rowsOf("gym/raw/ghost-compiled-v2.1.json").filter((row) => heldOut.includes(row.family ?? ""));
const broken = candidate.filter((row) => row.label === "broken");
const reachable = broken.filter((row) => !changesAfterObservation.includes(row.family ?? "")).length;
const recallCeiling = reachable / broken.length;
const observationCeiling = Number(((2 * recallCeiling) / (1 + recallCeiling)).toFixed(4));

const flagEverything = (family: string) => {
  const rows = candidate.filter((row) => row.family === family);
  const rate = rows.filter((row) => row.label === "broken").length / rows.length;
  return Number(((2 * rate) / (1 + rate)).toFixed(4));
};
const flagEverythingPooled = f1(candidate.map((row) => ({ ...row, flagged: true })));

const labels = new Map((JSON.parse(readFileSync("gym/real/labels-v2.holdout.json", "utf8")) as Label[]).map((row) => [row.id, row]));
const sameCollection = (path: string) =>
  f1(
    rowsOf(path)
      .filter((row) => row.flagged !== null && labels.get(row.id)?.labelV2 != null)
      .map((row) => ({ ...row, label: String(labels.get(row.id)?.labelV2) })),
  );

const audit = {
  note: "Post hoc. Does not change the frozen verdict in gym/receipt.json.",
  condition1: {
    candidateHeldOutF1: f1(candidate),
    brokenHeldOut: broken.length,
    brokenThatChangeAfterObservation: broken.length - reachable,
    observationOnlyCeilingF1: observationCeiling,
    threshold: 0.9,
    finding: "The threshold is above the ceiling any observation-only rule can reach.",
  },
  condition3: {
    labelsChanged: [...labels.values()].filter((row) => row.labelV2 !== null && row.labelV2 !== row.label).length,
    candidateOldLabels: f1(rowsOf("gym/real/ghost-compiled-v2.holdout.1.json")),
    candidateSameCollectionLabels: sameCollection("gym/real/ghost-compiled-v2.holdout.1.json"),
    domRuleSameCollectionLabels: sameCollection("gym/real/dom-rule-v2-facts.holdout.1.json"),
    threshold: 0.883,
  },
  flagEverything: { pooled: flagEverythingPooled, ...Object.fromEntries(heldOut.map((family) => [family, flagEverything(family)])) },
};

writeFileSync("gym/receipts/audit.json", `${JSON.stringify(audit, null, 1)}\n`);
console.log(JSON.stringify(audit, null, 1));
