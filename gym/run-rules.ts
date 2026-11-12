import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { blocked as compiledV1 } from "../eval/compiled/rule.ts";
import { type GymFrame, loadGymFrames } from "./frames.ts";

const rawDir = "gym/raw";

const domRule = (frame: GymFrame) => frame.observation.hitIsTarget !== true;

const v1Adapter = (frame: GymFrame) =>
  compiledV1({
    target: frame.observation.target,
    box: null,
    dom: { hitIsTargetOrDescendant: frame.observation.hitIsTarget === true, hit: frame.observation.hit },
  });

const systems: Record<string, (frame: GymFrame) => boolean> = {
  "dom-rule": domRule,
  "ghost-compiled-v1": v1Adapter,
};

const frames = loadGymFrames();
mkdirSync(rawDir, { recursive: true });

for (const [system, rule] of Object.entries(systems)) {
  const rows = frames.map((frame) => ({ id: frame.id, family: frame.family, label: frame.label, flagged: rule(frame) }));
  writeFileSync(join(rawDir, `${system}.1.json`), `${JSON.stringify({ system, run: 1, rows }, null, 1)}\n`);
  console.log(system, rows.length);
}
