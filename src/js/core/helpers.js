  // ---------- helpers ----------
  const hash = (a, b, c) => {
    let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };
  const wrapD = d => d;   // walled arena: plain distance, no wrap-around
  const mod = (v, s) => ((v % s) + s) % s;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const bounceIn = (v, lo, hi) => lo + (hi - lo) - Math.abs(mod(v - lo, 2 * (hi - lo)) - (hi - lo));
  const angD = d => ((d % 6.2832) + 6.2832 * 1.5) % 6.2832 - 3.1416;
  const lerpAng = (a, b, t) => a + angD(b - a) * t;
  const WALL_R = 34;      // bot radius against the walls
  const rndIn = (s, m) => m + Math.random() * (s - 2 * m);
  const num = (v, d) => Number.isFinite(v) ? v : d;
  // Quad damage on a pilot: its seconds left (a bot, me: ampUntil), and whether it carries it (another player: amp,
  // from their state)
  const ampLeft = (p, now = performance.now()) => p && p.ampUntil > now ? (p.ampUntil - now) / 1000 : 0;
  const amped = (p, now = performance.now()) => !!p && (!!p.amp || ampLeft(p, now) > 0);
  // world time everyone agrees on: each player averages its clock offset to every other player,
  // so all of them land on the same mean even when a phone's clock is seconds off
  let clockOff = 0, clockTarget = 0, clockBase = 0;   // clockBase: offline, the shift that starts a fresh round at take-off
  const clockNow = () => Date.now() + clockOff;
  const strHash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h; };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };
  // graphics settings, kept in this browser: res "auto" (drops when slow) or a fixed share of the screen's resolution,
  // fx "high" or "low" (lighter effects), aim: the crosshair ("off", "small", "big"), aimCol: its colour
  const settings = (() => {
    const d = { res: "auto", fx: "high", post: "auto", light: "on", smoke: "on", glow: "on", aim: "small", aimCol: "gun", engine: "on", engineV: 3, mouse: "aim", vol: 100, volFx: 100, volEngine: 100, volVoice: 100 };   // Recorded spaceship loop; the sound setting can still disable it
    try {
      const v = JSON.parse(store.get("binrocket.gfx"));
      if (!v || typeof v !== "object") return d;
      if (typeof v.aim === "boolean") v.aim = v.aim ? "small" : "off";   // older saves had the crosshair as on/off
      if ((v.engineV || 0) < 3) { v.engine = "on"; v.engineV = 3; }   // replace the former silent default with the new recorded engine
      return { ...d, ...v };
    } catch { return d; }
  })();
  const saveSettings = () => store.set("binrocket.gfx", JSON.stringify(settings));


