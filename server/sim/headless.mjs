// Runs the game's own code (src/js, the same sections the browser runs, in build-order.json's order) in Node with no browser:
// the page, canvas, audio and storage are inert stand-ins, so only the simulation does anything.
// This is how the authoritative server simulates a match with exactly the rules the clients have.
import vm from "node:vm";
import { createCanvas } from "@napi-rs/canvas";
import { gameSource } from "./source.mjs";


// An object that answers anything: every property is another stand-in, calling or constructing one returns
// one, and as a value it reads as 0 or "". Page elements, canvas contexts, gradients and audio nodes all
// become these, so drawing and HUD code runs through without effect.
function inert(cache = new Map()) {
  return new Proxy(function () {}, {
    get(_, key) {
      if (key === Symbol.toPrimitive) return hint => (hint === "number" ? 0 : "");
      if (key === "then" || key === Symbol.iterator && false) return undefined;   // never a promise
      if (key === Symbol.iterator) return function* () {};
      if (key === "length") return 0;
      if (key === "toJSON") return () => null;
      if (!cache.has(key)) cache.set(key, inert());
      return cache.get(key);
    },
    set(_, key, value) { cache.set(key, value); return true; },
    has: () => true,
    apply: () => inert(),
    construct: () => inert()
  });
}

// A real canvas (Skia, the engine Chrome draws with) for bodies only: the game paints planets, wrecks and station
// walls and then reads which cells are painted to know what is solid, so the server must paint them as a browser
// does. Every other canvas (sky, sprites, effects) stays inert: the server never looks at them.
function canvasElement() {
  const c = createCanvas(1, 1);
  Object.assign(c, { style: inert(), addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: c.width, height: c.height }) });
  return c;
}

// The browser globals the game touches, as a context for vm. Anything not listed resolves to an inert stand-in
// through `window`/`document`; the listed ones have real values because the game branches on them.
function browserless() {
  const listeners = new Map(), timers = new Set();
  let simNow = null;
  // the game's own timers (its once-a-second housekeeping, delayed sounds) belong to this match: dispose() stops them
  const timer = (start, stop) => [(fn, ms, ...a) => { const t = start(() => { if (start === setTimeout) timers.delete(t); fn(...a); }, ms); timers.add(t); return t; },
    t => { timers.delete(t); stop(t); }];
  const [setT, clearT] = timer(setTimeout, clearTimeout), [setI, clearI] = timer(setInterval, clearInterval);
  const store = new Map();
  const ctx = {
    console, Math, JSON, Date, Map, Set, WeakMap, WeakSet, Promise, Array, Object, Number, String, Boolean, Symbol, RegExp, Error,
    TypeError, RangeError, Proxy, Reflect, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Float32Array, Float64Array,
    ArrayBuffer, DataView, Infinity, NaN, isFinite, isNaN, parseFloat, parseInt, encodeURIComponent, decodeURIComponent, URL, TextEncoder, TextDecoder,
    structuredClone, queueMicrotask, setTimeout: setT, clearTimeout: clearT, setInterval: setI, clearInterval: clearI, atob, btoa,
    // the match's clock: set by every simulation step (see __setNow), so everything in the game agrees on the time,
    // including the parts that ask the clock themselves (protection after a respawn or a dash)
    performance: { now: () => (simNow ?? performance.now()) },
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    // ?offline: the multiplayer library is never loaded, and nothing in the page talks to a broker
    location: { search: "?offline", hash: "", href: "http://server/?offline", pathname: "/", protocol: "http:", reload() {} },
    navigator: { onLine: false, userAgent: "node", platform: "server", clipboard: inert(), mediaDevices: inert() },
    history: { replaceState() {}, pushState() {} },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},   // the server steps the world itself
    addEventListener: (type, fn) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener() {}, dispatchEvent() { return true; },
    fetch: () => Promise.reject(new Error("no network in the simulation")),
    Image: function () { return inert(); }, Path2D: function () { return inert(); }, ResizeObserver: function () { return inert(); },
    KeyboardEvent: function () { return inert(); }, Event: function () { return inert(); },
    AudioContext: function () { return inert(); },
    document: inert(),
    BRS_BODY_CANVAS: canvasElement
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  const context = vm.createContext(ctx);
  Object.defineProperty(context, "__setNow", { value: t => { simNow = t; } });
  Object.defineProperty(context, "__dispose", { value: () => { for (const t of timers) { clearTimeout(t); clearInterval(t); } timers.clear(); } });
  return context;
}

// Loads the game into a fresh context. `extra` is code appended inside the game's scope, so it can reach the
// game's own variables and functions (the server's bridge, see sim.mjs); it runs after everything else.
export function loadGame(extra = "") {
  const source = "(() => {\n" + gameSource() + extra + "\n})();\n";   // (as the build joins it: source.mjs)
  const context = browserless();
  vm.runInContext(source, context, { filename: "bin-rocket-sky.js" });
  return context;
}
