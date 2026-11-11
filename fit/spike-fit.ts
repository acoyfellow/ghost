#!/usr/bin/env bun
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Row = { label: "held" | "broken"; flagged: boolean | null };

type Raw = { system: string; split: string; run: number; rows: Row[] };

type Spec = {
  candidate: string;
  baselines: string[];
  rawDir: string;
  split: string;
  metric: "f1";
  margin: number;
  polish: string[];
};

type Decision = "build" | "test-existing" | "stop";

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

const repo = process.argv[2] ?? process.cwd();
const readText = (path: string) => readFileSync(join(repo, path), "utf8");
const exists = (path: string) => existsSync(join(repo, path));

const decisions: ReadonlyArray<Decision> = ["build", "test-existing", "stop"];

const decisionOf = (fit: string): Decision | null => {
  const word = fit.match(/^Decision:\s*(\S+)\s*$/m)?.[1];

  return decisions.find((decision) => decision === word) ?? null;
};

const linksOf = (fit: string) => fit.match(/https?:\/\/\S+/g) ?? [];

const f1Of = (rows: Row[]) => {
  const truePositives = rows.filter((row) => row.label === "broken" && row.flagged === true).length;
  const flagged = rows.filter((row) => row.flagged === true).length;
  const broken = rows.filter((row) => row.label === "broken").length;
  const precision = flagged === 0 ? 0 : truePositives / flagged;
  const recall = broken === 0 ? 0 : truePositives / broken;

  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
};

const worstScore = (runs: Raw[]) => Math.min(...runs.map((raw) => f1Of(raw.rows)));
const bestScore = (runs: Raw[]) => Math.max(...runs.map((raw) => f1Of(raw.rows)));

const checkFitDoc = () => {
  if (!exists("FIT.md")) {
    fail("FIT.md missing: write the prior-art search before building");

    return null;
  }

  const fit = readText("FIT.md");
  const links = linksOf(fit);

  if (links.length < 3) fail(`FIT.md cites ${links.length} links; need at least 3 (existing tools and a public benchmark)`);

  if (!/^## Existing tools/m.test(fit)) fail("FIT.md needs a '## Existing tools' section");

  if (!/^## Public benchmark/m.test(fit)) fail("FIT.md needs a '## Public benchmark' section");
  const decision = decisionOf(fit);

  if (!decision) fail("FIT.md needs a line 'Decision: build | test-existing | stop'");

  return decision;
};

const loadRuns = (spec: Spec) => {
  const dir = join(repo, spec.rawDir);

  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name): Raw => JSON.parse(readFileSync(join(dir, name), "utf8")))
    .filter((raw) => raw.split === spec.split);
};

const checkBaselines = (spec: Spec) => {
  const runs = loadRuns(spec);
  const bySystem = (system: string) => runs.filter((raw) => raw.system === system);
  const scores: Record<string, number> = {};

  for (const system of spec.baselines) {
    const systemRuns = bySystem(system);

    if (systemRuns.length === 0) fail(`baseline '${system}' has no ${spec.split} runs in ${spec.rawDir}`);
    else scores[system] = Number(bestScore(systemRuns).toFixed(4));
  }

  const candidateRuns = bySystem(spec.candidate);

  if (candidateRuns.length === 0) {
    fail(`candidate '${spec.candidate}' has no ${spec.split} runs`);

    return { wins: false, scores };
  }

  const candidate = Number(worstScore(candidateRuns).toFixed(4));
  scores[spec.candidate] = candidate;
  const best = Math.max(0, ...spec.baselines.map((system) => scores[system] ?? 0));

  return { wins: candidate >= best + spec.margin, scores, candidate, best };
};

const checkPolish = (spec: Spec, wins: boolean, decision: Decision | null) => {
  const present = spec.polish.filter(exists);

  if (present.length === 0) return;

  if (wins && decision === "build") return;
  const readme = exists("README.md") ? readText("README.md") : "";
  const top = readme.split("\n").slice(0, 12).join("\n");

  if (!/disproven|did not work|does not beat/i.test(top)) {
    fail(`polish exists (${present.join(", ")}) without a win and a build decision, and the README top does not say it is disproven`);
  }
};

const main = () => {
  const decision = checkFitDoc();

  if (!exists("fit/spec.json")) {
    fail("fit/spec.json missing: name the candidate, baselines, raw run dir, split, metric and polish paths");

    return { decision };
  }

  const spec: Spec = JSON.parse(readText("fit/spec.json"));

  if (spec.baselines.length < 2) fail("need at least 2 baselines (a rules or regex baseline and the best existing tool)");
  const result = checkBaselines(spec);
  checkPolish(spec, result.wins, decision);

  return { decision, ...result };
};

const result = main();

console.log(JSON.stringify(result));

if (failures.length > 0) {
  for (const message of failures) console.error(`FIT FAIL: ${message}`);
  process.exit(1);
}

console.log("fit: pass");
