export const PICK_TARGET = `(() => {
  const isVisible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const centerInViewport = (rect) => {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return cx >= 0 && cx < innerWidth && cy >= 0 && cy < innerHeight;
  };
  const inStickyChrome = (el) => {
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const position = getComputedStyle(node).position;
      if (position === "fixed" || position === "sticky") return true;
      if (node.tagName === "HEADER" || node.getAttribute("role") === "banner") return true;
    }
    return false;
  };
  const all = Array.from(document.querySelectorAll("a, button")).filter((el) => {
    if (!isVisible(el)) return false;
    const rect = el.getBoundingClientRect();
    return centerInViewport(rect) && !inStickyChrome(el);
  });
  const mainRoot = document.querySelector("main, [role=main], article");
  const inMain = mainRoot ? all.filter((el) => mainRoot.contains(el)) : [];
  const pool = inMain.length > 0 ? inMain : all;
  let best = null;
  let bestArea = 0;
  for (const el of pool) {
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  if (!best) return null;
  const rect = best.getBoundingClientRect();
  window.__ghostTarget = best;
  window.__ghostFired = false;
  best.addEventListener("click", (event) => {
    window.__ghostFired = true;
    event.preventDefault();
  }, { capture: true });
  return {
    box: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    tag: best.tagName,
    text: (best.textContent || "").trim().slice(0, 80),
    pool: inMain.length > 0 ? "main" : "document",
    candidates: pool.length,
  };
})()`;

export const COLLECT_FACTS = `(() => {
  const target = window.__ghostTarget;
  const rect = target.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const describe = (el) => ({
    tag: el.tagName,
    id: el.id || "",
    className: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "").slice(0, 120),
  });
  const chain = document.elementsFromPoint(cx, cy).slice(0, 8).map(describe);
  const hit = document.elementFromPoint(cx, cy);
  const hitIsTargetOrDescendant = Boolean(hit) && target.contains(hit);
  let stickyAncestor = null;
  for (let node = hit; node && node !== document.documentElement; node = node.parentElement) {
    const style = getComputedStyle(node);
    const z = Number.parseInt(style.zIndex, 10);
    const positioned = style.position !== "static";
    const highZ = positioned && Number.isFinite(z) && z >= 1000;
    if (style.position === "fixed" || style.position === "sticky" || highZ) {
      stickyAncestor = { ...describe(node), position: style.position, zIndex: style.zIndex };
      break;
    }
  }
  const cmpNames = ["onetrust", "didomi", "cookiebot", "usercentrics", "sp_message", "qc-cmp", "truste", "fc-consent"];
  const cmpSelectors = cmpNames.flatMap((name) => ['[id*="' + name + '" i]', '[class*="' + name + '" i]']);
  cmpSelectors.push('[id="cmp"]', '[class~="cmp"]', '[id^="cmp-"]', '[id^="cmp_"]', '[class^="cmp-"]', '[class^="cmp_"]');
  const cmpRoots = cmpSelectors.filter((selector) => document.querySelector(selector) !== null);
  return {
    hit: hit ? describe(hit) : null,
    chain,
    hitIsTargetOrDescendant,
    stickyAncestor,
    cmpPresent: cmpRoots.length > 0,
    cmpSelectors: cmpRoots,
    title: document.title,
    finalUrl: location.href,
  };
})()`;

export const READ_FIRED = "window.__ghostFired === true";
