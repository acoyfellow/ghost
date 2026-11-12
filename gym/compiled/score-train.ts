import { appendFileSync, readFileSync } from "node:fs";
import { blocked, type Observation } from "./rule.ts";

type Row = { id: string; label: "held" | "broken"; observation: Observation };

const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && "id" in value && "label" in value && "observation" in value && (value.label === "held" || value.label === "broken");

const rows = readFileSync("train.jsonl", "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line): unknown => JSON.parse(line))
  .filter(isRow);

const results = rows.map((row) => ({ row, flagged: blocked(row.observation) }));
const truePositives = results.filter(({ row, flagged }) => row.label === "broken" && flagged).length;
const flaggedCount = results.filter(({ flagged }) => flagged).length;
const broken = rows.filter((row) => row.label === "broken").length;
const precision = flaggedCount === 0 ? 0 : truePositives / flaggedCount;
const recall = broken === 0 ? 0 : truePositives / broken;
const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
const summary = { n: rows.length, f1: Number(f1.toFixed(4)), precision: Number(precision.toFixed(4)), recall: Number(recall.toFixed(4)) };

appendFileSync("attempts.log", `${new Date().toISOString()} ${JSON.stringify(summary)}\n`);
console.log(JSON.stringify(summary));
for (const { row, flagged } of results.filter(({ row, flagged }) => (row.label === "broken") !== flagged)) console.log(`miss ${row.id} label=${row.label} flagged=${flagged}`);
