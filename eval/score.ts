#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Label = "held" | "broken";

export type Row = { id: string; label: Label; flagged: boolean | null; ms?: number };

export type Raw = { system: string; split: string; run: number; rows: Row[] };

export type SystemSummary = {
  system: string;
  runs: number;
  worstF1: number;
  bestF1: number;
  precision: number;
  recall: number;
  nulls: number;
  msP50: number | null;
  msP95: number | null;
};

export type Verdict = "proven" | "disproven" | "unscored";

export type Judgement = { verdict: Verdict; candidateWorstF1: number | null; bestBaselineF1: number | null };

export type Receipt = Judgement & {
  split: string;
  candidate: string;
  baselines: string[];
  margin: number;
  systems: SystemSummary[];
};

const HOLDOUT = "holdout";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isLabel = (value: unknown): value is Label => value === "held" || value === "broken";

const isFlag = (value: unknown): value is boolean | null =>
  value === true || value === false || value === null;

const isRow = (value: unknown): value is Row =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isLabel(value.label) &&
  isFlag(value.flagged) &&
  (value.ms === undefined || typeof value.ms === "number");

export const isRaw = (value: unknown): value is Raw =>
  isRecord(value) &&
  typeof value.system === "string" &&
  typeof value.split === "string" &&
  typeof value.run === "number" &&
  Array.isArray(value.rows) &&
  value.rows.every(isRow);

const round4 = (value: number) => Number(value.toFixed(4));

export const f1Of = (rows: Row[]) => {
  const truePositives = rows.filter((row) => row.label === "broken" && row.flagged === true).length;
  const flagged = rows.filter((row) => row.flagged === true).length;
  const broken = rows.filter((row) => row.label === "broken").length;
  const precision = flagged === 0 ? 0 : truePositives / flagged;
  const recall = broken === 0 ? 0 : truePositives / broken;

  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
};

const precisionOf = (rows: Row[]) => {
  const truePositives = rows.filter((row) => row.label === "broken" && row.flagged === true).length;
  const flagged = rows.filter((row) => row.flagged === true).length;

  return flagged === 0 ? 0 : truePositives / flagged;
};

const recallOf = (rows: Row[]) => {
  const truePositives = rows.filter((row) => row.label === "broken" && row.flagged === true).length;
  const broken = rows.filter((row) => row.label === "broken").length;

  return broken === 0 ? 0 : truePositives / broken;
};

export const percentile = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));

  return sorted[index] ?? null;
};

export const summarize = (runs: Raw[], system: string): SystemSummary | null => {
  const systemRuns = runs.filter((raw) => raw.system === system);
  if (systemRuns.length === 0) return null;

  const scored = systemRuns.map((raw) => ({ raw, f1: f1Of(raw.rows) }));
  const worst = scored.reduce((low, current) => (current.f1 < low.f1 ? current : low));
  const best = scored.reduce((high, current) => (current.f1 > high.f1 ? current : high));
  const allRows = systemRuns.flatMap((raw) => raw.rows);
  const ms = allRows.flatMap((row) => (row.ms === undefined ? [] : [row.ms]));

  return {
    system,
    runs: systemRuns.length,
    worstF1: round4(worst.f1),
    bestF1: round4(best.f1),
    precision: round4(precisionOf(worst.raw.rows)),
    recall: round4(recallOf(worst.raw.rows)),
    nulls: allRows.filter((row) => row.flagged === null).length,
    msP50: percentile(ms, 50),
    msP95: percentile(ms, 95),
  };
};

export const judge = (
  candidate: SystemSummary | null,
  baselines: (SystemSummary | null)[],
  margin: number,
): Judgement => {
  const usable = baselines.filter((summary): summary is SystemSummary => summary !== null);

  if (candidate === null || usable.length !== baselines.length) {
    return { verdict: "unscored", candidateWorstF1: candidate?.worstF1 ?? null, bestBaselineF1: null };
  }

  const bestBaselineF1 = Math.max(...usable.map((summary) => summary.bestF1));
  const verdict: Verdict = candidate.worstF1 >= bestBaselineF1 + margin ? "proven" : "disproven";

  return { verdict, candidateWorstF1: candidate.worstF1, bestBaselineF1 };
};

export const parseRaw = (name: string, text: string): Raw => {
  const parsed: unknown = JSON.parse(text);
  if (!isRaw(parsed)) throw new Error(`${name} is not a raw run file`);

  return parsed;
};

const loadRaws = (rawDir: string) =>
  readdirSync(rawDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => parseRaw(name, readFileSync(join(rawDir, name), "utf8")));

export const buildReceipt = (raws: Raw[], candidate: string, margin: number, baselines: string[]): Receipt => {
  const holdout = raws.filter((raw) => raw.split === HOLDOUT);
  const candidateSummary = summarize(holdout, candidate);
  const baselineSummaries = baselines.map((system) => summarize(holdout, system));
  const systems = [candidateSummary, ...baselineSummaries].filter(
    (summary): summary is SystemSummary => summary !== null,
  );

  return {
    split: HOLDOUT,
    candidate,
    baselines,
    margin,
    systems,
    ...judge(candidateSummary, baselineSummaries, margin),
  };
};

const usage = "usage: bun eval/score.ts <rawDir> <candidate> <margin> <baseline...>";

const main = () => {
  const [rawDir, candidate, marginText, ...baselines] = process.argv.slice(2);
  const margin = Number(marginText);

  if (!rawDir || !candidate || marginText === undefined || !Number.isFinite(margin) || baselines.length === 0) {
    console.error(usage);
    process.exit(2);
  }

  const receipt = buildReceipt(loadRaws(rawDir), candidate, margin, baselines);
  const text = JSON.stringify(receipt, null, 2);
  writeFileSync(join(import.meta.dir, "receipt.json"), `${text}\n`);
  console.log(text);
};

if (import.meta.main) main();
