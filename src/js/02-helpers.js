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
  // world time everyone agrees on: each player averages its clock offset to every other player,
  // so all of them land on the same mean even when a phone's clock is seconds off
  let clockOff = 0, clockTarget = 0;
  const clockNow = () => Date.now() + clockOff;
  const strHash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h; };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };
  // graphics settings, kept in this browser: res "auto" (drops when slow) or a fixed share of the screen's resolution,
  // fx "high" or "low" (lighter effects), aim: the crosshair ("off", "small", "big"), aimCol: its colour
  const settings = (() => {
    const d = { res: "auto", fx: "high", aim: "small", aimCol: "gun" };
    try {
      const v = JSON.parse(store.get("binrocket.gfx"));
      if (!v || typeof v !== "object") return d;
      if (typeof v.aim === "boolean") v.aim = v.aim ? "small" : "off";   // older saves had the crosshair as on/off
      return { ...d, ...v };
    } catch { return d; }
  })();
  const saveSettings = () => store.set("binrocket.gfx", JSON.stringify(settings));


  // ---------- bin recolouring (cached per body/lid colour pair) ----------
  function rgb2hsl(r, gg, b) {
    r /= 255; gg /= 255; b /= 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const sat = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((gg - b) / d) % 6 : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
    return [(h * 60 + 360) % 360, sat, l];
  }
  function hsl2rgb(h, sat, l) {
    const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, gg, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(r + m) * 255, (gg + m) * 255, (b + m) * 255];
  }
  const tintCache = new Map();
  // a look colour (a hue, or [hue, saturation x, lightness x]) as CSS, at a base saturation and lightness in %
  const toneCss = (v, s, l) => Array.isArray(v) ? `hsl(${v[0]} ${Math.min(100, s * v[1])}% ${Math.min(95, l * v[2])}%)` : `hsl(${v} ${s}% ${l}%)`;
  function tintedBody(ck) {
    const bh = customVal(ck, "body"), lh = customVal(ck, "lid");
    if (bh === null && lh === null) return body;
    const key = JSON.stringify([bh, lh]), tone = v => v === null ? null : Array.isArray(v) ? v : [v, 1.05, 1], bt = tone(bh), lt = tone(lh);
    let c = tintCache.get(key);
    if (c) return c;
    c = document.createElement("canvas"); c.width = body.width; c.height = body.height;
    const x = c.getContext("2d"); x.drawImage(body, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const [h, sat, l] = rgb2hsl(px[i], px[i + 1], px[i + 2]);
      let tn = null;
      if (bt && h > 145 && h < 205 && sat > 0.2) tn = bt;
      else if (lt && h > 230 && h < 295 && sat > 0.1) tn = lt;
      if (!tn) continue;
      const [r, gg, b] = hsl2rgb(tn[0], Math.min(1, sat * tn[1]), Math.min(0.95, l * tn[2]));
      px[i] = r; px[i + 1] = gg; px[i + 2] = b;
    }
    x.putImageData(d, 0, 0);
    tintCache.set(key, c);
    return c;
  }
  // ---------- world event timing (shared clock; used from the first frame, by the bodies too) ----------
  const EV_CYCLE = 45, EV_START = 10, EV_LEN = 25;
  const EV_TYPES = ["blackhole", "meteors", "aliens", "goldrain"];
  function eventAt(ms) {
    const t = ms / 1000, cyc = Math.floor(t / EV_CYCLE), ph = t - cyc * EV_CYCLE;
    return {
      cyc, ph, et: ph - EV_START,
      type: EV_TYPES[Math.floor(hash(cyc, 77, 1) * EV_TYPES.length)],
      active: ph >= EV_START && ph < EV_START + EV_LEN,
      warn: ph >= EV_START - 5 && ph < EV_START
    };
  }
  const ramp = ev => Math.max(0, Math.min(1, ev.et / 2, (EV_LEN - ev.et) / 2));
  const blackHole = ev => ({ x: 500 + hash(ev.cyc, 78, 1) * (W - 1000), y: 500 + hash(ev.cyc, 78, 2) * (H - 1000), k: ramp(ev) });
  // the black hole's pull on everything that moves by the shared clock (planets, moons, wrecks, junk, pick-ups):
  // a spiral toward the hole that deepens through the event and eases back over HOLE_BACK seconds after it, the
  // same in every browser. heavy (0..1): how much it resists. Returns how far in it was dragged (0..0.97)
  const HOLE_BACK = 8, HOLE_EAT = 70;   // HOLE_EAT: radius of the horizon that eats whatever reaches it
  function holePull(o, t, heavy) {
    const ev = eventAt(t);
    if (ev.type !== "blackhole" || ev.et <= 0 || ev.et >= EV_LEN + HOLE_BACK) return 0;
    const back = (ev.et - EV_LEN) / HOLE_BACK, g = ev.et <= EV_LEN ? (ev.et / EV_LEN) ** 1.5 : 1 - back * back * (3 - 2 * back);
    const bh = blackHole(ev), dx = o.x - bh.x, dy = o.y - bh.y, d = Math.hypot(dx, dy);
    const u = Math.min(0.97, g * (1 - heavy) / (1 + (d / 900) ** 2)), a = u * 2.2, c = Math.cos(a), s = Math.sin(a), k = 1 - u;
    o.x = bh.x + (dx * c - dy * s) * k; o.y = bh.y + (dx * s + dy * c) * k;
    return u;
  }
