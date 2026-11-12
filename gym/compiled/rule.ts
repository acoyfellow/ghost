export type Observation = Record<string, unknown>;

type Fields = Record<string, unknown>;

const CHILDLESS_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "IMG", "BR", "HR", "IFRAME", "FRAME", "EMBED", "OBJECT", "VIDEO", "CANVAS"]);
const NESTED_DOCUMENT_TAGS = new Set(["IFRAME", "FRAME", "EMBED", "OBJECT"]);
const TRUNCATED_ATTRIBUTE_FLOOR = 60;

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);
const fieldsOf = (value: unknown): Fields => (isFields(value) ? value : {});
const listOf = (value: unknown): Fields[] => (Array.isArray(value) ? value.filter(isFields) : []);
const textOf = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const tagOf = (element: Fields): string => textOf(element.tag).toUpperCase();
const countOf = (value: unknown): number => (typeof value === "number" ? value : 0);

const sameClassList = (left: string, right: string): boolean => {
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter === longer || (shorter.length >= TRUNCATED_ATTRIBUTE_FLOOR && longer.startsWith(shorter));
};

const describesTarget = (layer: Fields, target: Fields): boolean => {
  const attributes = fieldsOf(target.attributes);
  return tagOf(layer) === tagOf(target) && textOf(layer.id) === textOf(attributes.id) && sameClassList(textOf(layer.className), textOf(attributes.class));
};

const interceptsPointer = (layer: Fields): boolean => layer.pointerEvents !== "none" && layer.visibility !== "hidden" && layer.visibility !== "collapse";

const staysInFlow = (layer: Fields): boolean => layer.position === "static" && layer.zIndex === "auto" && !NESTED_DOCUMENT_TAGS.has(tagOf(layer));

const clickLandsOutsideViewport = (observation: Observation): boolean => observation.pointInViewport === false;

const targetIsDisabled = (observation: Observation): boolean => {
  const [targetState] = listOf(observation.ancestorState);
  return targetState !== undefined && (targetState.matchesDisabled === true || targetState.disabled === true);
};

const targetIsInert = (observation: Observation): boolean => listOf(observation.ancestorState).some((state) => state.inert === true);

const clickBubblesToTarget = (observation: Observation): boolean => {
  const target = fieldsOf(observation.target);
  if (!isFields(observation.hit) || CHILDLESS_TAGS.has(tagOf(target))) return false;
  const stack = listOf(observation.chain);
  const targetDepth = stack.map((layer) => describesTarget(layer, target)).lastIndexOf(true);
  if (targetDepth < 0) return false;
  const layersAboveTarget = stack.slice(0, targetDepth).filter(interceptsPointer);
  if (layersAboveTarget.length === 0) return countOf(observation.hitPathShadowRoots) > 0;
  return [observation.hit, ...layersAboveTarget].every(staysInFlow);
};

export const blocked = (observation: Observation): boolean => {
  if (clickLandsOutsideViewport(observation)) return true;
  if (targetIsDisabled(observation) || targetIsInert(observation)) return true;
  if (observation.hitIsTarget === true) return false;
  return !clickBubblesToTarget(observation);
};
