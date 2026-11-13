import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { blocked, type Observation } from "./compiled/rule.ts";

type Label = "held" | "broken";

type Decision = { label: Label; guard: boolean; dom: boolean; fable: boolean; hit: string | null; eventTarget: unknown };

type Page = { id: string; passes: Decision[] };

const decisionsPath = "gym/real/h1-decisions.json";
const passes = [1, 2, 3];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const guardBlocks = (observation: Observation, plannedHit: boolean) => {
  const states = Array.isArray(observation.ancestorState) ? observation.ancestorState.filter(isRecord) : [];
  const disabled = states[0]?.matchesDisabled === true || states[0]?.disabled === true;
  const inert = states.some((state) => state.inert === true);
  return observation.pointInViewport === false || disabled || inert || !plannedHit;
};

const decide = (raw: Record<string, unknown>): Decision | null => {
  if (!isRecord(raw.recheck) || typeof raw.recheckPlannedHit !== "boolean") return null;
  const recheck: Observation = raw.recheck;
  const hit = isRecord(recheck.hit) && typeof recheck.hit.tag === "string" ? recheck.hit.tag : null;
  return {
    label: raw.label === "broken" ? "broken" : "held",
    guard: guardBlocks(recheck, raw.recheckPlannedHit),
    dom: recheck.hitIsTarget !== true,
    fable: blocked({ ...recheck, hitIsTarget: raw.recheckPlannedHit }),
    hit,
    eventTarget: isRecord(raw.outcome) ? raw.outcome.eventTarget : null,
  };
};

const readPass = (pass: number) => {
  const dir = `.real/h1-p${pass}`;
  const byId = new Map<string, Decision>();
  if (!existsSync(dir)) return byId;
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".json"))) {
    const raw: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
    if (!isRecord(raw)) continue;
    const decision = decide(raw);
    if (decision !== null) byId.set(String(raw.id), decision);
  }
  return byId;
};

if (process.argv[2] === "frames") {
  const byPass = passes.map(readPass);
  const ids = [...(byPass[0]?.keys() ?? [])].filter((id) => byPass.every((pass) => pass.has(id))).sort();
  const pages: Page[] = ids.map((id) => ({ id, passes: byPass.map((pass) => pass.get(id)).filter((decision): decision is Decision => decision !== undefined) }));
  writeFileSync(decisionsPath, `${JSON.stringify(pages)}\n`);
}

const pages: Page[] = JSON.parse(readFileSync(decisionsPath, "utf8"));

const pairs: [number, number][] = [[0, 1], [0, 2], [1, 2]];
const disagreement = (sample: Page[]) => {
  const total = sample.length * pairs.length;
  const differ = sample.reduce((sum, page) => sum + pairs.filter(([a, b]) => page.passes[a]?.label !== page.passes[b]?.label).length, 0);
  return total === 0 ? 0 : differ / total;
};
const isStable = (page: Page) => page.passes.every((decision) => decision.label === page.passes[0]?.label);
const errorRate = (sample: Page[], system: "guard" | "dom" | "fable") => {
  const decisions = sample.flatMap((page) => page.passes);
  const wrong = decisions.filter((decision) => decision[system] !== (decision.label === "broken")).length;
  return decisions.length === 0 ? 0 : wrong / decisions.length;
};

const f1 = (decisions: Decision[], system: "guard" | "dom" | "fable") => {
  const truePositives = decisions.filter((decision) => decision.label === "broken" && decision[system]).length;
  const flagged = decisions.filter((decision) => decision[system]).length;
  const broken = decisions.filter((decision) => decision.label === "broken").length;
  const precision = flagged === 0 ? 0 : truePositives / flagged;
  const recall = broken === 0 ? 0 : truePositives / broken;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
};

const random = (() => {
  let state = 1;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
})();

const interval = (statistic: (sample: Page[]) => number) => {
  const values = Array.from({ length: 2000 }, () => statistic(Array.from({ length: pages.length }, () => pages[Math.floor(random() * pages.length)] as Page))).sort((a, b) => a - b);
  return [values[50] ?? 0, values[1949] ?? 0].map((value) => Number(value.toFixed(4)));
};

const round = (value: number) => Number(value.toFixed(4));
const stable = pages.filter(isStable);
const D = disagreement(pages);
const E = errorRate(pages, "guard");
const Es = errorRate(stable, "guard");

const predictions = { p1StableErrorAtMost002: Es <= 0.02, p2ErrorWithinNoise: E <= D + 0.02 };
const stableMisses = stable
  .filter((page) => page.passes.some((decision) => decision.guard !== (decision.label === "broken")))
  .map((page) => ({ id: page.id, label: page.passes[0]?.label, guard: page.passes.map((decision) => decision.guard), hit: page.passes[0]?.hit, eventTarget: page.passes[0]?.eventTarget }));

const receipt = {
  test: "gym/H1.md",
  verdict: predictions.p1StableErrorAtMost002 && predictions.p2ErrorWithinNoise ? "supported" : "falsified",
  predictions,
  pages: pages.length,
  stablePages: stable.length,
  brokenStablePages: stable.filter((page) => page.passes[0]?.label === "broken").length,
  labelDisagreement: round(D),
  guardError: round(E),
  guardErrorStable: round(Es),
  guardErrorStableCI: interval((sample) => errorRate(sample.filter(isStable), "guard")),
  guardErrorMinusDisagreementCI: interval((sample) => errorRate(sample, "guard") - disagreement(sample)),
  errorStable: { guard: round(Es), dom: round(errorRate(stable, "dom")), fable: round(errorRate(stable, "fable")) },
  f1ByPass: passes.map((_, index) => {
    const decisions = pages.flatMap((page) => page.passes[index] ?? []);
    return { guard: round(f1(decisions, "guard")), dom: round(f1(decisions, "dom")), fable: round(f1(decisions, "fable")) };
  }),
  stableMisses,
};

writeFileSync("gym/receipts/h1.json", `${JSON.stringify(receipt, null, 1)}\n`);
console.log(JSON.stringify({ ...receipt, stableMisses: receipt.stableMisses.length }, null, 1));
