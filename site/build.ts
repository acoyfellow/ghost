import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type RealScore = { system: string; worstF1: number; bestF1: number; precision: number; recall: number; msP50: number | null };

type RealReceipt = { verdict: string; systems: RealScore[]; candidateWorstF1: number; bestBaselineF1: number; margin: number };

type GymSystem = { runs: number; heldOutF1: number; representative: { heldOutCI: number[]; byFamily: Record<string, { f1?: number; fpr: number }> } };

type GymReceipt = {
  verdict: string;
  candidate: string;
  candidateHeldOutF1: number;
  bestBaseline: number;
  margin: number;
  realHoldoutF1: number;
  conditions: Record<string, boolean>;
  failing: string[];
  bySystem: Record<string, GymSystem>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isRealReceipt = (value: unknown): value is RealReceipt => isRecord(value) && "verdict" in value && Array.isArray(value.systems);

const isGymReceipt = (value: unknown): value is GymReceipt => isRecord(value) && "verdict" in value && isRecord(value.bySystem) && Array.isArray(value.failing);

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const realParsed = readJson("eval/receipt.json");
const gymParsed = readJson("gym/receipt.json");
if (!isRealReceipt(realParsed) || !isGymReceipt(gymParsed)) throw new Error("receipt missing or malformed");
const real = realParsed;
const gym = gymParsed;

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const repo = ["https:", "", "github.com", "acoyfellow", "ghost"].join("/");

const heldOutFamilies = ["F3", "F6", "F7", "F9", "F10"];

const familyNames: Record<string, string> = {
  F3: "late overlay",
  F6: "canvas modal",
  F7: "shadow / iframe",
  F9: "moving target",
  F10: "inert / disabled",
};

const gymOrder = ["ghost-compiled-v2", "dom-rule", "ghost-compiled-v1", "workers-ai-vision", "ghost-local"];

const gymDescribe: Record<string, string> = {
  "ghost-compiled-v2": "Candidate. Fable 5.2 saw only the train families and wrote a 55-line rule. Frozen before scoring.",
  "dom-rule": "Hand-written: does elementFromPoint at the click point hit the target?",
  "ghost-compiled-v1": "The rule Fable wrote from real sites in round 1.",
  "workers-ai-vision": "Workers AI vision model, one screenshot, one yes/no question. Median of 3 runs.",
  "ghost-local": "SmolVLM-256M on WebGPU in the browser. 1 complete run.",
};

const conditionNames: Record<string, string> = {
  heldOutAtLeast090: "Held-out families F1 at least 0.90",
  beatsBestBaselineBy005: "Beats the best baseline by at least 0.05",
  realHoldoutAtLeast0883: "Real holdout pages F1 at least 0.883",
};

const gymRows = gymOrder
  .filter((system) => gym.bySystem[system] !== undefined)
  .map((system) => {
    const score = gym.bySystem[system];
    if (score === undefined) return "";
    const families = heldOutFamilies.map((family) => `<td>${score.representative.byFamily[family]?.f1 ?? "n/a"}</td>`).join("");
    const interval = score.representative.heldOutCI.join(" to ");
    return `<tr><td><b>${escape(system)}</b><br><small>${escape(gymDescribe[system] ?? "")}</small></td><td><b>${score.heldOutF1}</b><br><small>${interval}</small></td>${families}</tr>`;
  })
  .join("\n");

const conditionRows = Object.entries(gym.conditions)
  .map(([name, passed]) => `<li>${passed ? "pass" : "fail"}: ${escape(conditionNames[name] ?? name)}</li>`)
  .join("\n");

const realRows = real.systems
  .map((score) => `<tr><td>${escape(score.system)}</td><td>${score.system === "ghost-compiled" ? score.worstF1 : score.bestF1}</td><td>${score.msP50 === null ? "n/a" : `${score.msP50} ms`}</td></tr>`)
  .join("\n");

const headline = "A model that writes the rule beats a model that looks at the page. It still cannot see what changes after it looks.";

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ghost: ${gym.verdict}</title>
<meta name="description" content="${escape(headline)}">
<style>body{font:16px/1.5 ui-monospace,Menlo,monospace;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#111;background:#fafaf7}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid #ddd;padding:.4rem;text-align:left;vertical-align:top}small{color:#555}.v{font-size:1.4rem;padding:.6rem 1rem;border:2px solid #111;display:inline-block}.wrap{overflow-x:auto}</style>
</head><body>
<h1>ghost</h1>
<p class="v">Verdict: <b>${gym.verdict}</b></p>
<p>${escape(headline)}</p>
<p>Question: before a browser agent clicks, will the click reach the target? We asked a model to <i>write a rule</i> instead of judging every page, then scored that rule on kinds of page it never saw.</p>
<h2>The gym</h2>
<p>A generator at <a href="/gym">/gym</a> serves 10 families of pages, 50 seeds each, whose answer it knows. Every label was confirmed by a real click in Cloudflare Browser Run (500 of 500 agreed). The rule author saw only 5 train families. Scores below are on the 5 held-out families, 250 pages.</p>
<div class="wrap"><table><thead><tr><th>System</th><th>Held-out F1<br><small>95% interval</small></th>${heldOutFamilies.map((family) => `<th>${family}<br><small>${familyNames[family]}</small></th>`).join("")}</tr></thead><tbody>
${gymRows}
</tbody></table></div>
<h2>Verdict</h2>
<ul>
${conditionRows}
</ul>
<p>The candidate scored ${gym.candidateHeldOutF1}, the best baseline ${gym.bestBaseline}. On the real holdout pages, collected again with the gym protocol, it scored ${gym.realHoldoutF1}.</p>
<h2>What this means</h2>
<p>The model wrote mechanisms, not memories. No train page had a disabled or inert target, yet its rule says a disabled control gets no click and an inert subtree is skipped. On that unseen family it scored 1.0; the hand-written rule scored 0.7.</p>
<p>No rule can win F3 and F9. There the page changes after the agent looks, so nothing the agent saw predicts it. This was written down before any page existed. The fix is not a better rule: check again at the moment of the click.</p>
<p>The real-site number dropped because the pages changed between collections, not because the rule did. The plain DOM rule scores the same ${gym.realHoldoutF1} on the new facts; the two rules disagree on 2 of 193 pages, one each way.</p>
<h2>Round 1: real sites</h2>
<p>Before the gym, we compared systems on 193 real pages. One free DOM call beat two vision models.</p>
<table><thead><tr><th>System</th><th>F1</th><th>p50</th></tr></thead><tbody>
${realRows}
</tbody></table>
<h2>Proof</h2>
<p>Receipts: <a href="/proof.json">/proof.json</a> (gym) and <a href="/proof-real.json">/proof-real.json</a> (real sites). The rule, its notes, every tool call the model made, the frozen hashes and the gate: <a href="${repo}">${repo}</a>.</p>
<p><small>A Customer 0 spike. Built on Browser Run, Workers, Workers AI and Transformers.js.</small></p>
</body></html>
`;

const gymLine = (system: string) => {
  const score = gym.bySystem[system];
  return score === undefined ? "" : `- ${system}: held-out F1 ${score.heldOutF1} (${score.representative.heldOutCI.join(" to ")}); ${heldOutFamilies.map((family) => `${family} ${score.representative.byFamily[family]?.f1 ?? "n/a"}`).join(", ")}`;
};

const llms = `# ghost

> ${headline}

Verdict: ${gym.verdict}
Failing: ${gym.failing.join(", ")}

## Gym, held-out families
${gymOrder.map(gymLine).filter((line) => line !== "").join("\n")}

## Real sites (round 1)
${real.systems.map((score) => `- ${score.system}: F1 ${score.system === "ghost-compiled" ? score.worstF1 : score.bestF1}`).join("\n")}

- Gym pages: /gym
- Receipts: /proof.json, /proof-real.json
- Repo: ${repo}
`;

mkdirSync("site/public", { recursive: true });
writeFileSync("site/public/index.html", html);
writeFileSync("site/public/llms.txt", llms);
writeFileSync("site/public/proof.json", `${JSON.stringify(gym, null, 1)}\n`);
writeFileSync("site/public/proof-real.json", `${JSON.stringify(real, null, 1)}\n`);
writeFileSync("site/public/robots.txt", "User-agent: *\nAllow: /\n");
console.log("site built:", gym.verdict);
