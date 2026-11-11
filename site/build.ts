import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type SystemScore = { system: string; worstF1: number; bestF1: number; precision: number; recall: number; msP50: number | null };

type Receipt = { verdict: string; systems: SystemScore[]; candidateWorstF1: number; bestBaselineF1: number; margin: number };

const isReceipt = (value: unknown): value is Receipt =>
  typeof value === "object" && value !== null && "verdict" in value && "systems" in value && Array.isArray(value.systems);

const parsed: unknown = JSON.parse(readFileSync("eval/receipt.json", "utf8"));
if (!isReceipt(parsed)) throw new Error("eval/receipt.json is not a receipt");
const receipt = parsed;

const frozen: unknown = JSON.parse(readFileSync("eval/frozen.json", "utf8"));
const index: unknown = JSON.parse(readFileSync("eval/frames.index.json", "utf8"));
const okFrames = Array.isArray(index) ? index.filter((row) => typeof row === "object" && row !== null && "ok" in row && row.ok === true).length : 0;

const shownF1 = (score: SystemScore) => (score.system === "ghost-local" ? score.worstF1 : score.bestF1);

const describe: Record<string, string> = {
  "dom-rule": "One CDP call: does elementFromPoint at the target hit the target? Free.",
  "workers-ai-vision": "Workers AI vision model on the host. One screenshot, one yes/no question.",
  "ghost-local": "SmolVLM-256M on WebGPU in the browser. Same screenshot, same question. Scored on its worst of 3 runs.",
};

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rows = receipt.systems
  .map(
    (score) =>
      `<tr><td><b>${escape(score.system)}</b><br><small>${escape(describe[score.system] ?? "")}</small></td><td>${shownF1(score)}</td><td>${score.precision}</td><td>${score.recall}</td><td>${score.msP50 === null ? "n/a" : `${score.msP50} ms`}</td></tr>`,
  )
  .join("\n");

const repo = ["https:", "", "github.com", "acoyfellow", "ghost"].join("/");

const headline =
  receipt.verdict === "proven"
    ? "A vision model on your own GPU beat the DOM at spotting what blocks a click."
    : "The DOM beat two vision models at spotting what blocks a click.";

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ghost: ${receipt.verdict}</title>
<meta name="description" content="${escape(headline)}">
<style>body{font:16px/1.5 ui-monospace,Menlo,monospace;max-width:52rem;margin:2rem auto;padding:0 1rem;color:#111;background:#fafaf7}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:.5rem;text-align:left;vertical-align:top}small{color:#555}.v{font-size:1.4rem;padding:.6rem 1rem;border:2px solid #111;display:inline-block}</style>
</head><body>
<h1>ghost</h1>
<p class="v">Verdict: <b>${receipt.verdict}</b></p>
<p>${escape(headline)}</p>
<p>Question: before an agent clicks, does something cover the target? A consent banner, a modal, a login wall. We collected ${okFrames} real pages in Cloudflare Browser Run, labelled each one by sending a real click, and asked three systems.</p>
<table><thead><tr><th>System</th><th>F1</th><th>Precision</th><th>Recall</th><th>p50</th></tr></thead><tbody>
${rows}
</tbody></table>
<p>Rule: ghost-local needed F1 at least ${receipt.bestBaselineF1} + ${receipt.margin} on the frozen holdout split. It scored ${receipt.candidateWorstF1}.</p>
<h2>What this means</h2>
<p>If your agent drives the browser over CDP, ask the page before you ask a model. The answer is one call and costs nothing. Send pixels to a model only for what the DOM cannot see: canvas, images, video.</p>
<h2>Proof</h2>
<p>Receipt: <a href="/proof.json">/proof.json</a>. Frozen hashes: ${escape(JSON.stringify(typeof frozen === "object" && frozen !== null && "hashes" in frozen ? Object.keys(frozen.hashes).length : 0))} files. Code, raw runs and the gate: <a href="${repo}">${repo}</a>.</p>
<p><small>A Customer 0 spike. Built on Browser Run, Workers AI, Workers and Transformers.js.</small></p>
</body></html>
`;

const llms = `# ghost

> ${headline}

Verdict: ${receipt.verdict}

${receipt.systems.map((score) => `- ${score.system}: F1 ${shownF1(score)}, precision ${score.precision}, recall ${score.recall}, p50 ${score.msP50 ?? "n/a"} ms`).join("\n")}

- Receipt: /proof.json
- Repo: ${repo}
`;

mkdirSync("site/public", { recursive: true });
writeFileSync("site/public/index.html", html);
writeFileSync("site/public/llms.txt", llms);
writeFileSync("site/public/proof.json", `${JSON.stringify(receipt, null, 1)}\n`);
writeFileSync("site/public/robots.txt", "User-agent: *\nAllow: /\n");
console.log("site built:", receipt.verdict);
