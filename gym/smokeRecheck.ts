import { collectWithRetry } from "./collectClient";

const field = (value: unknown, key: string): unknown => (typeof value === "object" && value !== null && key in value ? Reflect.get(value, key) : undefined);

for (const page of ["F3/1", "F9/1", "F2/1"]) {
  const result = await collectWithRetry(`https://ghost.customer0.dev/gym/${page}`, "[data-ghost-target]");
  console.log(
    page,
    JSON.stringify({
      ok: result.ok,
      error: result.error,
      label: result.label,
      early: field(result.observation, "hitIsTarget"),
      act0: field(result.act0, "hitIsTarget"),
      recheck: field(result.recheck, "hitIsTarget"),
      recheckToClickMs: result.recheckToClickMs,
      recheckPlannedHit: result.recheckPlannedHit,
    }),
  );
}
