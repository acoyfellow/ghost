import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { blocked, type Observation } from "./compiled/rule.ts";

const dir = ".real/recheck-real";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

for (const name of readdirSync(dir).filter((file) => file.endsWith(".json")).sort()) {
  const raw: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
  if (!isRecord(raw) || !isRecord(raw.recheck)) continue;
  const recheck: Observation = raw.recheck;
  const rule = blocked(recheck);
  const dom = recheck.hitIsTarget !== true;
  if (rule === dom) continue;
  const target = isRecord(recheck.target) ? recheck.target : {};
  const state = Array.isArray(recheck.ancestorState) ? recheck.ancestorState[0] : null;
  const hit = isRecord(recheck.hit) ? recheck.hit : {};
  console.log(JSON.stringify({ id: raw.id, label: raw.label, rule, dom, tag: target.tag, hit: hit.tag, hitPos: hit.position, state, inViewport: recheck.pointInViewport }));
}
