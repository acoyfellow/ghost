import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Label = "held" | "broken";

type Row = {
  id: string;
  labelLate: Label;
  delivered: boolean;
  pointerdownOnTarget: boolean;
  clickSeen: boolean;
  navigated: boolean;
  requests: number;
  domMutations: number | null;
  effect: boolean;
  guard: boolean;
};

type H1Page = { id: string; passes: { label: Label }[] };

const decisionsPath = "gym/real/h1b-decisions.json";
const misses = ["cdiscount.com", "hola.org", "narto-drama.com", "paychex.com", "pearltrees.com", "showcamrips.com", "survicate.com", "thesun.co.uk", "tripadvisor.co.uk", "ukdevilz.com", "walkme.com"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const guardBlocks = (observation: Record<string, unknown>, plannedHit: boolean) => {
  const states = Array.isArray(observation.ancestorState) ? observation.ancestorState.filter(isRecord) : [];
  const disabled = states[0]?.matchesDisabled === true || states[0]?.disabled === true;
  const inert = states.some((state) => state.inert === true);
  return observation.pointInViewport === false || disabled || inert || !plannedHit;
};

const toRow = (raw: Record<string, unknown>): Row | null => {
  if (!isRecord(raw.early) || !isRecord(raw.recheck) || typeof raw.recheckPlannedHit !== "boolean") return null;
  const early = raw.early;
  const navigated = typeof early.href === "string" && typeof raw.hrefBefore === "string" && early.href !== raw.hrefBefore;
  const requests = typeof raw.requests === "number" ? raw.requests : 0;
  const domMutations = typeof early.domMutations === "number" ? early.domMutations : null;
  return {
    id: String(raw.id),
    labelLate: raw.label === "broken" ? "broken" : "held",
    delivered: early.delivered === true,
    pointerdownOnTarget: early.pointerdownOnTarget === true,
    clickSeen: early.clickSeen === true,
    navigated,
    requests,
    domMutations,
    effect: navigated || requests > 0 || (domMutations ?? 0) >= 5,
    guard: guardBlocks(raw.recheck, raw.recheckPlannedHit),
  };
};

if (process.argv[2] === "frames") {
  const dir = ".real/h1b";
  const rows = existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name): unknown => JSON.parse(readFileSync(join(dir, name), "utf8")))
        .filter(isRecord)
        .flatMap((raw) => toRow(raw) ?? [])
    : [];
  writeFileSync(decisionsPath, `${JSON.stringify(rows, null, 1)}\n`);
}

const rows: Row[] = JSON.parse(readFileSync(decisionsPath, "utf8"));
const h1: H1Page[] = JSON.parse(readFileSync("gym/real/h1-decisions.json", "utf8"));
const stableHeld = new Set(h1.filter((page) => page.passes.every((pass) => pass.label === "held")).map((page) => page.id));

const round = (value: number) => Number(value.toFixed(4));
const share = (part: number, whole: number) => (whole === 0 ? 0 : round(part / whole));

const missRows = rows.filter((row) => misses.includes(row.id));
const deliveredMisses = missRows.filter((row) => row.delivered);
const controlRows = rows.filter((row) => stableHeld.has(row.id));

const deliveredLabel = (row: Row) => (row.delivered ? "held" : "broken");
const f1 = (system: (row: Row) => boolean, label: (row: Row) => Label) => {
  const truePositives = rows.filter((row) => label(row) === "broken" && system(row)).length;
  const flagged = rows.filter(system).length;
  const broken = rows.filter((row) => label(row) === "broken").length;
  const precision = flagged === 0 ? 0 : truePositives / flagged;
  const recall = broken === 0 ? 0 : truePositives / broken;
  return round(precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall));
};
const agree = (system: (row: Row) => boolean, label: (row: Row) => Label) => share(rows.filter((row) => system(row) === (label(row) === "broken")).length, rows.length);

const predictions = {
  p1MissesDelivered: deliveredMisses.length >= 8,
  p2DeliveredHaveEffect: share(deliveredMisses.filter((row) => row.effect).length, deliveredMisses.length) >= 0.75,
  p4ControlDelivered: share(controlRows.filter((row) => row.delivered).length, controlRows.length) >= 0.95,
};

const verdict = !predictions.p4ControlDelivered ? "instrument fails" : predictions.p1MissesDelivered ? "supported" : "falsified";

const receipt = {
  test: "gym/H1B.md",
  verdict,
  predictions,
  pages: rows.length,
  misses: { loaded: missRows.length, delivered: deliveredMisses.length, deliveredWithEffect: deliveredMisses.filter((row) => row.effect).length },
  control: { pages: controlRows.length, delivered: controlRows.filter((row) => row.delivered).length },
  labels: {
    lateBroken: rows.filter((row) => row.labelLate === "broken").length,
    deliveredFalse: rows.filter((row) => !row.delivered).length,
    lateBrokenButDelivered: rows.filter((row) => row.labelLate === "broken" && row.delivered).length,
    lateHeldButNotDelivered: rows.filter((row) => row.labelLate === "held" && !row.delivered).length,
    noClickSeen: rows.filter((row) => !row.clickSeen).length,
  },
  guard: {
    agreeLate: agree((row) => row.guard, (row) => row.labelLate),
    agreeDelivered: agree((row) => row.guard, deliveredLabel),
    f1Late: f1((row) => row.guard, (row) => row.labelLate),
    f1Delivered: f1((row) => row.guard, deliveredLabel),
  },
  missRows,
  notDelivered: rows.filter((row) => !row.delivered).map((row) => ({ id: row.id, guard: row.guard, pointerdownOnTarget: row.pointerdownOnTarget, clickSeen: row.clickSeen, navigated: row.navigated })),
};

writeFileSync("gym/receipts/h1b.json", `${JSON.stringify(receipt, null, 1)}\n`);
console.log(JSON.stringify({ ...receipt, missRows: receipt.missRows.length, notDelivered: receipt.notDelivered.length }, null, 1));
