export type Facts = {
  target: unknown;
  box: unknown;
  dom: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const tagOf = (element: unknown): string | null =>
  isRecord(element) && typeof element.tag === "string" ? element.tag.toUpperCase() : null;

const nestedDocumentTags = new Set(["IFRAME", "FRAME", "OBJECT", "EMBED"]);

const probeConfirmsTarget = (dom: unknown): dom is Record<string, unknown> =>
  isRecord(dom) && dom.hitIsTargetOrDescendant === true;

const hitDeliversClickToTarget = (dom: Record<string, unknown>, target: unknown): boolean => {
  const hitTag = tagOf(dom.hit);
  if (hitTag === null) return false;
  return !nestedDocumentTags.has(hitTag) || hitTag === tagOf(target);
};

export const blocked = (facts: Facts): boolean =>
  !probeConfirmsTarget(facts.dom) || !hitDeliversClickToTarget(facts.dom, facts.target);
