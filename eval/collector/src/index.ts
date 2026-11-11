import { COLLECT_FACTS, PICK_TARGET, READ_FIRED } from "./pageScripts";

interface Env {
  BROWSER: any;
  PROBE_KEY: string;
}

type CdpMessage = {
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: { message: string };
};

type Listener = (params: any) => void;

class CdpClient {
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private listeners = new Map<string, Listener[]>();

  constructor(private socket: WebSocket) {
    socket.addEventListener("message", (event) => this.onMessage(JSON.parse(event.data as string)));
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

  send(method: string, params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<any> {
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

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.send("Runtime.evaluate", { expression, returnByValue: true });
    if (response.exceptionDetails) throw new Error(`evaluate: ${response.exceptionDetails.exception?.description ?? response.exceptionDetails.text}`);
    return response.result?.value as T;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type TargetPick = {
  box: { x: number; y: number; width: number; height: number };
  tag: string;
  text: string;
  pool: string;
  candidates: number;
};

type CollectResult = {
  domain: string;
  ok: boolean;
  error?: string;
  label?: "broken" | "held";
  box?: TargetPick["box"];
  target?: Omit<TargetPick, "box">;
  domFacts?: unknown;
  jpegBase64?: string;
  ms: number;
};

const domainPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

async function openClient(env: Env) {
  const session = await env.BROWSER.acquire({ targets: true, keepAlive: 120000 });
  const pageTarget = (session.targets ?? []).find((t: any) => t.type === "page");
  const connection = await env.BROWSER.connectSession(session.sessionId, pageTarget ? { targetId: pageTarget.id } : undefined);
  const response = await connection.webSocket.fetch("https://browser-binding.invalid", { headers: { Upgrade: "websocket" } });
  if (!response.webSocket) throw new Error("no websocket returned");
  const socket = response.webSocket as WebSocket & { accept(): void };
  socket.accept();
  return { sessionId: session.sessionId as string, socket, client: new CdpClient(socket) };
}

async function navigateAndSettle(client: CdpClient, domain: string) {
  let loaded = false;
  client.on("Page.loadEventFired", () => {
    loaded = true;
  });
  client.on("Page.javascriptDialogOpening", () => {
    client.send("Page.handleJavaScriptDialog", { accept: false }).catch(() => {});
  });
  const nav = await client.send("Page.navigate", { url: `https://${domain}` });
  if (nav.errorText) throw new Error(`navigate: ${nav.errorText}`);
  const deadline = Date.now() + 25000;
  while (!loaded && Date.now() < deadline) await sleep(100);
  await sleep(4000);
}

async function collect(env: Env, domain: string): Promise<CollectResult> {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;
  let opened: Awaited<ReturnType<typeof openClient>> | null = null;
  try {
    opened = await openClient(env);
    const { client } = opened;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await navigateAndSettle(client, domain);

    const pick = await client.evaluate<TargetPick | null>(PICK_TARGET);
    if (!pick) return { domain, ok: false, error: "no eligible target", ms: elapsed() };

    const screenshot = await client.send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
    const domFacts = await client.evaluate<unknown>(COLLECT_FACTS);

    const x = pick.box.x + pick.box.width / 2;
    const y = pick.box.y + pick.box.height / 2;
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(300);
    const fired = await client.evaluate<boolean>(READ_FIRED);

    const { box, ...target } = pick;
    return {
      domain,
      ok: true,
      label: fired ? "held" : "broken",
      box,
      target,
      domFacts,
      jpegBase64: screenshot.data as string,
      ms: elapsed(),
    };
  } catch (e) {
    return { domain, ok: false, error: (e as Error).message, ms: elapsed() };
  } finally {
    if (opened) {
      try {
        opened.socket.close();
      } catch {}
      await env.BROWSER.closeSession(opened.sessionId).catch(() => {});
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.PROBE_KEY || request.headers.get("x-probe-key") !== env.PROBE_KEY) {
      return new Response("not found", { status: 404 });
    }
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    const body = (await request.json().catch(() => null)) as { domain?: unknown } | null;
    const domain = typeof body?.domain === "string" ? body.domain.trim().toLowerCase() : "";
    if (!domainPattern.test(domain)) return Response.json({ domain, ok: false, error: "bad domain", ms: 0 }, { status: 400 });
    return Response.json(await collect(env, domain));
  },
};
