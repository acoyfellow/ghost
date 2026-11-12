import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { falsePositiveOnlyFamilies, heldOutFamilies, trainFamilies } from "./frames.ts";

type Row = { id: string; family: string; label: "held" | "broken"; flagged: boolean | null };

type Raw = { system: string; run: number; rows: Row[] };

const isRow = (value: unknown): value is Row =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  "family" in value &&
  "label" in value &&
  "flagged" in value &&
  typeof value.id === "string" &&
  typeof value.family === "string" &&
  (value.label === "held" || value.label === "broken") &&
  (value.flagged === null || typeof value.flagged === "boolean");

const isRaw = (value: unknown): value is Raw =>
  typeof value === "object" &&
  value !== null &&
  "system" in value &&
  "run" in value &&
  "rows" in value &&
  typeof value.system === "string" &&
  typeof value.run === "number" &&
  Array.isArray(value.rows) &&
  value.rows.every(isRow);

export const f1Of = (rows: Row[]) => {
  const truePositives = rows.filter((row) => row.label === "broken" && row.flagged === true).length;
  const flagged = rows.filter((row) => row.flagged === true).length;
  const broken = rows.filter((row) => row.label === "broken").length;
  const precision = flagged === 0 ? 0 : truePositives / flagged;
  const recall = broken === 0 ? 0 : truePositives / broken;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
};

const falsePositiveRate = (rows: Row[]) => {
  const held = rows.filter((row) => row.label === "held");
  return held.length === 0 ? 0 : held.filter((row) => row.flagged === true).length / held.length;
};

const round = (value: number) => Number(value.toFixed(4));

const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const bootstrap = (rows: Row[], samples = 1000) => {
  const random = seededRandom(20261111);
  const scores = Array.from({ length: samples }, () => f1Of(Array.from({ length: rows.length }, () => rows[Math.floor(random() * rows.length)] ?? rows[0]).filter((row): row is Row => row !== undefined))).sort(
    (a, b) => a - b,
  );
  return [round(scores[Math.floor(samples * 0.025)] ?? 0), round(scores[Math.floor(samples * 0.975)] ?? 0)];
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
};

const summarise = (raw: Raw) => {
  const heldOut = raw.rows.filter((row) => heldOutFamilies.includes(row.family));
  const train = raw.rows.filter((row) => trainFamilies.includes(row.family) && !falsePositiveOnlyFamilies.includes(row.family));
  const byFamily = Object.fromEntries(
    [...trainFamilies, ...heldOutFamilies].map((family) => {
      const rows = raw.rows.filter((row) => row.family === family);
      return [family, falsePositiveOnlyFamilies.includes(family) ? { fpr: round(falsePositiveRate(rows)) } : { f1: round(f1Of(rows)), fpr: round(falsePositiveRate(rows)) }];
    }),
  );
  return { run: raw.run, heldOutF1: round(f1Of(heldOut)), heldOutCI: bootstrap(heldOut), trainF1: round(f1Of(train)), nulls: raw.rows.filter((row) => row.flagged === null).length, byFamily };
};

export const scoreGym = (rawDir: string, candidate: string, margin: number, realF1: number | null, realThreshold: number) => {
  const runs = readdirSync(rawDir)
    .filter((name) => name.endsWith(".json"))
    .map((name): unknown => JSON.parse(readFileSync(join(rawDir, name), "utf8")))
    .filter(isRaw);
  const systems = [...new Set(runs.map((raw) => raw.system))].sort();
  const bySystem = Object.fromEntries(
    systems.map((system) => {
      const summaries = runs.filter((raw) => raw.system === system).map(summarise).sort((a, b) => a.heldOutF1 - b.heldOutF1);
      const reported = median(summaries.map((summary) => summary.heldOutF1));
      const representative = summaries.find((summary) => summary.heldOutF1 === reported) ?? summaries[0];
      return [system, { runs: summaries.length, heldOutF1: reported, spread: [summaries[0]?.heldOutF1 ?? 0, summaries.at(-1)?.heldOutF1 ?? 0], representative }];
    }),
  );
  const candidateScore = bySystem[candidate]?.heldOutF1 ?? null;
  const baselines = systems.filter((system) => system !== candidate);
  const bestBaseline = Math.max(0, ...baselines.map((system) => bySystem[system]?.heldOutF1 ?? 0));
  const conditions = {
    heldOutAtLeast090: candidateScore !== null && candidateScore >= 0.9,
    beatsBestBaselineBy005: candidateScore !== null && candidateScore >= bestBaseline + margin,
    realHoldoutAtLeast0883: realF1 !== null && realF1 >= realThreshold,
  };
  const verdict = candidateScore === null ? "unscored" : Object.values(conditions).every(Boolean) ? "proven" : "disproven";
  const failing = Object.entries(conditions).filter(([, passed]) => !passed).map(([name]) => name);
  return { verdict, candidate, candidateHeldOutF1: candidateScore, bestBaseline: round(bestBaseline), margin, realHoldoutF1: realF1, conditions, failing, bySystem };
};

if (import.meta.main) {
  const [candidate = "ghost-compiled-v2", realText] = process.argv.slice(2);
  const realF1 = realText === undefined ? null : Number(realText);
  const receipt = scoreGym("gym/raw", candidate, 0.05, realF1, 0.883);
  writeFileSync("gym/receipt.json", `${JSON.stringify(receipt, null, 1)}\n`);
  console.log(JSON.stringify(receipt, null, 1));
}
