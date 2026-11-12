export type Truth = "broken" | "held";

export type Rendered = { html: string; truth: Truth };

type Rect = { x: number; y: number; w: number; h: number };

type Rng = {
  int: (low: number, high: number) => number;
  float: (low: number, high: number) => number;
  pick: <T>(items: readonly T[]) => T;
  chance: () => boolean;
};

type Parts = {
  css: string;
  body: string;
  script: string;
  locked: boolean;
  height: number;
};

type Context = {
  rng: Rng;
  truth: Truth;
  target: Rect;
  label: string;
  hue: number;
};

export const FAMILY_INFO: readonly { id: string; name: string; summary: string }[] = [
  { id: "F1", name: "clean", summary: "nothing covers the target" },
  { id: "F2", name: "modal", summary: "an opaque fixed modal covers or avoids the target" },
  { id: "F3", name: "late-overlay", summary: "an overlay appears after the screenshot, over or away from the target" },
  { id: "F4", name: "invisible-cover", summary: "a transparent element covers the target, with or without pointer-events none" },
  { id: "F5", name: "looks-blocked", summary: "a visible overlay with pointer-events none sits over the target" },
  { id: "F6", name: "canvas-modal", summary: "an unpositioned canvas with a drawn modal sits over the target" },
  { id: "F7", name: "shadow-iframe", summary: "a srcdoc iframe or open shadow root sits over the target" },
  { id: "F8", name: "offscreen-lock", summary: "the body is scroll-locked and the target is outside or inside the viewport" },
  { id: "F9", name: "moving-target", summary: "after the screenshot the target moves away or stays under the click point" },
  { id: "F10", name: "disabled-or-inert", summary: "inert or disabled ancestors versus decoys on unrelated elements" },
];

const VIEWPORT_W = 1280;
const VIEWPORT_H = 800;
const ALWAYS_HELD: readonly string[] = ["F1", "F5"];

const hashString = (text: string): number => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

const keyedTruth = (family: string, seed: number, salt: string): Truth => {
  if (ALWAYS_HELD.includes(family)) return "held";
  const bit = Math.floor(hashString(`truth|${salt}|${family}|${seed}`) / 65536) % 2;
  return bit === 0 ? "broken" : "held";
};

const makeRng = (state: number): Rng => {
  let s = state >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (low, high) => low + Math.floor(next() * (high - low + 1)),
    float: (low, high) => low + next() * (high - low),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: () => next() < 0.5,
  };
};

const WORDS = [
  "river", "lantern", "orbit", "maple", "quartz", "harbor", "violet", "meadow", "copper", "signal",
  "window", "garden", "pillow", "rocket", "timber", "velvet", "anchor", "breeze", "candle", "dragon",
  "engine", "forest", "glacier", "hammer", "island", "jungle", "kettle", "ladder", "marble", "needle",
];

const LABELS = ["Continue", "Subscribe", "Download", "Get started", "Add to cart", "Confirm", "Sign up", "Next", "Accept", "Send"];
const MODAL_TITLES = ["Join our newsletter", "We use cookies", "Your session expired", "Special offer", "Update available", "Sign in to continue"];
const FONTS = ["Georgia, serif", "system-ui, sans-serif", "Menlo, monospace", "Verdana, sans-serif", "'Times New Roman', serif"];

const sentence = (rng: Rng, count: number): string => {
  const words: string[] = [];
  for (let i = 0; i < count; i++) words.push(rng.pick(WORDS));
  const text = words.join(" ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
};

const escapeAttribute = (text: string): string => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const hsl = (hue: number, saturation: number, lightness: number, alpha = 1): string =>
  `hsla(${Math.round(hue)},${saturation}%,${lightness}%,${alpha})`;

const centre = (rect: Rect): { x: number; y: number } => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });

const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const inflate = (rect: Rect, pad: number): Rect => ({ x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 });

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

const coverBox = (rng: Rng, target: Rect, w: number, h: number): Rect => {
  const c = centre(target);
  const x = clamp(Math.round(c.x - w * rng.float(0.25, 0.75)), 0, VIEWPORT_W - w);
  const y = clamp(Math.round(c.y - h * rng.float(0.25, 0.75)), 0, VIEWPORT_H - h);
  return { x, y, w, h };
};

const awayBox = (rng: Rng, target: Rect, width: number, height: number): Rect => {
  const keepOut = inflate(target, 30);
  let w = width;
  let h = height;
  for (let round = 0; round < 6; round++) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const box = { x: rng.int(0, VIEWPORT_W - w), y: rng.int(0, VIEWPORT_H - h), w, h };
      if (!intersects(box, keepOut)) return box;
    }
    w = Math.round(w * 0.7);
    h = Math.round(h * 0.7);
  }
  return { x: target.x > VIEWPORT_W / 2 ? 10 : VIEWPORT_W - 70, y: 10, w: 60, h: 40 };
};

const boxStyle = (rect: Rect): string => `left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px`;

const modalMarkup = (ctx: Context, id: string, rect: Rect, extraStyle: string): string => {
  const { rng, hue } = ctx;
  const bg = hsl(hue + 180, rng.int(30, 70), rng.int(88, 97));
  const border = hsl(hue + 180, 60, 35);
  const title = rng.pick(MODAL_TITLES);
  return `<div id="${id}" style="position:fixed;${boxStyle(rect)};z-index:${rng.int(40, 900)};background:${bg};color:#111;border:2px solid ${border};border-radius:${rng.int(4, 18)}px;box-shadow:0 8px 30px rgba(0,0,0,.35);padding:16px;box-sizing:border-box;overflow:hidden;${extraStyle}"><h3 style="margin:0 0 8px">${title}</h3><p style="margin:0">${sentence(rng, rng.int(6, 12))}</p></div>`;
};

const targetMarkup = (ctx: Context, extraAttributes = "", extraStyle = ""): string => {
  const { rng, target, label, hue } = ctx;
  const style = `position:absolute;${boxStyle(target)};background:${hsl(hue, 70, 42)};color:#fff;border:0;border-radius:${rng.int(2, 20)}px;font:600 ${rng.int(14, 20)}px ${rng.pick(FONTS)};cursor:pointer;box-sizing:border-box;${extraStyle}`;
  return `<button type="button" id="t" data-ghost-target ${extraAttributes} style="${style}">${label}</button>`;
};

const fillerMarkup = (rng: Rng): string => {
  const paragraphs: string[] = [];
  const count = rng.int(4, 8);
  for (let i = 0; i < count; i++) paragraphs.push(`<p>${sentence(rng, rng.int(14, 40))} ${sentence(rng, rng.int(10, 30))}</p>`);
  return `<header><h1>${sentence(rng, 3)}</h1><nav>${WORDS.slice(0, 5).map(() => `<a href="#">${rng.pick(WORDS)}</a>`).join(" · ")}</nav></header><main>${paragraphs.join("")}</main>`;
};

const makeContext = (family: string, seed: number, salt: string): Context => {
  const rng = makeRng(hashString(`layout|${salt}|${family}|${seed}`));
  const w = rng.int(110, 240);
  const h = rng.int(44, 90);
  const target = { x: rng.int(150, VIEWPORT_W - 150 - w), y: rng.int(150, VIEWPORT_H - 150 - h), w, h };
  return { rng, truth: keyedTruth(family, seed, salt), target, label: rng.pick(LABELS), hue: rng.int(0, 359) };
};

const plain = (css: string, body: string, script = ""): Parts => ({ css, body, script, locked: false, height: VIEWPORT_H });

const clean = (ctx: Context): Parts => plain("", targetMarkup(ctx));

const modal = (ctx: Context): Parts => {
  const { rng, truth, target } = ctx;
  const w = rng.int(300, 500);
  const h = rng.int(160, 320);
  const rect = truth === "broken" ? coverBox(rng, target, w, h) : awayBox(rng, target, w, h);
  return plain("", `${targetMarkup(ctx)}${modalMarkup(ctx, "m", rect, "")}`);
};

const lateOverlay = (ctx: Context): Parts => {
  const { rng, truth, target } = ctx;
  const w = rng.int(300, 500);
  const h = rng.int(160, 320);
  const rect = truth === "broken" ? coverBox(rng, target, w, h) : awayBox(rng, target, w, h);
  const delay = rng.int(20, 120);
  const script = `window.__ghostAct=function(){setTimeout(function(){document.getElementById("late").style.display="block"},${delay})};`;
  return plain("", `${targetMarkup(ctx)}${modalMarkup(ctx, "late", rect, "display:none;")}`, script);
};

const invisibleCover = (ctx: Context): Parts => {
  const { rng, truth, target } = ctx;
  const rect = inflate(target, rng.int(0, 40));
  const passThrough = truth === "held" ? "pointer-events:none;" : "";
  const cover = `<div id="cover" style="position:absolute;${boxStyle(rect)};z-index:${rng.int(5, 90)};background:transparent;${passThrough}"></div>`;
  return plain("", `${targetMarkup(ctx)}${cover}`);
};

const looksBlocked = (ctx: Context): Parts => {
  const { rng, target, hue } = ctx;
  const rect = coverBox(rng, target, rng.int(300, 500), rng.int(160, 320));
  const bg = hsl(hue + 180, 50, rng.int(20, 90), 0.92);
  const overlay = `<div id="veil" style="position:fixed;${boxStyle(rect)};z-index:${rng.int(40, 900)};background:${bg};color:#111;border:2px solid #333;border-radius:${rng.int(4, 18)}px;padding:16px;box-sizing:border-box;pointer-events:none"><h3 style="margin:0 0 8px">${rng.pick(MODAL_TITLES)}</h3><p style="margin:0">${sentence(rng, 8)}</p></div>`;
  return plain("", `${targetMarkup(ctx)}${overlay}`);
};

const canvasModal = (ctx: Context): Parts => {
  const { rng, truth, target, hue } = ctx;
  const rect = coverBox(rng, target, rng.int(420, 900), rng.int(260, 560));
  const passThrough = truth === "held" ? "pointer-events:none;" : "";
  const modalW = rng.int(260, rect.w - 20);
  const modalH = rng.int(140, rect.h - 20);
  const modalX = Math.round((rect.w - modalW) / 2);
  const modalY = Math.round((rect.h - modalH) / 2);
  const canvas = `<canvas id="cv" width="${rect.w}" height="${rect.h}" style="position:absolute;${boxStyle(rect)};${passThrough}"></canvas>`;
  const draw = `var c=document.getElementById("cv").getContext("2d");c.fillStyle=${JSON.stringify(hsl(hue + 180, 20, 30, 0.25))};c.fillRect(0,0,${rect.w},${rect.h});c.fillStyle=${JSON.stringify(hsl(hue + 180, 50, 94))};c.fillRect(${modalX},${modalY},${modalW},${modalH});c.strokeStyle="#333";c.lineWidth=2;c.strokeRect(${modalX},${modalY},${modalW},${modalH});c.fillStyle="#111";c.font="bold 20px sans-serif";c.fillText(${JSON.stringify(rng.pick(MODAL_TITLES))},${modalX + 16},${modalY + 36});c.font="14px sans-serif";c.fillText(${JSON.stringify(sentence(rng, 5))},${modalX + 16},${modalY + 64});`;
  return plain("", `${targetMarkup(ctx)}${canvas}`, draw);
};

const shadowIframe = (ctx: Context): Parts => {
  const { rng, truth, target, hue } = ctx;
  const rect = inflate(target, rng.int(10, 40));
  const useIframe = rng.chance();
  const innerCovers = truth === "broken" || rng.chance();
  const passThrough = truth === "held" ? "pointer-events:none;" : "";
  const innerBg = hsl(hue + 180, 60, 90);
  const innerContent = innerCovers
    ? `<div style="width:100%;height:100%;background:${innerBg};color:#111;font:16px sans-serif;padding:8px;box-sizing:border-box">${sentence(rng, 5)}</div>`
    : `<div style="position:absolute;right:0;top:0;width:40px;height:24px;background:${innerBg};font:12px sans-serif">ad</div>`;
  const hostStyle = `position:absolute;${boxStyle(rect)};z-index:${rng.int(5, 90)};${passThrough}`;
  if (useIframe) {
    const doc = `<!doctype html><html style="height:100%"><body style="margin:0;height:100%;position:relative">${innerContent}</body></html>`;
    const frame = `<iframe id="host" srcdoc="${escapeAttribute(doc)}" style="${hostStyle}border:0;background:transparent"></iframe>`;
    return plain("", `${targetMarkup(ctx)}${frame}`);
  }
  const markup = `<div style="position:relative;width:100%;height:100%">${innerContent}</div>`;
  const host = `<div id="host" style="${hostStyle}"></div>`;
  return plain("", `${targetMarkup(ctx)}${host}`, `document.getElementById("host").attachShadow({mode:"open"}).innerHTML=${JSON.stringify(markup)};`);
};

const offscreenLock = (ctx: Context): Parts => {
  const { rng, truth } = ctx;
  if (truth === "broken") {
    ctx.target = { ...ctx.target, y: rng.int(900, 1500) };
  }
  return { css: "html,body{overflow:hidden}", body: targetMarkup(ctx), script: "", locked: true, height: 2000 };
};

const movingTarget = (ctx: Context): Parts => {
  const { rng, truth, target } = ctx;
  const moved = { ...target };
  if (truth === "broken") {
    const distance = target.w + rng.int(30, 180);
    moved.x = target.x < 500 ? target.x + distance : target.x - distance;
    moved.y = target.y + rng.int(-20, 20);
  } else {
    moved.x = target.x + rng.int(-(Math.floor(target.w / 2) - 8), Math.floor(target.w / 2) - 8);
    moved.y = target.y + rng.int(-(Math.floor(target.h / 2) - 6), Math.floor(target.h / 2) - 6);
  }
  const delay = rng.int(20, 120);
  const script = `window.__ghostAct=function(){setTimeout(function(){var t=document.getElementById("t");t.style.left="${moved.x}px";t.style.top="${moved.y}px"},${delay})};`;
  return plain("", targetMarkup(ctx), script);
};

const decoyCard = (ctx: Context, attributes: string, inner: string): string => {
  const { rng, hue } = ctx;
  return `<aside ${attributes} style="margin:12px 0;padding:12px;border:1px solid ${hsl(hue, 40, 60)};background:${hsl(hue, 40, 95)}">${sentence(rng, 6)} ${inner}</aside>`;
};

const disabledOrInert = (ctx: Context): Parts => {
  const { rng, truth } = ctx;
  if (truth === "broken") {
    const body = rng.chance()
      ? `<div inert>${targetMarkup(ctx)}</div>`
      : `<fieldset disabled style="border:0;padding:0;margin:0">${targetMarkup(ctx)}</fieldset>`;
    return plain("", body);
  }
  const variant = rng.int(0, 3);
  if (variant === 0) {
    const decoy = decoyCard(ctx, "inert", `<button type="button">${rng.pick(LABELS)}</button>`);
    return plain("", `${decoy}${targetMarkup(ctx)}`);
  }
  if (variant === 1) {
    const decoy = `<fieldset disabled style="margin:12px 0"><input value="${rng.pick(WORDS)}"> <button type="button">${rng.pick(LABELS)}</button></fieldset>`;
    return plain("", `${decoy}${targetMarkup(ctx)}`);
  }
  if (variant === 2) {
    return plain("", targetMarkup(ctx, 'aria-disabled="true"', "opacity:.55;"));
  }
  return plain(".disabled{filter:grayscale(1)}", targetMarkup(ctx, 'class="disabled"'));
};

const BUILDERS: Record<string, (ctx: Context) => Parts> = {
  F1: clean,
  F2: modal,
  F3: lateOverlay,
  F4: invisibleCover,
  F5: looksBlocked,
  F6: canvasModal,
  F7: shadowIframe,
  F8: offscreenLock,
  F9: movingTarget,
  F10: disabledOrInert,
};

const assemble = (ctx: Context, parts: Parts): string => {
  const { rng, hue, truth } = ctx;
  const bg = hsl(hue + 30, rng.int(10, 40), rng.int(90, 98));
  const delay = rng.int(100, 1200);
  const protocol = `window.__ghostTruth=${JSON.stringify(truth)};window.__ghostReady=false;window.__ghostAct=function(){};`;
  const ready = `setTimeout(function(){window.__ghostReady=true},${delay});`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>gym</title>
<style>html,body{margin:0}body{position:relative;width:${VIEWPORT_W}px;min-height:${parts.height}px;background:${bg};color:#222;font:16px/1.5 ${rng.pick(FONTS)}}header,main{max-width:${rng.int(560, 900)}px;margin:0 auto;padding:8px 24px}${parts.css}</style>
</head><body>${fillerMarkup(rng)}${parts.body}<script>${protocol}${parts.script}${ready}</script></body></html>
`;
};

export const render = (family: string, seed: number, salt: string): Rendered => {
  const build = BUILDERS[family];
  if (build === undefined) throw new Error(`unknown family ${family}`);
  const ctx = makeContext(family, seed, salt);
  const parts = build(ctx);
  return { html: assemble(ctx, parts), truth: ctx.truth };
};
