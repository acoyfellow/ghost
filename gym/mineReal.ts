import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectWithRetry, runPool, type CollectResponse, type Label } from "./collectClient";

type OldEntry = { domain: string; label: Label | null; ok: boolean };
type NewEntry = { domain: string; label: Label | null; label_v2: Label | null; sha256: string | null; ok: boolean; error?: string };

const root = import.meta.dir;
const outDir = join(root, "..", ".real", "frames-v2");
const indexPath = join(root, "..", "eval", "frames-v2.index.json");
const isOldEntry = (value: unknown): value is OldEntry =>
  typeof value === "object" && value !== null && "domain" in value && "ok" in value && typeof value.domain === "string" && value.ok === true;
const isNewEntry = (value: unknown): value is NewEntry => isOldEntry(value) && "label_v2" in value;
const readList = <T>(path: string, guard: (value: unknown) => value is T): T[] => {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(parsed) ? parsed.filter(guard) : [];
};
const oldEntries = readList(join(root, "..", "eval", "frames.index.json"), isOldEntry);

mkdirSync(outDir, { recursive: true });

const entries = new Map<string, NewEntry>();
if (existsSync(indexPath)) for (const entry of readList(indexPath, isNewEntry)) entries.set(entry.domain, entry);

const flush = () => {
  const ordered = oldEntries.flatMap((e) => entries.get(e.domain) ?? []);
  writeFileSync(indexPath, JSON.stringify(ordered, null, 2) + "\n");
};

const record = (old: OldEntry, result: CollectResponse) => {
  if (!result.ok || !result.jpegBase64 || !result.label) {
    entries.set(old.domain, { domain: old.domain, label: old.label, label_v2: null, sha256: null, ok: false, error: result.error ?? "no label" });
    flush();
    return;
  }
  const bytes = Buffer.from(result.jpegBase64, "base64");
  writeFileSync(join(outDir, `${old.domain}.jpg`), bytes);
  writeFileSync(
    join(outDir, `${old.domain}.json`),
    JSON.stringify({ domain: old.domain, observation: result.observation, outcome: result.outcome, label: old.label, label_v2: result.label }, null, 2) + "\n",
  );
  entries.set(old.domain, { domain: old.domain, label: old.label, label_v2: result.label, sha256: createHash("sha256").update(bytes).digest("hex"), ok: true });
  flush();
};

const pending = oldEntries.filter((e) => !(entries.get(e.domain)?.ok === true && existsSync(join(outDir, `${e.domain}.json`))));
let done = 0;

await runPool(pending, 3, async (old) => {
  const result = await collectWithRetry(`https://${old.domain}`, null);
  record(old, result);
  done++;
  console.log(`${done}/${pending.length} ${old.domain} old=${old.label} new=${result.ok ? result.label : `FAIL ${result.error}`}`);
});

const all = oldEntries.flatMap((e) => entries.get(e.domain) ?? []);
const both = all.filter((e) => e.ok && e.label !== null);
const agree = both.filter((e) => e.label === e.label_v2).length;
console.log(JSON.stringify({ total: all.length, ok: all.filter((e) => e.ok).length, agree, compared: both.length }));
