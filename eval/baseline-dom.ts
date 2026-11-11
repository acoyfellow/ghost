import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Label = "held" | "broken";

type Frame = { domain: string; label: Label; hitIsTarget: boolean; cmpPresent: boolean; stickyHit: boolean };

const framesDir = ".real/frames";
const rawDir = "eval/raw";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const toFrame = (value: unknown): Frame | null => {
  if (!isRecord(value) || value.ok !== true) return null;
  const { domain, label, domFacts } = value;
  if (typeof domain !== "string" || (label !== "held" && label !== "broken") || !isRecord(domFacts)) return null;
  const hit = domFacts.hitIsTargetOrDescendant;
  if (typeof hit !== "boolean") return null;
  return {
    domain,
    label,
    hitIsTarget: hit,
    cmpPresent: domFacts.cmpPresent === true,
    stickyHit: isRecord(domFacts.stickyAncestor),
  };
};

export const splitOf = (domain: string): "dev" | "holdout" =>
  Number.parseInt(createHash("sha256").update(`ghost-split-v1:${domain}`).digest("hex").slice(0, 8), 16) % 10 < 3 ? "dev" : "holdout";

const loadFrames = (): Frame[] =>
  readdirSync(framesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => toFrame(JSON.parse(readFileSync(join(framesDir, name), "utf8"))))
    .filter((frame): frame is Frame => frame !== null)
    .sort((a, b) => a.domain.localeCompare(b.domain));

const rules: Record<string, (frame: Frame) => boolean> = {
  "dom-rule": (frame) => !frame.hitIsTarget,
  "cmp-only": (frame) => frame.cmpPresent,
};

const main = () => {
  const frames = loadFrames();
  mkdirSync(rawDir, { recursive: true });
  for (const [system, rule] of Object.entries(rules)) {
    for (const split of ["dev", "holdout"] as const) {
      const rows = frames
        .filter((frame) => splitOf(frame.domain) === split)
        .map((frame) => ({ id: frame.domain, label: frame.label, flagged: rule(frame), ms: 0 }));
      writeFileSync(join(rawDir, `${system}.${split}.1.json`), `${JSON.stringify({ system, split, run: 1, rows }, null, 1)}\n`);
      console.log(system, split, rows.length);
    }
  }
};

if (import.meta.main) main();
