import { FAMILY_INFO, render } from "../../gym/generator/families";

type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  GYM_SALT: string;
};

const SEEDS = 50;

const htmlResponse = (html: string, headers: Record<string, string> = {}): Response =>
  new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers } });

const indexPage = (): string => {
  const sections = FAMILY_INFO.map((family) => {
    const links = Array.from({ length: SEEDS }, (_, seed) => `<a href="/gym/${family.id}/${seed}">${seed}</a>`).join(" ");
    return `<h2>${family.id} ${family.name}</h2><p>${family.summary}</p><p>${links}</p>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ghost gym</title></head><body style="font:16px/1.5 ui-monospace,monospace;max-width:52rem;margin:2rem auto"><h1>ghost gym</h1>${sections}</body></html>`;
};

const pageRoute = /^\/gym\/(F(?:[1-9]|10))\/(\d+)\/?$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET") return new Response("method not allowed", { status: 405 });
    if (url.pathname === "/gym" || url.pathname === "/gym/") return htmlResponse(indexPage());
    const match = pageRoute.exec(url.pathname);
    if (match !== null) {
      const seed = Number(match[2]);
      if (seed < SEEDS) {
        const page = render(match[1], seed, env.GYM_SALT);
        return htmlResponse(page.html, { "x-ghost-truth": page.truth });
      }
    }
    if (url.pathname.startsWith("/gym")) return new Response("not found", { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
