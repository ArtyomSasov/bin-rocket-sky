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
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(body, 0, 0);   // read back at once: a GPU canvas stalls the frame for it
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
