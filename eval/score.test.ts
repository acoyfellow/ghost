import { describe, expect, test } from "bun:test";
import { buildReceipt, f1Of, isRaw, percentile, type Raw, type Row, summarize } from "./score";

const row = (label: Row["label"], flagged: boolean | null, ms?: number): Row =>
  ms === undefined ? { id: `${label}-${String(flagged)}`, label, flagged } : { id: `${label}-${String(flagged)}`, label, flagged, ms };

const run = (system: string, rows: Row[], split = "holdout", runNumber = 1): Raw => ({ system, split, run: runNumber, rows });

const perfect = [row("broken", true), row("broken", true), row("held", false), row("held", false)];

describe("f1Of", () => {
  test("perfect detection scores 1", () => {
    expect(f1Of(perfect)).toBe(1);
  });

  test("all-null flags score 0 and count nothing as flagged", () => {
    const rows = [row("broken", null), row("held", null)];
    expect(f1Of(rows)).toBe(0);
    expect(summarize([run("c", rows)], "c")?.nulls).toBe(2);
  });

  test("matches the precision/recall harmonic mean", () => {
    const rows = [row("broken", true), row("broken", false), row("held", true), row("held", false)];
    expect(f1Of(rows)).toBeCloseTo(0.5, 10);
  });
});

describe("buildReceipt", () => {
  test("candidate wins when its worst run beats the best baseline by the margin", () => {
    const raws = [
      run("cand", perfect, "holdout", 1),
      run("cand", [row("broken", true), row("broken", false), row("held", false)], "holdout", 2),
      run("base", [row("broken", null), row("broken", false), row("held", false)]),
    ];
    const receipt = buildReceipt(raws, "cand", 0.1, ["base"]);
    expect(receipt.verdict).toBe("proven");
    expect(receipt.candidateWorstF1).toBe(0.6667);
    expect(receipt.bestBaselineF1).toBe(0);
  });

  test("candidate loses when its worst run falls short of the baseline plus margin", () => {
    const raws = [run("cand", perfect), run("base", perfect)];
    expect(buildReceipt(raws, "cand", 0.05, ["base"]).verdict).toBe("disproven");
  });

  test("missing baseline is unscored", () => {
    const receipt = buildReceipt([run("cand", perfect)], "cand", 0, ["base"]);
    expect(receipt.verdict).toBe("unscored");
    expect(receipt.bestBaselineF1).toBeNull();
  });

  test("missing candidate is unscored", () => {
    const receipt = buildReceipt([run("base", perfect)], "cand", 0, ["base"]);
    expect(receipt.verdict).toBe("unscored");
    expect(receipt.candidateWorstF1).toBeNull();
  });

  test("non-holdout runs are ignored", () => {
    const receipt = buildReceipt([run("cand", perfect, "dev"), run("base", perfect)], "cand", 0, ["base"]);
    expect(receipt.verdict).toBe("unscored");
  });
});

describe("summarize", () => {
  test("reports p50 and p95 of ms where present", () => {
    const rows = Array.from({ length: 20 }, (_, index) => row("held", false, index + 1));
    const summary = summarize([run("c", rows)], "c");
    expect(summary?.msP50).toBe(10);
    expect(summary?.msP95).toBe(19);
  });

  test("ms percentiles are null when no row has ms", () => {
    expect(summarize([run("c", perfect)], "c")?.msP50).toBeNull();
  });
});

describe("percentile", () => {
  test("nearest-rank on sorted values", () => {
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([5, 1, 3], 95)).toBe(5);
    expect(percentile([], 50)).toBeNull();
  });
});

describe("isRaw", () => {
  test("accepts a well-formed run and rejects malformed ones", () => {
    expect(isRaw(run("c", perfect))).toBe(true);
    expect(isRaw({ system: "c", split: "holdout", run: 1, rows: [{ id: "x", label: "maybe", flagged: true }] })).toBe(false);
    expect(isRaw({ system: "c", split: "holdout", run: 1, rows: [{ id: "x", label: "held", flagged: "yes" }] })).toBe(false);
    expect(isRaw(null)).toBe(false);
  });
});
