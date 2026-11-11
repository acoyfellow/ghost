import { readFileSync } from "node:fs";
import { blocked, type Facts } from "./rule.ts";

type Row = { id: string; label: "held" | "broken"; facts: Facts };

const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && "id" in value && "label" in value && "facts" in value && (value.label === "held" || value.label === "broken");

const rows = readFileSync("dev.jsonl", "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line): unknown => JSON.parse(line))
  .filter(isRow);

const results = rows.map((row) => ({ row, flagged: blocked(row.facts) }));
const truePositives = results.filter(({ row, flagged }) => row.label === "broken" && flagged).length;
const flaggedCount = results.filter(({ flagged }) => flagged).length;
const broken = rows.filter((row) => row.label === "broken").length;
const precision = flaggedCount === 0 ? 0 : truePositives / flaggedCount;
const recall = broken === 0 ? 0 : truePositives / broken;
const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

const misses = results.filter(({ row, flagged }) => (row.label === "broken") !== flagged).map(({ row, flagged }) => `${row.id} label=${row.label} flagged=${flagged}`);

console.log(JSON.stringify({ n: rows.length, f1: Number(f1.toFixed(4)), precision: Number(precision.toFixed(4)), recall: Number(recall.toFixed(4)) }));
for (const miss of misses) console.log(`miss ${miss}`);
