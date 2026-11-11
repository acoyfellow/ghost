import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type CollectResponse = {
  domain: string;
  ok: boolean;
  error?: string;
  label?: "broken" | "held";
  box?: unknown;
  target?: unknown;
  domFacts?: unknown;
  jpegBase64?: string;
  ms: number;
};

type IndexEntry = { domain: string; label: "broken" | "held" | null; sha256: string | null; ok: boolean; error?: string };

const root = import.meta.dir;
const framesDir = join(root, "..", ".real", "frames");
const indexPath = join(root, "frames.index.json");
const endpoint = process.env.COLLECTOR_URL ?? "https://ghost-collector.customer0.dev";
const probeKey = (process.env.PROBE_KEY ?? readFileSync(join(root, "..", "probes", "p1", ".probe-key"), "utf8")).trim();
const concurrency = 2;

const domains = readFileSync(join(root, "sites.txt"), "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
mkdirSync(framesDir, { recursive: true });

const entries = new Map<string, IndexEntry>();
if (existsSync(indexPath)) for (const entry of JSON.parse(readFileSync(indexPath, "utf8")) as IndexEntry[]) entries.set(entry.domain, entry);

const flush = () => {
  const ordered = domains.flatMap((d) => (entries.has(d) ? [entries.get(d)!] : []));
  writeFileSync(indexPath, JSON.stringify(ordered, null, 2) + "\n");
};

async function request(domain: string): Promise<CollectResponse> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "x-probe-key": probeKey, "content-type": "application/json" },
      body: JSON.stringify({ domain }),
      signal: AbortSignal.timeout(120000),
    });
    return (await response.json()) as CollectResponse;
  } catch (e) {
    return { domain, ok: false, error: (e as Error).message, ms: 0 };
  }
}

async function collectWithRetry(domain: string): Promise<CollectResponse> {
  const first = await request(domain);
  return first.ok ? first : request(domain);
}

function record(result: CollectResponse) {
  const { jpegBase64, ...meta } = result;
  writeFileSync(join(framesDir, `${result.domain}.json`), JSON.stringify(meta, null, 2) + "\n");
  let sha256: string | null = null;
  if (result.ok && jpegBase64) {
    const bytes = Buffer.from(jpegBase64, "base64");
    writeFileSync(join(framesDir, `${result.domain}.jpg`), bytes);
    sha256 = createHash("sha256").update(bytes).digest("hex");
  }
  entries.set(result.domain, {
    domain: result.domain,
    label: result.ok ? (result.label ?? null) : null,
    sha256,
    ok: result.ok,
    ...(result.error ? { error: result.error } : {}),
  });
  flush();
}

const collected = (domain: string) => existsSync(join(framesDir, `${domain}.json`)) && entries.get(domain)?.ok === true;
const queue = domains.filter((d) => !collected(d));
let done = 0;

async function worker() {
  for (let domain = queue.shift(); domain !== undefined; domain = queue.shift()) {
    const result = await collectWithRetry(domain);
    record(result);
    done++;
    console.log(`${done}/${done + queue.length} ${domain} ${result.ok ? result.label : `FAIL ${result.error}`}`);
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));

const all = [...entries.values()];
console.log(JSON.stringify({
  total: all.length,
  ok: all.filter((e) => e.ok).length,
  failed: all.filter((e) => !e.ok).length,
  broken: all.filter((e) => e.label === "broken").length,
  held: all.filter((e) => e.label === "held").length,
}));
