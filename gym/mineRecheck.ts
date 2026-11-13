import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectWithRetry, parseLabel, runPool } from "./collectClient";
import { splitOf } from "../eval/baseline-dom";

type Job = { id: string; url: string; selector: string | null; family: string | null };

const set = process.argv[2] === "real" ? "real" : "gym";
const root = import.meta.dir;
const outDir = join(root, "..", ".real", set === "gym" ? "recheck-gym" : "recheck-real");
const site = "https://ghost.customer0.dev/gym";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const gymJobs = (): Job[] =>
  Array.from({ length: 10 }, (_, index) => `F${index + 1}`).flatMap((family) =>
    Array.from({ length: 50 }, (_, seed) => ({ id: `${family}-${seed}`, url: `${site}/${family}/${seed}`, selector: "[data-ghost-target]", family })),
  );

const realJobs = (): Job[] => {
  const index: unknown = JSON.parse(readFileSync(join(root, "..", "eval", "frames.index.json"), "utf8"));
  return (Array.isArray(index) ? index : [])
    .filter(isRecord)
    .filter((entry) => entry.ok === true && typeof entry.domain === "string" && splitOf(entry.domain) === "holdout")
    .map((entry) => ({ id: String(entry.domain), url: `https://${String(entry.domain)}`, selector: null, family: null }));
};

const fetchTruth = async (job: Job) => {
  if (job.family === null) return null;
  try {
    const response = await fetch(job.url, { signal: AbortSignal.timeout(30000) });
    return parseLabel(response.headers.get("x-ghost-truth"));
  } catch {
    return null;
  }
};

mkdirSync(outDir, { recursive: true });
const jobs = set === "gym" ? gymJobs() : realJobs();
const pending = jobs.filter((job) => !existsSync(join(outDir, `${job.id}.json`)));
let done = 0;

await runPool(pending, 3, async (job) => {
  const [truth, result] = await Promise.all([fetchTruth(job), collectWithRetry(job.url, job.selector)]);
  done++;
  if (!result.ok || result.label === undefined) {
    console.log(`${done}/${pending.length} ${job.id} FAIL ${result.error}`);
    return;
  }
  const record = {
    id: job.id,
    family: job.family,
    label: result.label,
    truth,
    early: result.observation,
    act0: result.act0,
    recheck: result.recheck,
    recheckToClickMs: result.recheckToClickMs,
    recheckPlannedHit: result.recheckPlannedHit,
    outcome: result.outcome,
  };
  writeFileSync(join(outDir, `${job.id}.json`), `${JSON.stringify(record, null, 1)}\n`);
  console.log(`${done}/${pending.length} ${job.id} label=${result.label} truth=${truth} recheckToClickMs=${result.recheckToClickMs}`);
});
console.log(`done ${set}: ${jobs.filter((job) => existsSync(join(outDir, `${job.id}.json`))).length}/${jobs.length}`);
