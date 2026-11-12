import { describe, expect, test } from "bun:test";
import { render } from "./families";

const FAMILIES = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10"];
const SALT = "0123456789abcdef0123456789abcdef";
const seeds = Array.from({ length: 50 }, (_, seed) => seed);

const countTargets = (html: string): number => html.split("data-ghost-target").length - 1;

describe.each(FAMILIES)("%s", (family) => {
  test("renders seeds 0..49 with exactly one target", () => {
    for (const seed of seeds) {
      const page = render(family, seed, SALT);
      expect(page.html.length).toBeGreaterThan(200);
      expect(countTargets(page.html)).toBe(1);
      expect(page.html).toContain("__ghostReady");
      expect(page.html).toContain("__ghostAct");
      expect(page.html).toContain(`__ghostTruth=${JSON.stringify(page.truth)}`);
    }
  });

  test("is deterministic", () => {
    for (const seed of seeds) {
      expect(render(family, seed, SALT)).toEqual(render(family, seed, SALT));
    }
  });

  test("truth balance", () => {
    const broken = seeds.filter((seed) => render(family, seed, SALT).truth === "broken").length;
    if (family === "F1" || family === "F5") {
      expect(broken).toBe(0);
    } else {
      expect(broken).toBeGreaterThanOrEqual(15);
      expect(broken).toBeLessThanOrEqual(35);
    }
  });
});

test("salt changes the labels", () => {
  const a = seeds.map((seed) => render("F2", seed, SALT).truth).join();
  const b = seeds.map((seed) => render("F2", seed, "ffffffffffffffffffffffffffffffff").truth).join();
  expect(a).not.toBe(b);
});
