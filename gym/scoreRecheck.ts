import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { blocked, type Observation } from "./compiled/rule.ts";

type Label = "held" | "broken";

type Record_ = {
  id: string;
  family: string | null;
  label: Label;
  truth: Label | null;
  early: Observation | null;
  act0: Observation | null;
  recheck: Observation | null;
  recheckToClickMs: number | null;
  recheckPlannedHit: boolean | null;
};

type Row = { id: string; family: string | null; label: Label; flagged: boolean | null };

const heldOut = ["F3", "F6", "F7", "F9", "F10"];
const trainFamilies = ["F1", "F2", "F4", "F5", "F8"];
const leakingKeys = new Set(["finalUrl", "title"]);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const observationOf = (value: unknown): Observation | null =>
  isRecord(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => !leakingKeys.has(key))) : null;

const readSet = (dir: string): Record_[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name): unknown => JSON.parse(readFileSync(join(dir, name), "utf8")))
        .filter(isRecord)
        .map((raw) => ({
          id: String(raw.id),
          family: typeof raw.family === "string" ? raw.family : null,
          label: raw.label === "broken" ? "broken" : "held",
          truth: raw.truth === "broken" || raw.truth === "held" ? raw.truth : null,
          early: observationOf(raw.early),
          act0: observationOf(raw.act0),
          recheck: observationOf(raw.recheck),
          recheckToClickMs: typeof raw.recheckToClickMs === "number" ? raw.recheckToClickMs : null,
          recheckPlannedHit: typeof raw.recheckPlannedHit === "boolean" ? raw.recheckPlannedHit : null,
        }))
    : [];

const decide = (observation: Observation | null, judge: (observation: Observation) => boolean) => (observation === null ? null : judge(observation));

const systems: Record<string, (record: Record_) => boolean | null> = {
  "rule-early": (record) => decide(record.early, blocked),
  "rule-act0": (record) => decide(record.act0, blocked),
  "rule-recheck": (record) => decide(record.recheck, blocked),
  "rule-recheck-planned": (record) =>
    record.recheck === null || record.recheckPlannedHit === null ? null : blocked({ ...record.recheck, hitIsTarget: record.recheckPlannedHit }),
  "dom-recheck": (record) => decide(record.recheck, (observation) => observation.hitIsTarget !== true),
  "flag-everything": () => true,
};

const f1 = (rows: Row[]) => {
  const truePositives = rows.filter((row) => row.label === "broken" && row.flagged === true).length;
  const flagged = rows.filter((row) => row.flagged === true).length;
  const broken = rows.filter((row) => row.label === "broken").length;
  const precision = flagged === 0 ? 0 : truePositives / flagged;
  const recall = broken === 0 ? 0 : truePositives / broken;
  return Number((precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)).toFixed(4));
};

const fpr = (rows: Row[]) => {
  const held = rows.filter((row) => row.label === "held");
  return held.length === 0 ? 0 : Number((held.filter((row) => row.flagged === true).length / held.length).toFixed(4));
};

const decisionsPath = "gym/real/recheck-decisions.json";

type Decision = { id: string; set: "gym" | "real"; family: string | null; label: Label; recheckToClickMs: number | null; flagged: Record<string, boolean | null> };

const toDecision = (set: "gym" | "real") => (record: Record_): Decision => ({
  id: record.id,
  set,
  family: record.family,
  label: record.label,
  recheckToClickMs: record.recheckToClickMs,
  flagged: Object.fromEntries(Object.entries(systems).map(([system, judge]) => [system, judge(record)])),
});

const fromFrames = process.argv[2] === "frames";
if (fromFrames) {
  const decisions = [
    ...readSet(".real/recheck-gym").filter((record) => record.truth === null || record.truth === record.label).map(toDecision("gym")),
    ...readSet(".real/recheck-real").map(toDecision("real")),
  ];
  writeFileSync(decisionsPath, `${JSON.stringify(decisions)}\n`);
}
const decisions: Decision[] = JSON.parse(readFileSync(decisionsPath, "utf8"));
const gym = decisions.filter((decision) => decision.set === "gym");
const real = decisions.filter((decision) => decision.set === "real");

const rowsFor = (records: Decision[], system: string): Row[] =>
  records.map((record) => ({ id: record.id, family: record.family, label: record.label, flagged: record.flagged[system] ?? null }));

const scoreGym = (system: string) => {
  const rows = rowsFor(gym, system);
  const inFamily = (family: string) => rows.filter((row) => row.family === family);
  return {
    heldOutF1: f1(rows.filter((row) => heldOut.includes(row.family ?? ""))),
    byFamily: Object.fromEntries([...trainFamilies, ...heldOut].map((family) => [family, { f1: f1(inFamily(family)), fpr: fpr(inFamily(family)) }])),
    nulls: rows.filter((row) => row.flagged === null).length,
  };
};

const scores = Object.fromEntries(Object.keys(systems).map((system) => [system, scoreGym(system)]));
const realScores = Object.fromEntries(Object.keys(systems).map((system) => [system, f1(rowsFor(real, system).filter((row) => row.flagged !== null))]));

const family = (system: string, name: string) => scores[system]?.byFamily[name] ?? { f1: 0, fpr: 1 };
const heldOutOf = (system: string) => scores[system]?.heldOutF1 ?? 0;
const realOf = (system: string) => realScores[system] ?? 0;

const latencies = [...gym, ...real].flatMap((record) => (record.recheckToClickMs === null ? [] : [record.recheckToClickMs])).sort((a, b) => a - b);
const percentile = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] ?? null;

const predictions = {
  p1ReproducesRound2: Math.abs(heldOutOf("rule-early") - 0.7374) <= 0.02,
  p2Act0StillBlindOnF3F9: family("rule-act0", "F3").f1 <= 0.3 && family("rule-act0", "F9").f1 <= 0.3,
  p3aRecheckF3: family("rule-recheck", "F3").f1 >= 0.9,
  p3bRecheckF9: family("rule-recheck", "F9").f1 >= 0.9,
  p3cPooledHeldOut: heldOutOf("rule-recheck") >= 0.9,
  p3cNoFalseAlarms: family("rule-recheck", "F1").fpr <= 0.02 && family("rule-recheck", "F5").fpr <= 0.02,
  p3dBeatsDomRecheck: heldOutOf("rule-recheck") - heldOutOf("dom-recheck") >= 0.05,
  p4RealNoRegression: realOf("rule-recheck") >= realOf("rule-early") - 0.02,
};

const verdictKeys = ["p1ReproducesRound2", "p3aRecheckF3", "p3bRecheckF9", "p3cPooledHeldOut", "p3cNoFalseAlarms", "p4RealNoRegression"] as const;
const failing = verdictKeys.filter((key) => !predictions[key]);

const receipt = {
  test: "gym/RECHECK.md",
  verdict: failing.length === 0 ? "proven" : "disproven",
  failing,
  predictions,
  counts: { gym: gym.length, real: real.length },
  gym: scores,
  realHoldoutF1: realScores,
  recheckToClickMs: { p50: percentile(0.5), p95: percentile(0.95), n: latencies.length },
};

writeFileSync("gym/receipts/recheck.json", `${JSON.stringify(receipt, null, 1)}\n`);
console.log(JSON.stringify({ verdict: receipt.verdict, failing, counts: receipt.counts, heldOut: Object.fromEntries(Object.keys(systems).map((system) => [system, heldOutOf(system)])), real: realScores, latency: receipt.recheckToClickMs }, null, 1));
