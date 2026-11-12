import { readFileSync } from "node:fs";

type Row = { id: string; label: string; flagged: boolean | null };

const rowsOf = (path: string): Row[] => {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("rows" in parsed) || !Array.isArray(parsed.rows)) return [];
  return parsed.rows.filter(
    (row: unknown): row is Row => typeof row === "object" && row !== null && "id" in row && "label" in row && "flagged" in row,
  );
};

const score = (rows: Row[]) => {
  const truePositives = rows.filter((row) => row.label === "broken" && row.flagged === true).length;
  const flagged = rows.filter((row) => row.flagged === true).length;
  const broken = rows.filter((row) => row.label === "broken").length;
  const precision = flagged === 0 ? 0 : truePositives / flagged;
  const recall = broken === 0 ? 0 : truePositives / broken;
  return { f1: Number((precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)).toFixed(4)), precision: Number(precision.toFixed(4)), recall: Number(recall.toFixed(4)) };
};

const [leftPath = "", rightPath = ""] = process.argv.slice(2);
const left = rowsOf(leftPath);
const right = new Map(rowsOf(rightPath).map((row) => [row.id, row]));

console.log("left", JSON.stringify(score(left)));
console.log("right", JSON.stringify(score([...right.values()])));
for (const row of left) {
  const other = right.get(row.id);
  if (other !== undefined && other.flagged !== row.flagged) console.log(`differ ${row.id} label=${row.label} left=${row.flagged} right=${other.flagged}`);
}
