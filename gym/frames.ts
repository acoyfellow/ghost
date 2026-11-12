import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Label = "held" | "broken";

export type GymFrame = { id: string; family: string; seed: number; label: Label; observation: Record<string, unknown> };

export const trainFamilies = ["F1", "F2", "F4", "F5", "F8"];
export const heldOutFamilies = ["F3", "F6", "F7", "F9", "F10"];
export const falsePositiveOnlyFamilies = ["F1", "F5"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const toFrame = (value: unknown): GymFrame | null => {
  if (!isRecord(value)) return null;
  const { family, seed, label, observation } = value;
  if (typeof family !== "string" || typeof seed !== "number" || (label !== "held" && label !== "broken") || !isRecord(observation)) return null;
  return { id: `${family}-${seed}`, family, seed, label, observation };
};

export const loadGymFrames = (dir = ".real/gym"): GymFrame[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => toFrame(JSON.parse(readFileSync(join(dir, name), "utf8"))))
    .filter((frame): frame is GymFrame => frame !== null)
    .sort((a, b) => a.family.localeCompare(b.family, "en", { numeric: true }) || a.seed - b.seed);
