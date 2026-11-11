import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const frozenFiles = [
  "eval/sites.txt",
  "eval/TARGET_RULE.md",
  "eval/prompt.txt",
  "eval/models.json",
  "eval/frames.index.json",
  "eval/baseline-dom.ts",
  "eval/score.ts",
  "fit/spec.json",
  "eval/compiled/rule.ts",
  "eval/compiled/TASK.md",
  "eval/compiled/sandbox.manifest.json",
  "eval/compiled/tool-calls.jsonl",
];

const frozenPath = "eval/frozen.json";

type Change = { at: string; reason: string };

type Frozen = { hashes: Record<string, string>; changes: Change[] };

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

export const currentHashes = (): Record<string, string> =>
  Object.fromEntries(frozenFiles.map((path) => [path, existsSync(path) ? sha256(path) : "missing"]));

const isFrozen = (value: unknown): value is Frozen =>
  typeof value === "object" && value !== null && "hashes" in value && "changes" in value && Array.isArray(value.changes);

export const readFrozen = (): Frozen | null => {
  if (!existsSync(frozenPath)) return null;
  const parsed: unknown = JSON.parse(readFileSync(frozenPath, "utf8"));
  return isFrozen(parsed) ? parsed : null;
};

const main = () => {
  const reason = process.argv.slice(2).join(" ").trim();
  if (reason === "") {
    console.error("usage: bun eval/freeze.ts <reason>");
    process.exit(1);
  }
  const previous = readFrozen();
  const frozen: Frozen = {
    hashes: currentHashes(),
    changes: [...(previous?.changes ?? []), { at: new Date().toISOString(), reason }],
  };
  writeFileSync(frozenPath, `${JSON.stringify(frozen, null, 1)}\n`);
  console.log(frozen.hashes);
};

if (import.meta.main) main();
