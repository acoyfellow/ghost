import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectWithRetry, parseLabel, runPool, type CollectResponse, type Label } from "./collectClient";

type IndexEntry = { family: string; seed: number; label: Label | null; sha256: string | null; dropped: boolean; error?: string };
type Dropped = { family: string; seed: number; truth: Label | null; label: Label | null; reason: string };
type Job = { family: string; seed: number };

const root = import.meta.dir;
const outDir = join(root, "..", ".real", "gym");
const indexPath = join(root, "frames.index.json");
const droppedPath = join(root, "receipts", "dropped.json");
const site = "https://ghost.customer0.dev/gym";
const families = Array.from({ length: 10 }, (_, i) => `F${i + 1}`);
const seeds = Array.from({ length: 50 }, (_, i) => i);
const jobs: Job[] = families.flatMap((family) => seeds.map((seed) => ({ family, seed })));
const key = (job: Job) => `${job.family}-${job.seed}`;

mkdirSync(outDir, { recursive: true });
mkdirSync(join(root, "receipts"), { recursive: true });

const readList = <T>(path: string, guard: (value: unknown) => value is T): T[] => {
  if (!existsSync(path)) return [];
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(parsed) ? parsed.filter(guard) : [];
};
const isJob = (value: unknown): value is Job =>
  typeof value === "object" && value !== null && "family" in value && "seed" in value && typeof value.family === "string" && typeof value.seed === "number";
const isIndexEntry = (value: unknown): value is IndexEntry => isJob(value) && "sha256" in value && "dropped" in value;
const isDropped = (value: unknown): value is Dropped => isJob(value) && "truth" in value && "reason" in value;
const entries = new Map<string, IndexEntry>();
for (const entry of readList(indexPath, isIndexEntry)) entries.set(key(entry), entry);
const dropped = new Map<string, Dropped>();
for (const entry of readList(droppedPath, isDropped)) dropped.set(key(entry), entry);

const flush = () => {
  const ordered = jobs.flatMap((job) => entries.get(key(job)) ?? []);
  writeFileSync(indexPath, JSON.stringify(ordered, null, 2) + "\n");
  const droppedOrdered = jobs.flatMap((job) => dropped.get(key(job)) ?? []);
  writeFileSync(droppedPath, JSON.stringify(droppedOrdered, null, 2) + "\n");
};

const fetchTruth = async (job: Job): Promise<Label | null> => {
  try {
    const response = await fetch(`${site}/${job.family}/${job.seed}`, { signal: AbortSignal.timeout(30000) });
    return parseLabel(response.headers.get("x-ghost-truth"));
  } catch {
    return null;
  }
};

const record = (job: Job, result: CollectResponse, truth: Label | null) => {
  const label = result.ok ? (result.label ?? null) : null;
  if (!result.ok || !result.jpegBase64 || label === null) {
    entries.set(key(job), { ...job, label: null, sha256: null, dropped: false, error: result.error ?? "no label" });
    flush();
    return;
  }
  const bytes = Buffer.from(result.jpegBase64, "base64");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const disagrees = truth !== null && truth !== label;
  writeFileSync(join(outDir, `${key(job)}.jpg`), bytes);
  writeFileSync(join(outDir, `${key(job)}.json`), JSON.stringify({ ...job, observation: result.observation, outcome: result.outcome, label, truth }, null, 2) + "\n");
  entries.set(key(job), { ...job, label, sha256, dropped: disagrees });
  if (disagrees) dropped.set(key(job), { ...job, truth, label, reason: "click label disagrees with truth" });
  flush();
};

const pending = jobs.filter((job) => !existsSync(join(outDir, `${key(job)}.json`)));
let done = 0;

await runPool(pending, 3, async (job) => {
  const [truth, result] = await Promise.all([fetchTruth(job), collectWithRetry(`${site}/${job.family}/${job.seed}`, "[data-ghost-target]")]);
  record(job, result, truth);
  done++;
  console.log(`${done}/${pending.length} ${key(job)} label=${result.label ?? `FAIL ${result.error}`} truth=${truth}`);
});

flush();
const all = [...entries.values()];
console.log(JSON.stringify({ total: all.length, failed: all.filter((e) => e.label === null).length, dropped: all.filter((e) => e.dropped).length }));
