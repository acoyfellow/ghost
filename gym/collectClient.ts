import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Label = "broken" | "held";

export type CollectResponse = {
  url: string;
  ok: boolean;
  error?: string;
  label?: Label;
  observation?: unknown;
  outcome?: unknown;
  jpegBase64?: string;
  ms: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isLabel = (value: unknown): value is Label => value === "broken" || value === "held";

export const parseCollectResponse = (value: unknown, url: string): CollectResponse => {
  if (!isRecord(value) || typeof value.ok !== "boolean") return { url, ok: false, error: "bad collector response", ms: 0 };
  return {
    url,
    ok: value.ok,
    error: typeof value.error === "string" ? value.error : undefined,
    label: isLabel(value.label) ? value.label : undefined,
    observation: value.observation,
    outcome: value.outcome,
    jpegBase64: typeof value.jpegBase64 === "string" ? value.jpegBase64 : undefined,
    ms: typeof value.ms === "number" ? value.ms : 0,
  };
};

export const parseLabel = (value: string | null): Label | null => (isLabel(value) ? value : null);

const endpoint = process.env.COLLECTOR_URL ?? "https://ghost-gym-collector.customer0.dev";
const probeKey = (process.env.PROBE_KEY ?? readFileSync(join(import.meta.dir, "..", "probes", "p1", ".probe-key"), "utf8")).trim();

const pinnedIp = process.env.COLLECTOR_IP;
const endpointHost = new URL(endpoint).hostname;
const pinnedOptions = pinnedIp ? { headers: { host: endpointHost }, tls: { serverName: endpointHost } } : {};
const target0 = pinnedIp ? `https://${pinnedIp}/` : endpoint;

const requestOnce = async (url: string, target: string | null): Promise<CollectResponse> => {
  try {
    const response = await fetch(target0, {
      ...pinnedOptions,
      method: "POST",
      headers: { ...pinnedOptions.headers, "x-probe-key": probeKey, "content-type": "application/json" },
      body: JSON.stringify(target === null ? { url } : { url, target }),
      signal: AbortSignal.timeout(120000),
    });
    return parseCollectResponse(await response.json(), url);
  } catch (e) {
    return { url, ok: false, error: e instanceof Error ? e.message : String(e), ms: 0 };
  }
};

export const collectWithRetry = async (url: string, target: string | null): Promise<CollectResponse> => {
  const first = await requestOnce(url, target);
  return first.ok ? first : requestOnce(url, target);
};

export const runPool = async <T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) => {
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
};
