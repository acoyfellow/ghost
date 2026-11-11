interface Env {
  AI: { run(model: string, input: object): Promise<unknown> };
  PROBE_KEY: string;
}

type Body = { model: string; prompt: string; imageBase64: string };

const isBody = (value: unknown): value is Body =>
  typeof value === "object" &&
  value !== null &&
  "model" in value &&
  typeof value.model === "string" &&
  "prompt" in value &&
  typeof value.prompt === "string" &&
  "imageBase64" in value &&
  typeof value.imageBase64 === "string";

const textOf = (result: unknown): string => {
  if (typeof result !== "object" || result === null) return "";
  if ("response" in result && typeof result.response === "string") return result.response;
  if ("description" in result && typeof result.description === "string") return result.description;
  return JSON.stringify(result);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("x-probe-key") !== env.PROBE_KEY) return new Response("forbidden", { status: 403 });
    if (request.method !== "POST") return new Response("method", { status: 405 });
    const body: unknown = await request.json();
    if (!isBody(body)) return new Response("bad body", { status: 400 });
    const started = Date.now();
    const dataUrl = `data:image/jpeg;base64,${body.imageBase64}`;
    try {
      const result: unknown = await env.AI.run(body.model, {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: body.prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 32,
      });
      return Response.json({ text: textOf(result), ms: Date.now() - started });
    } catch (error) {
      return Response.json({ error: String(error), ms: Date.now() - started }, { status: 502 });
    }
  },
};
