import { armEffect, armListeners, boxNow, callAct, earlyListeners, hitAtPoint, observe, readEarly, pickByRule, pickBySelector, readOutcome, readyState } from "./pageScripts";

type Box = { x: number; y: number; width: number; height: number };

type Outcome = {
  fired: boolean;
  eventTarget: { tag: string; id: string; className: string } | null;
  boxAtClick: Box;
  clickPoint: { x: number; y: number };
  actCalled: boolean;
};

type Observation = { clickPoint: { x: number; y: number } } & Record<string, unknown>;

type CollectResult = {
  url: string;
  ok: boolean;
  error?: string;
  label?: "broken" | "held";
  observation?: Observation;
  outcome?: Outcome;
  act0?: Observation | null;
  recheck?: Observation | null;
  recheckToClickMs?: number;
  recheckPlannedHit?: boolean;
  early?: unknown;
  requests?: number;
  hrefBefore?: unknown;
  jpegBase64?: string;
  ms: number;
};

interface SocketLike {
  accept(): void;
  send(data: string): void;
  close(): void;
  addEventListener(type: "message" | "close", listener: (event: { data?: unknown }) => void): void;
}

interface BrowserBinding {
  acquire(options: { targets: boolean; keepAlive: number }): Promise<{ sessionId: string; targets?: { id: string; type: string }[] }>;
  connectSession(sessionId: string, options?: { targetId: string }): Promise<{ webSocket: { fetch(url: string, init: { headers: Record<string, string> }): Promise<{ webSocket?: SocketLike }> } }>;
  closeSession(sessionId: string): Promise<unknown>;
}

interface Env {
  BROWSER: BrowserBinding;
  PROBE_KEY: string;
}

type CdpMessage = { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message: string } };
type Listener = (params: unknown) => void;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const parseMessage = (raw: unknown): CdpMessage | null => {
  if (typeof raw !== "string") return null;
  const parsed: unknown = JSON.parse(raw);
  return isRecord(parsed) ? parsed : null;
};

class CdpClient {
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private listeners = new Map<string, Listener[]>();

  constructor(private socket: SocketLike) {
    socket.addEventListener("message", (event) => {
      const message = parseMessage(event.data);
      if (message) this.onMessage(message);
    });
    socket.addEventListener("close", () => {
      for (const p of this.pending.values()) p.reject(new Error("socket closed"));
      this.pending.clear();
    });
  }

  on(method: string, listener: Listener) {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
  }

  private onMessage(message: CdpMessage) {
    if (message.id !== undefined) {
      const p = this.pending.get(message.id);
      if (!p) return;
      this.pending.delete(message.id);
      if (message.error) p.reject(new Error(message.error.message));
      else p.resolve(message.result);
      return;
    }
    if (message.method) for (const l of this.listeners.get(message.method) ?? []) l(message.params);
  }

  send(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression: string): Promise<unknown> {
    const response = await this.send("Runtime.evaluate", { expression, returnByValue: true });
    if (!isRecord(response)) throw new Error("evaluate: bad response");
    const details = response.exceptionDetails;
    if (isRecord(details)) {
      const exception = details.exception;
      const description = isRecord(exception) ? exception.description : details.text;
      throw new Error(`evaluate: ${String(description)}`);
    }
    return isRecord(response.result) ? response.result.value : undefined;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const isBox = (value: unknown): value is Box =>
  isRecord(value) && typeof value.x === "number" && typeof value.y === "number" && typeof value.width === "number" && typeof value.height === "number";

const isObservation = (value: unknown): value is Observation =>
  isRecord(value) && isRecord(value.clickPoint) && typeof value.clickPoint.x === "number" && typeof value.clickPoint.y === "number";

const isOutcomeRead = (value: unknown): value is { fired: boolean; eventTarget: Outcome["eventTarget"] } =>
  isRecord(value) && typeof value.fired === "boolean";

const isReadyRead = (value: unknown): value is { hasReadyFlag: boolean; ready: boolean } =>
  isRecord(value) && typeof value.hasReadyFlag === "boolean" && typeof value.ready === "boolean";

async function openClient(env: Env) {
  const session = await env.BROWSER.acquire({ targets: true, keepAlive: 120000 });
  const pageTarget = (session.targets ?? []).find((t) => t.type === "page");
  const connection = await env.BROWSER.connectSession(session.sessionId, pageTarget ? { targetId: pageTarget.id } : undefined);
  const response = await connection.webSocket.fetch("https://browser-binding.invalid", { headers: { Upgrade: "websocket" } });
  const socket = response.webSocket;
  if (!socket) throw new Error("no websocket returned");
  socket.accept();
  return { sessionId: session.sessionId, socket, client: new CdpClient(socket) };
}

async function load(client: CdpClient, url: string) {
  let loaded = false;
  client.on("Page.loadEventFired", () => {
    loaded = true;
  });
  client.on("Page.javascriptDialogOpening", () => {
    client.send("Page.handleJavaScriptDialog", { accept: false }).catch(() => {});
  });
  const nav = await client.send("Page.navigate", { url });
  if (isRecord(nav) && typeof nav.errorText === "string") throw new Error(`navigate: ${nav.errorText}`);
  const deadline = Date.now() + 25000;
  while (!loaded && Date.now() < deadline) await sleep(100);
}

async function waitReady(client: CdpClient) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const state = await client.evaluate(readyState);
    if (isReadyRead(state) && state.ready) return;
    await sleep(50);
  }
  throw new Error("page never became ready");
}

async function settle(client: CdpClient, gym: boolean) {
  if (gym) {
    const state = await client.evaluate(readyState);
    if (isReadyRead(state) && state.hasReadyFlag) await waitReady(client);
    else await sleep(4000);
    await sleep(200);
    return;
  }
  await sleep(4000);
}

async function selectTarget(client: CdpClient, selector: string | null) {
  const found = await client.evaluate(selector === null ? pickByRule : pickBySelector(selector));
  return found === true;
}

async function collect(env: Env, url: string, selector: string | null): Promise<CollectResult> {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  let opened: Awaited<ReturnType<typeof openClient>> | null = null;
  try {
    opened = await openClient(env);
    const { client } = opened;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await client.send("Network.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: earlyListeners });
    let counting = false;
    let requests = 0;
    client.on("Network.requestWillBeSent", () => {
      if (counting) requests++;
    });
    await load(client, url);
    await settle(client, selector !== null);

    if (!(await selectTarget(client, selector))) return { url, ok: false, error: "no eligible target", ms: elapsed() };

    const screenshot = await client.send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
    const observation = await client.evaluate(observe);
    if (!isObservation(observation)) return { url, ok: false, error: "bad observation", ms: elapsed() };
    const jpegBase64 = isRecord(screenshot) && typeof screenshot.data === "string" ? screenshot.data : null;
    if (jpegBase64 === null) return { url, ok: false, error: "no screenshot", ms: elapsed() };

    const actCalled = (await client.evaluate(callAct)) === true;
    const act0 = await client.evaluate(observe);
    await sleep(300);
    await client.evaluate(armListeners);
    const boxAtClick = await client.evaluate(boxNow);
    if (!isBox(boxAtClick)) return { url, ok: false, error: "bad box", ms: elapsed() };

    const { x, y } = observation.clickPoint;
    const recheckStartedAt = Date.now();
    const recheck = await client.evaluate(observe);
    const recheckPlannedHit = (await client.evaluate(hitAtPoint(x, y))) === true;
    await client.evaluate(armEffect);
    const hrefBefore = await client.evaluate("location.href");
    counting = true;
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    const recheckToClickMs = Date.now() - recheckStartedAt;
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(300);
    const read = await client.evaluate(readOutcome);
    await sleep(1200);
    counting = false;
    const early = await client.evaluate(readEarly);
    if (!isOutcomeRead(read)) return { url, ok: false, error: "bad outcome", ms: elapsed() };

    return {
      url,
      ok: true,
      label: read.fired ? "held" : "broken",
      observation,
      outcome: { fired: read.fired, eventTarget: read.eventTarget, boxAtClick, clickPoint: { x, y }, actCalled },
      act0: isObservation(act0) ? act0 : null,
      recheck: isObservation(recheck) ? recheck : null,
      recheckToClickMs,
      recheckPlannedHit,
      early,
      requests,
      hrefBefore,
      jpegBase64,
      ms: elapsed(),
    };
  } catch (e) {
    return { url, ok: false, error: e instanceof Error ? e.message : String(e), ms: elapsed() };
  } finally {
    if (opened) {
      try {
        opened.socket.close();
      } catch {}
      await env.BROWSER.closeSession(opened.sessionId).catch(() => {});
    }
  }
}

const parseBody = async (request: Request): Promise<{ url: string; target: string | null } | null> => {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.url !== "string") return null;
  const parsed = URL.parse(body.url);
  if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) return null;
  return { url: parsed.href, target: typeof body.target === "string" ? body.target : null };
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.PROBE_KEY || request.headers.get("x-probe-key") !== env.PROBE_KEY) return new Response("not found", { status: 404 });
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    const body = await parseBody(request);
    if (!body) return Response.json({ url: "", ok: false, error: "bad request", ms: 0 }, { status: 400 });
    return Response.json(await collect(env, body.url, body.target));
  },
};
