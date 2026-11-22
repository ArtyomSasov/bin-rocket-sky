  // ---------- the look: a WebGL pass over the finished 2D frame ----------
  // The game draws with the 2D canvas as ever; when this works, each frame of it is handed to the GPU and comes out
  // with what a 2D canvas cannot do: bloom (bright fire, shots, neon and pick-ups bleed light round them, from a
  // blurred copy of only their brightest parts, at a quarter of the size and again at an eighth, so the glow is wide
  // and cheap), a touch of colour grading, a vignette, and a short colour split on a big hit or blast. The 2D canvas
  // stays underneath (still the one that takes the mouse); if WebGL is missing, the context is lost, the player picks
  // light effects or the device can't keep up, this canvas hides and the plain picture shows, nothing else changes.
  const post = (() => {
    let gl = null, el = null;
    try {
      if (typeof document === "undefined" || !document.body || !window.WebGLRenderingContext) return null;
      el = document.createElement("canvas"); el.id = "post"; el.setAttribute("aria-hidden", "true");
      gl = el.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    } catch { gl = null; }
    if (!gl) return null;
    cv.after(el);
    const { VS, BRIGHT, BLUR, LIGHT, COMP } = POST_GLSL;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, "p"); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; return { p, u: n => u[n] ?? (u[n] = gl.getUniformLocation(p, n)) }; };
    let P;
    try { P = { bright: prog(BRIGHT), blur: prog(BLUR), comp: prog(COMP), light: prog(LIGHT) }; } catch (e) { console.warn("post effects off:", e.message); el.remove(); return null; }
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; };
    const target = () => ({ t: tex(), f: gl.createFramebuffer(), w: 0, h: 0 });
    const fit = (o, w, h) => {
      if (o.w === w && o.h === h) return;
      o.w = w; o.h = h; gl.bindTexture(gl.TEXTURE_2D, o.t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, o.f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, o.t, 0);
    };
    const frameTex = tex(), A1 = target(), B1 = target(), A2 = target(), B2 = target(), LM = target(), maskTex = tex();
    // ---------- smoke as a fluid ----------
    // A small fluid (192 cells across the view, held to the world: it slides as the camera moves) solved on the GPU each
    // frame as in Jos Stam's stable fluids: velocity and smoke carried along the flow, a little swirl kept alive
    // (vorticity), and the flow made incompressible (a pressure solve). Blasts push it out and fill it with smoke,
    // rockets trail it, fast bins stir it. Needs half-float textures to draw to; without them, no fluid
    const fluid = (() => { try {
      const hf = gl.getExtension("OES_texture_half_float"); gl.getExtension("OES_texture_half_float_linear"); gl.getExtension("EXT_color_buffer_half_float");
      if (!hf) return null;
      const FT = hf.HALF_FLOAT_OES;
      const mk = () => { const o = { t: tex(), f: gl.createFramebuffer(), w: 0, h: 0 }; return o; };
      const size = (o, w, h) => { if (o.w === w && o.h === h) return true; o.w = w; o.h = h; gl.bindTexture(gl.TEXTURE_2D, o.t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, FT, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, o.f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, o.t, 0);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; };
      const pair = () => { const p = { r: mk(), w: mk() }; p.swap = () => { const t = p.r; p.r = p.w; p.w = t; }; return p; };
      const V = pair(), D = pair(), PR = pair(), DIV = mk(), CURL = mk();
      const F = Object.fromEntries(Object.entries(POST_GLSL.FLUID).map(([k, src]) => [k, prog(src)]));
      let W1 = 0, H1 = 0, ok = true, lastCx = null, lastCy = null;
      const splats = [];
      const run = (pr, out, bind) => { gl.useProgram(pr.p); gl.bindFramebuffer(gl.FRAMEBUFFER, out.f); gl.viewport(0, 0, W1, H1); gl.uniform2f(pr.u("px"), 1 / W1, 1 / H1); bind(pr); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
      // a world point and a world velocity, as the fluid has them (uv; cells a second)
      const uvOf = (x, y) => [(x - cam.x) / vw + 0.5, 0.5 - (y - cam.y) / vh];
      return {
        // amount: smoke thickness; col: its colour (0..1); vx, vy: a push (world px/s); radial: a push straight out
        splat(x, y, r, col, amount, vx = 0, vy = 0, radial = 0) { if (splats.length < 64) splats.push([x, y, r, col, amount, vx, vy, radial]); },
        step(dt) {
          if (!ok) return false;
          // (a phone or tablet: a coarser fluid, cheaper on its GPU; it looks much the same, being soft)
          const w = COARSE ? 128 : 192, h = Math.max(32, Math.round(w * vh / vw));
          if (w !== W1 || h !== H1) { W1 = w; H1 = h; for (const o of [V.r, V.w, D.r, D.w, PR.r, PR.w, DIV, CURL]) if (!size(o, w, h)) { ok = false; return false; } }
          const shift = lastCx === null ? [0, 0] : [(cam.x - lastCx) / vw, -(cam.y - lastCy) / vh]; lastCx = cam.x; lastCy = cam.y;
          const cell = vw / W1;   // world px per cell
          for (const [x, y, r, col, amount, vx, vy, radial] of splats.splice(0)) {
            const [u, q] = uvOf(x, y), rr = (r / vw) ** 2;
            if (u < -0.2 || u > 1.2 || q < -0.2 || q > 1.2) continue;
            if (amount > 0) { run(F.splat, D.w, p => { use(5, D.r.t); gl.uniform1i(p.u("base"), 5); gl.uniform2f(p.u("at"), u, q); gl.uniform4f(p.u("col"), col[0] * amount, col[1] * amount, col[2] * amount, amount); gl.uniform1f(p.u("r"), rr); gl.uniform1f(p.u("radial"), 0); gl.uniform1f(p.u("aspect"), vw / vh); }); D.swap(); }
            if (vx || vy || radial) { run(F.splat, V.w, p => { use(5, V.r.t); gl.uniform1i(p.u("base"), 5); gl.uniform2f(p.u("at"), u, q); gl.uniform4f(p.u("col"), radial ? radial / cell : vx / cell, radial ? 0 : -vy / cell, 0, 0); gl.uniform1f(p.u("r"), rr * (radial ? 2.2 : 1)); gl.uniform1f(p.u("radial"), radial ? 1 : 0); gl.uniform1f(p.u("aspect"), vw / vh); }); V.swap(); }
          }
          dt = Math.min(dt, 1 / 30);
          run(F.curl, CURL, p => { use(5, V.r.t); gl.uniform1i(p.u("vel"), 5); });
          run(F.vort, V.w, p => { use(5, V.r.t); use(6, CURL.t); gl.uniform1i(p.u("vel"), 5); gl.uniform1i(p.u("cu"), 6); gl.uniform1f(p.u("dt"), dt); gl.uniform1f(p.u("amt"), 22); }); V.swap();
          run(F.div, DIV, p => { use(5, V.r.t); gl.uniform1i(p.u("vel"), 5); });
          for (let i = 0, n = COARSE ? 10 : 16; i < n; i++) { run(F.press, PR.w, p => { use(5, PR.r.t); use(6, DIV.t); gl.uniform1i(p.u("pr"), 5); gl.uniform1i(p.u("dv"), 6); }); PR.swap(); }
          run(F.grad, V.w, p => { use(5, PR.r.t); use(6, V.r.t); gl.uniform1i(p.u("pr"), 5); gl.uniform1i(p.u("vel"), 6); }); V.swap();
          run(F.advect, V.w, p => { use(5, V.r.t); gl.uniform1i(p.u("vel"), 5); gl.uniform1i(p.u("src"), 5); gl.uniform2f(p.u("shift"), shift[0], shift[1]); gl.uniform1f(p.u("dt"), dt); gl.uniform1f(p.u("keep"), Math.pow(0.5, dt)); }); V.swap();
          run(F.advect, D.w, p => { use(5, V.r.t); use(6, D.r.t); gl.uniform1i(p.u("vel"), 5); gl.uniform1i(p.u("src"), 6); gl.uniform2f(p.u("shift"), shift[0], shift[1]); gl.uniform1f(p.u("dt"), dt); gl.uniform1f(p.u("keep"), Math.pow(0.6, dt)); }); D.swap();
          return true;
        },
        dye: () => D.r.t,
        clear() { for (const o of [V.r, V.w, D.r, D.w]) { gl.bindFramebuffer(gl.FRAMEBUFFER, o.f); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } }
      };
    } catch (e) { console.warn("fluid smoke off:", e.message); return null; } })();
    // what stirs and fills the fluid this frame: new blasts and fires (impacts that throw light), rockets, fast bins
    function feedFluid() {
      // a black hole drinks the smoke in, swirling
      for (const bh of holesNow()) if (bh.k > 0.05) { fluid.splat(bh.x, bh.y, (bh.v ? 420 : 260) * bh.k, null, 0, 0, 0, -(bh.v ? 3000 : 1400) * bh.k); fluid.splat(bh.x + 200, bh.y, 120, [0.3, 0.12, 0.45], 0.03 * bh.k, 0, -900 * bh.k); fluid.splat(bh.x - 200, bh.y, 120, [0.3, 0.12, 0.45], 0.03 * bh.k, 0, 900 * bh.k); }
      // fires keep smoking while they burn; bins badly hurt smoke too
      for (const m of impacts) if (m.flick && m.t >= 0 && m.t < m.dur) fluid.splat(m.x + (Math.random() - 0.5) * 40, m.y + (Math.random() - 0.5) * 40, 26, [0.2, 0.18, 0.18], 0.05, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120);
      const smoking = o => { if (!o.dead && o.lives !== undefined && damageOf(o) > 0.45) fluid.splat(o.x, o.y, 18, [0.22, 0.2, 0.22], 0.06 * damageOf(o), -(o.vx || 0) * 0.3, -(o.vy || 0) * 0.3); };
      if (playing) smoking(me);
      for (const r of remotes.values()) smoking(r);
      const tH = performance.now(); for (const h of hulks) if (tH - h.born < 8000) fluid.splat(h.x, h.y, 22, [0.2, 0.19, 0.2], 0.05 * (1 - (tH - h.born) / 8000), 0, 0);   // (a wreck smokes for its first seconds, not all round)
      for (const m of impacts) {
        if (!m.soft || m.fluided || m.t < 0) continue;
        m.fluided = true;
        const big = m.r > 200, fire = !!m.flick;
        fluid.splat(m.x, m.y, m.r * 0.4, fire ? [0.26, 0.22, 0.21] : [0.34, 0.32, 0.34], big ? 1.1 : 0.8, 0, 0, m.r * 3.2);   // (thin: a blast's smoke must not hide the fight)
      }
      for (const s of shots) if ((s.kind === K.ROCKET || s.kind === K.NUKE) && s.life > 0) fluid.splat(s.x, s.y, 16, [0.5, 0.48, 0.5], 0.09, -s.vx * 0.25, -s.vy * 0.25);
        else if (s.kind === K.GAMMA && s.life > 0) { const sp = Math.hypot(s.vx, s.vy) || 1; fluid.splat(s.x - s.vx / sp * 55 + (Math.random() - 0.5) * 30, s.y - s.vy / sp * 55 + (Math.random() - 0.5) * 30, 30, [0.05, 0.015, 0.025], 0.3, -s.vx * 0.4 + (Math.random() - 0.5) * 300, -s.vy * 0.4 + (Math.random() - 0.5) * 300); }   // its black smoke, left behind it
      // a bin stirs it as it passes, and its engine breathes smoke into it (much more on boost)
      const stir = o => {
        const sp = Math.hypot(o.vx || 0, o.vy || 0), boost = o === me ? me.boostFx > 0 : (o.boost || 0) > 0, th = o === me ? me.thrust || 0 : o.thrust || 0;
        if (sp > 160) fluid.splat(o.x, o.y, 34, null, 0, o.vx * 0.9, o.vy * 0.9);
        if (th > 0.2 || boost) { const a = (o.a || 0) + Math.PI, bx = o.x + Math.cos(a) * 40, by = o.y + Math.sin(a) * 40;
          fluid.splat(bx, by, boost ? 16 : 12, [0.3, 0.28, 0.3], boost ? 0.018 : 0.008, Math.cos(a) * (boost ? 500 : 220), Math.sin(a) * (boost ? 500 : 220)); }   // (a thin haze: a thick one fogs the screen white on a long boost)
      };
      if (playing && !me.dead) stir(me);
      for (const r of remotes.values()) if (!r.dead) stir(r);
    }
    // the occluder map: every standing body drawn small (its solid cells are opaque), redrawn every third frame (moons
    // move, walls break)
    const mask = document.createElement("canvas"), mq = mask.getContext("2d");
    let maskN = 0;
    // (redrawn and sent to the GPU only when something on it moved by a pixel of it, turned or lost cells: a still
    // station with nobody flying costs nothing; maskSig sums up what it shows)
    let maskSig = null;
    function drawMask() {
      const M = 768, k = M / Math.max(W, H);   // (fine enough for crisp shadows)
      let sig = W * 7 + H;
      const add = v => { sig = (sig * 31 + v) | 0; };
      for (const b of bodies) if (!b.dead && !b.free && b.cv) { add(Math.round(b.x * k)); add(Math.round(b.y * k)); add(Math.round((b.a || 0) * 100)); add(b.mass | 0); }
      const pin = o => { add(Math.round(o.x * k)); add(Math.round(o.y * k)); };
      if (playing && !me.dead) pin(me);
      for (const r of remotes.values()) if (!r.dead) pin(r);
      for (const b of bots) if (!b.dead) pin(b);
      if (sig === maskSig) return;
      maskSig = sig;
      if (mask.width !== Math.round(W * k) || mask.height !== Math.round(H * k)) { mask.width = Math.round(W * k); mask.height = Math.round(H * k); }
      mq.setTransform(1, 0, 0, 1, 0, 0); mq.clearRect(0, 0, mask.width, mask.height);
      for (const b of bodies) {
        if (b.dead || b.free || !b.cv) continue;
        mq.setTransform(k, 0, 0, k, b.x * k, b.y * k); mq.rotate(b.a || 0);
        mq.drawImage(b.cv, -b.hw, -b.hh, b.hw * 2, b.hh * 2);
      }
      // the bins too (they throw shadows from lamps and blasts), as discs
      mq.setTransform(1, 0, 0, 1, 0, 0); mq.fillStyle = "#000";
      const disc = (x, y) => { mq.beginPath(); mq.arc(x * k, y * k, BIN_R * 0.75 * k, 0, 6.29); mq.fill(); };
      if (playing && !me.dead) disc(me.x, me.y);
      for (const r of remotes.values()) if (!r.dead) disc(r.x, r.y);
      for (const b of bots) if (!b.dead) disc(b.x, b.y);
      use(3, maskTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    }
    // this frame's lights: the light thrown by blasts and fires (impacts that are soft pools), and the brightest shots
    const LP = new Float32Array(64), LC = new Float32Array(48), LH = new Float32Array(16), LS = new Float32Array(16);
    // a station's lamps: one over every fourth open cell or so, warm white, a few of them failing and flickering
    let lamps = [], lampsFor = "";
    function stationLamps() {
      const key = worldCode + ":" + stationMap();
      if (key === lampsFor) return lamps;
      lampsFor = key; lamps = [];
      if (!stationMap()) return lamps;
      const unit = W / FOUNDRY_N;
      for (const y of [2, 6, 10, 14, 18]) for (const x of [2, 6, 10, 14, 18]) if (foundryOpen(x, y) && !station().space?.(x, y))
        lamps.push({ x: (x + 0.5) * unit, y: (y + 0.5) * unit, r: unit * 2.6, col: (x + y) % 8 === 0 ? station().accent[1] : station().lamp || "#ffe6c0", flick: hash(x, y, 77) < 0.2 ? hash(x, y, 78) * 6.28 : 0 });
      return lamps;
    }
    const rgbOf = c => { if (c[0] === "#") { const v = parseInt(c.slice(1, 7), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; } const p = c.replace(/[^\d.,]/g, "").split(",").map(Number); return [p[0] / 255, p[1] / 255, p[2] / 255]; };
    const SHOT_LIGHT = { [K.ROCKET]: [260, 0.55, 0.45], [K.ORB]: [300, 0.6], [K.GAMMA]: [220, 0.3], [K.NUKE]: [380, 0.7, 0.6], [K.HOLY]: [420, 0.7, 0.3], [K.GREN]: [150, 0.3], [K.PULSE_BOLT]: [150, 0.35], [K.VOID]: [260, 0.5] };
    function gatherLights(now) {
      const list = [], cx = cam.x, cy = cam.y, hw = vw / 2, hh = vh / 2;
      // score: what goes first when there are more than 16 (a lamp counts for less the further it is)
      const add = (x, y, r, a, col, heat = 0, skip = 0, score = a * r * 3) => { if (a > 0.02 && Math.abs(x - cx) < hw + r && Math.abs(y - cy) < hh + r) list.push([x, y, r, a, col, heat, skip, score]); };
      for (const L of stationLamps()) {
        const a = 0.55 * (L.flick ? (Math.sin(now / 53 + L.flick) * Math.sin(now / 131 + L.flick * 3) > 0.55 ? 0.15 : 1) : 1);
        add(L.x, L.y, L.r, a, L.col, 0, 0, a * L.r / (1 + Math.hypot(L.x - cx, L.y - cy) / 600));
      }
      // engines light what is behind them (much more on boost)
      const engines = [];
      if (playing && !me.dead) engines.push(me);
      for (const r of remotes.values()) if (!r.dead) engines.push(r);
      for (const b of engines) {
        const boost = b === me ? me.boostFx > 0 : (b.boost || 0) > 0, th = b.thrust || 0;
        if (th < 0.2 && !boost) continue;
        const j = exhaustJets(b, now).find(o => o.main); if (!j) continue;
        add(j.x + Math.cos(j.a) * 50, j.y + Math.sin(j.a) * 50, boost ? 280 : 200, boost ? 0.42 : 0.26 * Math.min(1, th), boost ? "#ffc890" : "#ff9a4a", boost ? 0.3 : 0.1, 45);
      }
      // a shot's muzzle flash lights its surroundings for its first moment (not shadowed by its own shooter)
      for (const s of shots) { const age = SHOTS[s.kind].life - s.life; if (age >= 0 && age < 0.05 && !SHOTS[s.kind].inert) add(s.x, s.y, 190, 0.55 * (1 - age / 0.05), SHOTS[s.kind].col, 0, 70); }
      for (const m of impacts) {
        if (!m.soft || m.t < 0) continue;
        const k = m.t / (m.dur || 0.22), fl = m.flick ? (1 - k) * (0.7 + 0.3 * Math.sin(now / 37 + m.flick) * Math.sin(now / 61 + m.flick * 2)) : (1 - k) * (1 - k);
        add(m.x, m.y, m.r * (0.8 + 0.4 * k) * 1.4, fl * m.soft * 1.2, m.col, m.flick ? (1 - k) * 1.2 : (1 - k) * 0.6);   // (a fire shimmers longest)
      }
      for (const s of shots) { const L = SHOT_LIGHT[s.kind]; if (L && s.life > 0) add(s.x, s.y, L[0], L[1], SHOTS[s.kind].col, L[2] || 0, 30); }
      list.sort((a, b) => b[7] - a[7]);
      const n = Math.min(16, list.length);
      for (let i = 0; i < n; i++) { const [x, y, r, a, col, heat, skip] = list[i], c = rgbOf(col); LP.set([x, y, r, a], i * 4); LC.set(c, i * 3); LH[i] = heat; LS[i] = skip; }
      return n;
    }
    const pass = (pr, out, w, h, bind) => { gl.useProgram(pr.p); gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.f : null); gl.viewport(0, 0, w, h); bind(pr); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    const use = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); };
    let lost = false;
    el.addEventListener("webglcontextlost", e => { e.preventDefault(); lost = true; }, false);
    let on = false, kick = 0, failed = false;
    // On Auto, when the game runs slow the layer gives up a part at a time, the dearest first, every 2 s it stays slow:
    // the smoke, then the light and shadows, then the glow, then the whole layer. Once given up a part stays off
    // (switching it back on would only slow the game again)
    let autoStep = 0, slowSince = 0, smokeLive = false;
    const part = (name, step) => settings[name] !== "off" && (settings.post !== "auto" || autoStep < step);
    function show(v) { if (v === on) return; on = v; el.style.display = v ? "block" : "none"; cv.style.opacity = v ? "0" : ""; }
    show(false);
    const waves = [];
    const WV = new Float32Array(16), WW = new Float32Array(4);
    return {
      // a big hit or blast splits the colours a moment (k: 0..1)
      kick(k) { kick = Math.max(kick, k); },
      get autoStep() { return autoStep; },   // how much Auto has given up (0: nothing, 4: the whole layer)
      // a blast's smoke rolling out through the fluid
      burst(x, y, r, col, amount, radial) { if (fluid && smokeLive) { fluid.splat(x, y, r, col, amount, 0, 0, radial); for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; fluid.splat(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, r * 0.5, col, amount * 0.4, Math.cos(a) * radial * 0.25, Math.sin(a) * radial * 0.25); } } },
      // a shock wave bending the picture: out to reach (world px) over dur seconds, strength in the view's terms
      wave(x, y, reach, dur, strength) { pushCapped(waves, { x, y, reach, dur, s: strength, t0: performance.now() }, 4); },
      frame(dt) {
        if (settings.post === "auto" && lowQ && autoStep < 4) {
          const t = performance.now();
          if (settings.fx === "low") autoStep = 4;   // light effects asked for: none of it
          else if (!slowSince) slowSince = t;
          else if (t - slowSince > 2000) { autoStep++; slowSince = t; }
        } else slowSince = 0;
        const glowOn = part("glow", 3), lightOn = part("light", 2), smokeOn = part("smoke", 1);
        const want = !lost && !failed && settings.post !== "off" && (settings.post === "on" || autoStep < 4) && (glowOn || lightOn || smokeOn);
        if (!want) { smokeLive = false; show(false); return; }
        const W0 = cv.width, H0 = cv.height;
        if (el.width !== W0 || el.height !== H0) { el.width = W0; el.height = H0; }
        try {
          use(0, frameTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);   // (a canvas comes in top row first; GL counts from the bottom)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
          const w1 = Math.max(1, W0 >> 2), h1 = Math.max(1, H0 >> 2), w2 = Math.max(1, W0 >> 3), h2 = Math.max(1, H0 >> 3);
          fit(A1, w1, h1); fit(B1, w1, h1); fit(A2, w2, h2); fit(B2, w2, h2);
          if (glowOn) {
          pass(P.bright, A1, w1, h1, p => { use(0, frameTex); gl.uniform1i(p.u("t"), 0); gl.uniform2f(p.u("px"), 2 / W0, 2 / H0); });
          pass(P.blur, B1, w1, h1, p => { use(0, A1.t); gl.uniform1i(p.u("t"), 0); gl.uniform2f(p.u("d"), 1 / w1, 0); });
          pass(P.blur, A1, w1, h1, p => { use(0, B1.t); gl.uniform1i(p.u("t"), 0); gl.uniform2f(p.u("d"), 0, 1 / h1); });
          pass(P.blur, B2, w2, h2, p => { use(0, A1.t); gl.uniform1i(p.u("t"), 0); gl.uniform2f(p.u("d"), 1 / w2, 0); });
          pass(P.blur, A2, w2, h2, p => { use(0, B2.t); gl.uniform1i(p.u("t"), 0); gl.uniform2f(p.u("d"), 0, 1 / h2); });
          }
          // the light map, at half the size (its shadows crisp enough)
          if (lightOn && maskN++ % 3 === 0) drawMask();
          const nl = lightOn ? gatherLights(performance.now()) : 0;
          const wL = Math.max(1, W0 >> (COARSE ? 2 : 1)), hL = Math.max(1, H0 >> (COARSE ? 2 : 1));   // (a phone: the light at a quarter, its fill rate is the cost)
          fit(LM, wL, hL);
          if (lightOn) pass(P.light, LM, wL, hL, p => { use(3, maskTex); gl.uniform1i(p.u("m"), 3); gl.uniform2f(p.u("cam"), cam.x, cam.y); gl.uniform2f(p.u("view"), vw, vh); gl.uniform2f(p.u("world"), W, H);
            gl.uniform1f(p.u("n"), nl); if (nl) { gl.uniform4fv(p.u("lp"), LP); gl.uniform3fv(p.u("lc"), LC); gl.uniform1fv(p.u("lh"), LH); gl.uniform1fv(p.u("ls"), LS); } });
          kick = Math.max(0, kick - dt * 3.5);
          smokeLive = smokeOn;
          const fl = fluid && smokeOn ? (feedFluid(), fluid.step(dt)) : false;
          const ca = Math.min(0.012, 0.0015 + kick * 0.01 + flash * 0.006);
          // the waves in the view: where each ring is now
          const tw = performance.now(); let nw = 0;
          for (let i = waves.length - 1; i >= 0; i--) if (tw - waves[i].t0 > waves[i].dur * 1000) waves.splice(i, 1);
          for (const w of waves) {
            const k = (tw - w.t0) / (w.dur * 1000), r = w.reach * (1 - Math.pow(1 - k, 2)) / vh;
            WV.set([(w.x - cam.x) / vw + 0.5, 0.5 - (w.y - cam.y) / vh, r, w.s * (1 - k)], nw * 4); WW[nw] = 0.03 + 0.05 * k; nw++;
          }
          pass(P.comp, null, W0, H0, p => {
            gl.uniform1f(p.u("wn"), nw); gl.uniform1f(p.u("asp"), vw / vh); if (nw) { gl.uniform4fv(p.u("wv"), WV); gl.uniform1fv(p.u("ww"), WW); } use(0, frameTex); use(1, A1.t); use(2, A2.t); use(4, LM.t); gl.uniform1i(p.u("t"), 0); gl.uniform1i(p.u("b1"), 1); gl.uniform1i(p.u("b2"), 2); gl.uniform1i(p.u("lm"), 4); if (fl) { use(7, fluid.dye()); gl.uniform1i(p.u("dye"), 7); } gl.uniform1f(p.u("fl"), fl ? 1 : 0); gl.uniform1f(p.u("dbg"), window.__lightMap ? 1 : 0); gl.uniform1f(p.u("amb"), stationMap() ? 0.56 : 0.86); gl.uniform1f(p.u("time"), (performance.now() / 1000) % 1000);   // (a station a little darker, so its lights tell)   // (__lightMap: the light alone, for checking it)
            gl.uniform1f(p.u("bl"), glowOn ? 0.6 : 0); gl.uniform1f(p.u("lon"), lightOn ? 1 : 0); gl.uniform1f(p.u("ca"), ca); gl.uniform1f(p.u("vig"), playing ? 0.32 : 0.22); gl.uniform1f(p.u("sat"), 1.08); });
          show(true);
        } catch (e) { failed = true; show(false); console.warn("post effects off:", e.message); }
      }
    };
  })();
