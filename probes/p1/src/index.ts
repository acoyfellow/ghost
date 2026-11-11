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
  sessionId?: string;
};

class CdpClient {
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  readonly frames: { bytes: number; atMs: number; data?: string }[] = [];
  private readonly startedAt = Date.now();
  private screencastStartedAt = 0;
  firstFrameMs: number | null = null;
  keepFirstFrame = true;
  firstFrameData: string | null = null;
  errors: string[] = [];

  constructor(private socket: WebSocket) {
    socket.addEventListener("message", (event) => this.onMessage(JSON.parse(event.data as string)));
    socket.addEventListener("close", () => {
      for (const p of this.pending.values()) p.reject(new Error("socket closed"));
      this.pending.clear();
    });
  }

  markScreencastStart() {
    this.screencastStartedAt = Date.now();
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
    if (message.method === "Page.screencastFrame") {
      const data: string = message.params.data;
      if (this.firstFrameMs === null) {
        this.firstFrameMs = Date.now() - this.screencastStartedAt;
        this.firstFrameData = data;
      }
      this.frames.push({ bytes: Math.floor((data.length * 3) / 4), atMs: Date.now() - this.screencastStartedAt });
      this.send("Page.screencastFrameAck", { sessionId: message.params.sessionId }).catch((e) =>
        this.errors.push(`ack: ${e.message}`),
      );
    }
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
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForFrames(client: CdpClient, count: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (client.frames.length < count && Date.now() < deadline) await sleep(100);
}

async function runProbe(env: Env) {
  const errors: string[] = [];
  const result: Record<string, unknown> = {};
  const session = await env.BROWSER.acquire({ targets: true, keepAlive: 120000 });
  result.sessionId = session.sessionId;
  try {
    const initialPage = (session.targets ?? []).find((t: any) => t.type === "page");
    const connection = await env.BROWSER.connectSession(session.sessionId, initialPage ? { targetId: initialPage.id } : undefined);
    const response = await connection.webSocket.fetch("https://browser-binding.invalid", {
      headers: { Upgrade: "websocket" },
    });
    if (!response.webSocket) throw new Error("no websocket returned");
    const socket: WebSocket = response.webSocket;
    socket.accept();
    const client = new CdpClient(socket);

    const pageTarget = (session.targets ?? []).find((t: any) => t.type === "page");
    result.initialTargets = session.targets;
    if (pageTarget) {
      const liveView = await env.BROWSER.getLiveView(session.sessionId, {
        targetId: pageTarget.id,
        mode: "devtools",
      }).catch((e: Error) => {
        errors.push(`getLiveView: ${e.message}`);
        return null;
      });
      result.liveViewPresent = Boolean(liveView?.devtoolsFrontendUrl);
      result.liveViewUrlHost = liveView?.devtoolsFrontendUrl
        ? new URL(liveView.devtoolsFrontendUrl).host
        : null;
      result.liveViewUrlRedactedShape = liveView?.devtoolsFrontendUrl
        ? String(liveView.devtoolsFrontendUrl).replace(/(token|ws|wss)=[^&]+/g, "$1=<redacted>").slice(0, 200)
        : null;
    } else {
      result.liveViewPresent = false;
      errors.push("no page target in acquire result");
    }

    await client.send("Page.enable");
    await client.send("Runtime.enable");

    const pages: Record<string, unknown>[] = [];
    for (const url of ["https://www.bbc.co.uk", "https://example.com"]) {
      const page: Record<string, unknown> = { url };
      try {
        await client.send("Page.navigate", { url });
        await sleep(3000);
        const framesBefore = client.frames.length;
        client.markScreencastStart();
        client.firstFrameMs = null;
        await client.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 1280, everyNthFrame: 1 });
        await client.send("Runtime.evaluate", {
          expression: "document.body.style.outline='1px solid transparent';window.scrollBy(0,40);1",
        });
        for (let i = 0; i < 20 && client.frames.length - framesBefore < 10; i++) {
          await client.send("Runtime.evaluate", { expression: `window.scrollBy(0,${i % 2 ? -30 : 30});1` }).catch(() => {});
          await sleep(300);
        }
        await waitForFrames(client, framesBefore + 10, 5000);
        await client.send("Page.stopScreencast");
        const mine = client.frames.slice(framesBefore);
        page.frameCount = mine.length;
        page.frameBytes = mine.map((f) => f.bytes);
        page.firstFrameMs = client.firstFrameMs;
        const evalResult = await client.send("Runtime.evaluate", {
          expression:
            "(()=>{const e=document.elementFromPoint(200,200);return e?{tag:e.tagName,id:e.id,className:String(e.className).slice(0,80),text:(e.textContent||'').trim().slice(0,60)}:null})()",
          returnByValue: true,
        });
        page.elementFromPoint = evalResult.result?.value ?? evalResult;
        page.title = (await client.send("Runtime.evaluate", { expression: "document.title", returnByValue: true })).result?.value;
      } catch (e) {
        page.error = (e as Error).message;
        errors.push(`${url}: ${(e as Error).message}`);
      }
      pages.push(page);
    }
    result.pages = pages;
    result.frame0Base64 = client.firstFrameData;
    errors.push(...client.errors);
    socket.close();
  } catch (e) {
    errors.push((e as Error).stack ?? String(e));
  } finally {
    await env.BROWSER.closeSession(session.sessionId).catch((e: Error) => errors.push(`close: ${e.message}`));
  }
  result.errors = errors;
  return result;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("x-probe-key") !== env.PROBE_KEY || !env.PROBE_KEY) {
      return new Response("not found", { status: 404 });
    }
    return Response.json(await runProbe(env));
  },
};
