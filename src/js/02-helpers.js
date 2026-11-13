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
  function tintedBody(ck) {
    const bh = customVal(ck, "body"), lh = customVal(ck, "lid");
    if (bh === null && lh === null) return body;
    const key = bh + "|" + lh;
    let c = tintCache.get(key);
    if (c) return c;
    c = document.createElement("canvas"); c.width = body.width; c.height = body.height;
    const x = c.getContext("2d"); x.drawImage(body, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const [h, sat, l] = rgb2hsl(px[i], px[i + 1], px[i + 2]);
      let nh = null;
      if (bh !== null && h > 145 && h < 205 && sat > 0.2) nh = bh;
      else if (lh !== null && h > 230 && h < 295 && sat > 0.1) nh = lh;
      if (nh === null) continue;
      const [r, gg, b] = hsl2rgb(nh, Math.min(1, sat * 1.05), l);
      px[i] = r; px[i + 1] = gg; px[i + 2] = b;
    }
    x.putImageData(d, 0, 0);
    tintCache.set(key, c);
    return c;
  }

