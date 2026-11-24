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
  // the sprite's pixels that take a look's colours, found once: the hull (teal) and the lid (violet), each pixel's
  // saturation and lightness kept, so a new colour pair only turns those back into RGB (a full pass over the sprite
  // with a colour conversion per pixel stalled a frame by ~12 ms whenever a pilot with new colours came into view)
  let tintSrc = null;
  function tintPixels() {
    if (tintSrc && tintSrc.of === body) return tintSrc;
    const x = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    x.canvas.width = body.width; x.canvas.height = body.height; x.drawImage(body, 0, 0);
    const base = x.getImageData(0, 0, body.width, body.height), px = base.data, at = [], part = [], sl = [];
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const [h, sat, l] = rgb2hsl(px[i], px[i + 1], px[i + 2]);
      const p = h > 145 && h < 205 && sat > 0.2 ? 1 : h > 230 && h < 295 && sat > 0.1 ? 2 : 0;
      if (p) { at.push(i); part.push(p); sl.push(sat, l); }
    }
    return tintSrc = { of: body, base, at: Int32Array.from(at), part: Uint8Array.from(part), sl: Float64Array.from(sl) };
  }
  function tintedBody(ck) {
    const bh = customVal(ck, "body"), lh = customVal(ck, "lid");
    if (bh === null && lh === null) return body;
    const key = JSON.stringify([bh, lh]), tone = v => v === null ? null : Array.isArray(v) ? v : [v, 1.05, 1], bt = tone(bh), lt = tone(lh);
    let c = tintCache.get(key);
    if (c) return c;
    const src = tintPixels(), d = new ImageData(new Uint8ClampedArray(src.base.data), src.base.width, src.base.height), px = d.data;
    for (let n = 0; n < src.at.length; n++) {
      const tn = src.part[n] === 1 ? bt : lt;
      if (!tn) continue;
      const i = src.at[n], h = tn[0], sat = Math.min(1, src.sl[n * 2] * tn[1]), l = Math.min(0.95, src.sl[n * 2 + 1] * tn[2]);
      // hsl2rgb, inline (no array per pixel)
      const C = (1 - Math.abs(2 * l - 1)) * sat, X = C * (1 - Math.abs((h / 60) % 2 - 1)), m = l - C / 2, s6 = Math.min(5, h / 60 | 0);
      const r = s6 === 0 || s6 === 5 ? C : s6 === 1 || s6 === 4 ? X : 0, gg = s6 === 1 || s6 === 2 ? C : s6 === 0 || s6 === 3 ? X : 0, b = s6 === 3 || s6 === 4 ? C : s6 === 2 || s6 === 5 ? X : 0;
      px[i] = (r + m) * 255; px[i + 1] = (gg + m) * 255; px[i + 2] = (b + m) * 255;
    }
    c = document.createElement("canvas"); c.width = body.width; c.height = body.height;
    c.getContext("2d").putImageData(d, 0, 0);
    tintCache.set(key, c);
    return c;
  }
