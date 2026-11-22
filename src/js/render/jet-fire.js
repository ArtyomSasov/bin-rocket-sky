  // ---------- live engine fire: a jet of flame, drawn as fire flows ----------
  // Local frame: nozzle at the origin, +y points out of the engine. The jet is a strip of turbulent flame texture (noise
  // stretched along the flow, tileable along it) scrolled outward every frame so the fire visibly pours out of the
  // nozzle, cut to a flame's shape (narrow at the throat, swelling, then tapering into ragged tongues) and coloured
  // from hot to cool along it; it bends as the bin turns. Two layers: the outer flame (the palette's mid to outer
  // colours, cooling to a dark red) and the inner core (white to its core colour), short and bright. On boost the
  // core goes blue-white and long, shock diamonds stand in it and the flame roars out twice as far
  const JW = 48, JH = 192;
  let jetTex = null, jetMasks = null, jetCanvas = null;
  function jetNoise() {   // turbulent streaks, tileable along y: value noise on a lattice that wraps in y
    const c = document.createElement("canvas"); c.width = JW; c.height = JH;
    const q = c.getContext("2d"), img = q.createImageData(JW, JH), h = (i, j, o) => { const v = Math.sin(i * 127.1 + j * 311.7 + o * 74.7) * 43758.5453; return v - Math.floor(v); };
    const vn = (x, y, py, o) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), w = j => ((j % py) + py) % py;
      const a = h(xi, w(yi), o), b = h(xi + 1, w(yi), o), c2 = h(xi, w(yi + 1), o), d = h(xi + 1, w(yi + 1), o); return a + (b - a) * ux + (c2 - a) * uy + (a - b - c2 + d) * ux * uy; };
    for (let y = 0; y < JH; y++) for (let x = 0; x < JW; x++) {
      const u = x / JW, v = y / JH;
      let n = 0, amp = 0.55, fx = 7, py = 5;
      for (let o = 0; o < 4; o++) { n += vn(u * fx, v * py, py, o) * amp; amp *= 0.5; fx *= 2.1; py *= 2; }
      const k = Math.max(0, Math.min(1, (n - 0.18) / 0.42)), o4 = (y * JW + x) * 4;
      img.data[o4] = img.data[o4 + 1] = img.data[o4 + 2] = 255; img.data[o4 + 3] = 255 * k * k * (3 - 2 * k);
    }
    q.putImageData(img, 0, 0); return c;
  }
  function jetMask(core) {   // the flame's shape as alpha: soft-edged, swelling from the throat, tapering out
    const c = document.createElement("canvas"); c.width = JW; c.height = JH;
    const q = c.getContext("2d"), img = q.createImageData(JW, JH);
    for (let y = 0; y < JH; y++) for (let x = 0; x < JW; x++) {
      const v = y / JH, u = Math.abs(x / (JW - 1) - 0.5) * 2;
      const hw = core ? 0.62 * Math.pow(1 - v, 1.1) * (0.75 + 0.25 * Math.min(1, v / 0.1)) : (0.6 + 0.4 * Math.sin(Math.min(1, v / 0.22) * Math.PI / 2)) * Math.pow(1 - v, 0.65);
      const e = Math.max(0, Math.min(1, (hw - u) / Math.max(0.05, hw * (core ? 0.6 : 0.75))));
      const along = Math.min(1, v / 0.03) * Math.pow(1 - v, core ? 0.5 : 0.35), o4 = (y * JW + x) * 4;
      img.data[o4] = img.data[o4 + 1] = img.data[o4 + 2] = 255; img.data[o4 + 3] = 255 * e * e * (3 - 2 * e) * along;
    }
    q.putImageData(img, 0, 0); return c;
  }
  // one layer, built in the scratch canvas: two sheets of flowing noise, cut to the mask, coloured along the flow
  function jetLayer(core, flow, seed, stops) {
    if (!jetTex) { jetTex = jetNoise(); jetMasks = [jetMask(false), jetMask(true)]; jetCanvas = document.createElement("canvas"); jetCanvas.width = JW; jetCanvas.height = JH; }
    const q = jetCanvas.getContext("2d");
    q.globalCompositeOperation = "copy"; q.globalAlpha = 1;
    const sheet = (off, flip) => { const o = ((off % 1) + 1) % 1 * JH; q.save(); if (flip) { q.translate(JW, 0); q.scale(-1, 1); } q.drawImage(jetTex, 0, -JH + o); q.globalCompositeOperation = "source-over"; q.drawImage(jetTex, 0, o); q.restore(); };
    sheet(flow + seed, false);
    q.globalCompositeOperation = "lighter"; q.globalAlpha = 0.7; { const o = (((flow * 1.37 + seed * 3.1) % 1) + 1) % 1 * JH; q.save(); q.translate(JW, 0); q.scale(-1, 1); q.drawImage(jetTex, 0, -JH + o); q.drawImage(jetTex, 0, o); q.restore(); }
    q.globalAlpha = 1; q.globalCompositeOperation = "destination-in"; q.drawImage(jetMasks[core ? 1 : 0], 0, 0);
    q.globalCompositeOperation = "source-in";
    const gr = q.createLinearGradient(0, 0, 0, JH); for (const [f, c] of stops) gr.addColorStop(f, c);
    q.fillStyle = gr; q.fillRect(0, 0, JW, JH);
    return jetCanvas;
  }
  // the layer drawn along the jet's bent path, in slices: L long, Wd wide at its widest, the tip bent sideways by bend
  function jetDraw(cv, L, Wd, bend) {
    const N = 6;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N, x0 = bend * t0 * t0, x1 = bend * t1 * t1, y0 = L * t0, y1 = L * t1, ang = Math.atan2(x1 - x0, y1 - y0);
      g.save(); g.translate(x0, y0); g.rotate(-ang);
      g.drawImage(cv, 0, JH * t0, JW, JH / N + 0.5, -Wd / 2, 0, Wd, Math.hypot(x1 - x0, y1 - y0) + 0.8);
      g.restore();
    }
  }
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  function drawJet(len, wid, now, pal, boost, seed, bend, power) {
    const t = now / 1000, fl = 0.93 + 0.05 * Math.sin(t * 53 + seed) + 0.03 * Math.sin(t * 89 + seed * 2.3);
    const L = len * (boost ? 1.2 : 1.6) * fl, Wd = wid * (boost ? 2.1 : 2.3);
    if (L < 2) return;
    const core = boost ? [205, 228, 255] : pal.core, mid = pal.mid, outer = pal.outer, ember = [outer[0] * 0.55, outer[1] * 0.3, outer[2] * 0.3];
    const speed = boost ? 4.2 : 2.6;   // how many jet-lengths of fire pour out per second (the texture's flow)
    // bent hard (a sharp turn): its layers fold onto each other by the nozzle and, added up, burned to a white blot; so
    // the more it bends the dimmer each layer
    const fold = 1 - 0.5 * Math.min(1, Math.abs(bend) / (Wd * 1.2));
    g.globalCompositeOperation = "lighter";
    // the outer flame: from the palette's middle through its outer colour to a dull ember red, fading out
    g.globalAlpha = Math.min(1, 0.55 + 0.4 * power) * fold;
    jetDraw(jetLayer(false, -t * speed, seed * 0.13, [[0, rgba(mid, 0.9)], [0.25, rgba(mid, 0.85)], [0.5, rgba(outer, 0.75)], [0.8, rgba(ember, 0.55)], [1, rgba(ember, 0)]]), L, Wd, bend);
    // the inner core: short, white-hot to its core colour (blue-white on boost)
    g.globalAlpha = Math.min(1, 0.7 + 0.3 * power) * fold;
    jetDraw(jetLayer(true, -t * speed * 1.4, seed * 0.29 + 0.5, [[0, "rgba(255,255,255,1)"], [0.3, rgba(core, 0.95)], [0.7, rgba(mid, 0.6)], [1, rgba(mid, 0)]]), L * (boost ? 0.62 : 0.5), Wd * 0.55, bend * 0.5);
    g.globalAlpha = 1;
    if (boost && !lowQ) for (let i = 1; i <= 4; i++) {   // shock diamonds: bright knots standing in the core
      const f = 0.1 + i * 0.12, yj = L * f, xj = bend * f * f, r = Wd * (0.12 - i * 0.015);
      g.globalAlpha = (0.6 - i * 0.11) * fl * fold; g.fillStyle = "#eef6ff";
      g.beginPath(); g.ellipse(xj, yj, r, r * 2.4, 0, 0, 6.29); g.fill();
    }
    g.globalAlpha = 1;
    const hr = Wd * (boost ? 0.6 : 0.5), hg = g.createRadialGradient(0, 2, 0, 0, 2, hr);   // the throat's glow
    hg.addColorStop(0, rgba(core, (boost ? 0.5 : 0.4) * fold)); hg.addColorStop(1, rgba(mid, 0));
    g.fillStyle = hg; g.beginPath(); g.arc(0, 2, hr, 0, 6.29); g.fill();
    g.globalCompositeOperation = "source-over";
  }

