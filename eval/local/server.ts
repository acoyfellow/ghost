import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { splitOf } from "../baseline-dom.ts";

type Label = "held" | "broken";
type Frame = { id: string; split: "dev" | "holdout"; label: Label };
type Result = { id: string; answer: string; flagged: boolean | null; ms: number };

const port = 4378;
const framesDir = ".real/frames";
const progressDir = ".real/local-progress";
const system = "ghost-local";
const here = import.meta.dir;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const loadFrames = (): Frame[] =>
  readdirSync(framesDir)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      const value: unknown = JSON.parse(readFileSync(join(framesDir, name), "utf8"));
      if (!isRecord(value) || value.ok !== true || typeof value.domain !== "string") return [];
      if (value.label !== "held" && value.label !== "broken") return [];
      return [{ id: value.domain, split: splitOf(value.domain), label: value.label }];
    })
    .sort((a, b) => a.id.localeCompare(b.id));

const progressPath = (run: string) => join(progressDir, `run-${run}.jsonl`);

const readResults = (run: string): Result[] => {
  const path = progressPath(run);
  if (!existsSync(path)) return [];
  const byId = new Map<string, Result>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim()) {
      const result: Result = JSON.parse(line);
      byId.set(result.id, result);
    }
  }
  return [...byId.values()];
};

const finalize = (run: string) => {
  const results = new Map(readResults(run).map((result) => [result.id, result]));
  for (const split of ["dev", "holdout"] as const) {
    const frames = loadFrames().filter((frame) => frame.split === split);
    if (frames.length === 0 || !frames.every((frame) => results.has(frame.id))) continue;
    const rows = frames.map((frame) => {
      const result = results.get(frame.id)!;
      return { id: frame.id, label: frame.label, flagged: result.flagged, ms: result.ms };
    });
    const replies = Object.fromEntries(frames.map((frame) => [frame.id, results.get(frame.id)!.answer]));
    mkdirSync("eval/raw", { recursive: true });
    mkdirSync("eval/replies", { recursive: true });
    writeFileSync(`eval/raw/${system}.${split}.${run}.json`, `${JSON.stringify({ system, split, run: Number(run), rows }, null, 1)}\n`);
    writeFileSync(`eval/replies/${system}.${split}.${run}.json`, `${JSON.stringify(replies, null, 1)}\n`);
  }
};

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

Bun.serve({
  port,
  fetch: async (request) => {
    const url = new URL(request.url);
    const run = url.searchParams.get("run") ?? "1";
    if (url.pathname === "/") return new Response(Bun.file(join(here, "index.html")));
    if (url.pathname === "/main.js") return new Response(Bun.file(join(here, "main.js")), { headers: { "content-type": "text/javascript" } });
    if (url.pathname === "/prompt") return new Response(readFileSync("eval/prompt.txt", "utf8").trim());
    if (url.pathname === "/models") return json(JSON.parse(readFileSync("eval/models.json", "utf8")));
    if (url.pathname === "/frames") {
      const split = url.searchParams.get("split") ?? "dev";
      return json(loadFrames().filter((frame) => frame.split === split));
    }
    if (url.pathname === "/done") return json(readResults(run).map((result) => result.id));
    if (url.pathname === "/result" && request.method === "POST") {
      const body: unknown = await request.json();
      if (!isRecord(body) || typeof body.id !== "string") return new Response("bad", { status: 400 });
      mkdirSync(progressDir, { recursive: true });
      appendFileSync(progressPath(run), `${JSON.stringify({ id: body.id, answer: body.answer, flagged: body.flagged, ms: body.ms })}\n`);
      finalize(run);
      return json({ ok: true });
    }
    const frame = url.pathname.match(/^\/frames\/(.+)\.jpg$/);
    if (frame) return new Response(Bun.file(join(framesDir, `${decodeURIComponent(frame[1])}.jpg`)));
    return new Response("not found", { status: 404 });
  },
});
console.log(`ghost-local on ${port}`);
