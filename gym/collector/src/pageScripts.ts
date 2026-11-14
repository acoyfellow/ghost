export const pickByRule = `(() => {
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
  const all = Array.from(document.querySelectorAll("a, button")).filter((el) => isVisible(el) && centerInViewport(el.getBoundingClientRect()) && !inStickyChrome(el));
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
  window.__ghostTarget = best;
  return best !== null;
})()`;

export const pickBySelector = (selector: string) =>
  `(() => { window.__ghostTarget = document.querySelector(${JSON.stringify(selector)}); return window.__ghostTarget !== null; })()`;

export const readyState = `(() => ({ hasReadyFlag: "__ghostReady" in window, ready: window.__ghostReady === true }))()`;

export const callAct = `(() => { if (typeof window.__ghostAct === "function") { window.__ghostAct(); return true; } return false; })()`;

export const observe = `(() => {
  const target = window.__ghostTarget;
  const rect = target.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const viewOf = (el) => (el.ownerDocument && el.ownerDocument.defaultView) || window;
  const describe = (el) => {
    const style = viewOf(el).getComputedStyle(el);
    return {
      tag: el.tagName,
      id: el.id || "",
      className: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "").slice(0, 120),
      pointerEvents: style.pointerEvents,
      visibility: style.visibility,
      opacity: style.opacity,
      position: style.position,
      zIndex: style.zIndex,
    };
  };
  const deepChain = (root, x, y, chain) => {
    const elements = root.elementsFromPoint(x, y);
    for (const el of elements.slice(0, 8)) chain.push(describe(el));
    const top = elements[0];
    if (!top) return top;
    if (top.shadowRoot) {
      const inner = deepChain(top.shadowRoot, x, y, chain);
      return inner || top;
    }
    if (top.tagName === "IFRAME" && top.contentDocument) {
      const frameRect = top.getBoundingClientRect();
      const inner = deepChain(top.contentDocument, x - frameRect.left, y - frameRect.top, chain);
      return inner || top;
    }
    return top;
  };
  const parentOf = (node) => {
    if (node.parentElement) return node.parentElement;
    const root = node.getRootNode();
    if (root && root.host) return root.host;
    const view = viewOf(node);
    return view.frameElement || null;
  };
  const chain = [];
  const hit = deepChain(document, cx, cy, chain);
  const hitPath = [];
  for (let node = hit; node; node = parentOf(node)) hitPath.push(node);
  const shadowHops = hitPath.filter((node) => node.getRootNode() instanceof ShadowRoot).length;
  const frameHops = hitPath.filter((node) => viewOf(node) !== window).length;
  let stickyAncestor = null;
  for (const node of hitPath) {
    const style = viewOf(node).getComputedStyle(node);
    const z = Number.parseInt(style.zIndex, 10);
    const highZ = style.position !== "static" && Number.isFinite(z) && z >= 1000;
    if (style.position === "fixed" || style.position === "sticky" || highZ) {
      stickyAncestor = describe(node);
      break;
    }
  }
  const targetPath = [];
  for (let node = target; node; node = parentOf(node)) targetPath.push(node);
  const ancestorState = targetPath.map((node) => ({
    tag: node.tagName,
    inert: node.hasAttribute("inert") || node.inert === true,
    disabled: node.hasAttribute("disabled"),
    ariaDisabled: node.getAttribute("aria-disabled"),
    matchesDisabled: node.matches(":disabled"),
  }));
  const lockOf = (el) => {
    const style = getComputedStyle(el);
    return { overflow: style.overflow, overflowX: style.overflowX, overflowY: style.overflowY, position: style.position };
  };
  const attributes = {};
  for (const attribute of Array.from(target.attributes)) attributes[attribute.name] = attribute.value.slice(0, 200);
  const countShadowRoots = () => {
    let count = 0;
    for (const el of document.querySelectorAll("*")) if (el.shadowRoot) count++;
    return count;
  };
  return {
    target: {
      tag: target.tagName,
      text: (target.textContent || "").trim().slice(0, 80),
      attributes,
      box: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    },
    clickPoint: { x: cx, y: cy },
    pointInViewport: cx >= 0 && cx < innerWidth && cy >= 0 && cy < innerHeight,
    chain,
    hit: hit ? describe(hit) : null,
    hitIsTarget: Boolean(hit) && (hit === target || target.contains(hit)),
    stickyAncestor,
    ancestorState,
    scrollLock: { html: lockOf(document.documentElement), body: lockOf(document.body) },
    hitPathShadowRoots: shadowHops,
    hitPathIframes: frameHops,
    openShadowRootsOnPage: countShadowRoots(),
    iframesOnPage: document.querySelectorAll("iframe").length,
    title: document.title,
    finalUrl: location.href,
  };
})()`;

export const armListeners = `(() => {
  const target = window.__ghostTarget;
  window.__ghostFired = false;
  window.__ghostSeen = null;
  const describe = (el) => (el && el.tagName ? { tag: el.tagName, id: el.id || "", className: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || "").slice(0, 120) } : null);
  target.addEventListener("click", (event) => {
    window.__ghostFired = true;
    event.preventDefault();
  }, { capture: true });
  const record = (event) => {
    if (window.__ghostSeen === null) window.__ghostSeen = describe(event.composedPath()[0]);
  };
  window.addEventListener("click", record, { capture: true });
  for (const frame of Array.from(document.querySelectorAll("iframe"))) {
    try { frame.contentDocument.addEventListener("click", record, { capture: true }); } catch (e) {}
  }
  return true;
})()`;

export const hitAtPoint = (x: number, y: number) => `(() => {
  const target = window.__ghostTarget;
  let hit = document.elementFromPoint(${x}, ${y});
  while (hit && hit.shadowRoot) {
    const inner = hit.shadowRoot.elementFromPoint(${x}, ${y});
    if (!inner || inner === hit) break;
    hit = inner;
  }
  if (hit && hit.tagName === "IFRAME" && hit.contentDocument) {
    const frame = hit.getBoundingClientRect();
    hit = hit.contentDocument.elementFromPoint(${x} - frame.left, ${y} - frame.top) || hit;
  }
  for (let node = hit; node; node = node.parentElement || (node.getRootNode && node.getRootNode().host) || (node.ownerDocument && node.ownerDocument.defaultView && node.ownerDocument.defaultView.frameElement) || null) {
    if (node === target) return true;
  }
  return false;
})()`;

export const earlyListeners = `(() => {
  window.__ghostEarly = { pointerdown: null, mousedown: null, click: null };
  window.__ghostAtClick = { delivered: false, pointerdownOnTarget: false, clickSeen: false };
  const note = (type) => (event) => {
    if (window.__ghostEarly[type] !== null) return;
    const path = event.composedPath();
    window.__ghostEarly[type] = path;
    const onTarget = Boolean(window.__ghostTarget) && path.includes(window.__ghostTarget);
    if (type === "click") { window.__ghostAtClick.clickSeen = true; window.__ghostAtClick.delivered = onTarget; }
    if (type === "pointerdown") window.__ghostAtClick.pointerdownOnTarget = onTarget;
    try { sessionStorage.setItem("__ghostAtClick", JSON.stringify(window.__ghostAtClick)); } catch (e) {}
  };
  for (const type of ["pointerdown", "mousedown", "click"]) window.addEventListener(type, note(type), { capture: true });
})();`;

export const armEffect = `(() => {
  window.__ghostEffect = { href: location.href, mutations: 0 };
  const observer = new MutationObserver((records) => { window.__ghostEffect.mutations += records.length; });
  observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  return true;
})()`;

export const readEarly = `(() => {
  const target = window.__ghostTarget;
  const early = window.__ghostEarly || { pointerdown: null, mousedown: null, click: null };
  let atClick = window.__ghostAtClick || null;
  let fromStorage = false;
  if (!target) {
    try { const stored = sessionStorage.getItem("__ghostAtClick"); if (stored) { atClick = JSON.parse(stored); fromStorage = true; } } catch (e) {}
  }
  const tagOf = (path) => (Array.isArray(path) && path[0] && path[0].tagName) || null;
  const effect = window.__ghostEffect || null;
  return {
    installed: Boolean(window.__ghostEarly),
    samePage: Boolean(target),
    fromStorage,
    clickSeen: atClick ? atClick.clickSeen === true : false,
    delivered: atClick ? atClick.delivered === true : false,
    pointerdownOnTarget: atClick ? atClick.pointerdownOnTarget === true : false,
    clickTopTag: tagOf(early.click),
    sameNode: Boolean(target && target.isConnected),
    href: location.href,
    domMutations: effect ? effect.mutations : null,
  };
})()`;

export const boxNow = `(() => { const r = window.__ghostTarget.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`;

export const readOutcome = `(() => ({ fired: window.__ghostFired === true, eventTarget: window.__ghostSeen }))()`;
