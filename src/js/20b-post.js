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
    const VS = "attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}";
    // the bright parts only (a soft knee above the threshold), fire and neon kept in their colours
    const BRIGHT = "precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 px;void main(){" +
      "vec3 c=(texture2D(t,v+px*vec2(-.5,-.5)).rgb+texture2D(t,v+px*vec2(.5,-.5)).rgb+texture2D(t,v+px*vec2(-.5,.5)).rgb+texture2D(t,v+px*vec2(.5,.5)).rgb)*.25;" +
      "float l=max(c.r,max(c.g,c.b));float k=clamp((l-.72)/.28,0.,1.);gl_FragColor=vec4(c*k*k*.8,1.);}";
    // a 9-tap gaussian along one direction
    const BLUR = "precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 d;void main(){" +
      "vec3 s=texture2D(t,v).rgb*.227;s+=(texture2D(t,v+d*1.385).rgb+texture2D(t,v-d*1.385).rgb)*.316;s+=(texture2D(t,v+d*3.231).rgb+texture2D(t,v-d*3.231).rgb)*.07;gl_FragColor=vec4(s,1.);}";
    // the frame + both glows, graded; the vignette; the colour split (ca) out from the middle
    const COMP = "precision mediump float;varying vec2 v;uniform sampler2D t,b1,b2;uniform float bl,ca,vig,sat;void main(){" +
      "vec2 o=(v-.5)*ca;vec3 c=vec3(texture2D(t,v+o).r,texture2D(t,v).g,texture2D(t,v-o).b);" +
      "c+=(texture2D(b1,v).rgb*.9+texture2D(b2,v).rgb*1.1)*bl;" +
      "float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,sat);c=(c-.5)*1.04+.5;" +
      "float r=length((v-.5)*vec2(1.,.8));c*=1.-vig*smoothstep(.45,.95,r);" +
      "c=c/(1.+max(c-.85,0.)*.9);gl_FragColor=vec4(c,1.);}";
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, "p"); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; return { p, u: n => u[n] ?? (u[n] = gl.getUniformLocation(p, n)) }; };
    let P;
    try { P = { bright: prog(BRIGHT), blur: prog(BLUR), comp: prog(COMP) }; } catch (e) { console.warn("post effects off:", e.message); el.remove(); return null; }
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
    const frameTex = tex(), A1 = target(), B1 = target(), A2 = target(), B2 = target();
    const pass = (pr, out, w, h, bind) => { gl.useProgram(pr.p); gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.f : null); gl.viewport(0, 0, w, h); bind(pr); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    const use = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); };
    let lost = false;
    el.addEventListener("webglcontextlost", e => { e.preventDefault(); lost = true; }, false);
    let on = false, kick = 0, failed = false, tooSlow = false;
    function show(v) { if (v === on) return; on = v; el.style.display = v ? "block" : "none"; cv.style.opacity = v ? "0" : ""; }
    show(false);
    return {
      // a big hit or blast splits the colours a moment (k: 0..1)
      kick(k) { kick = Math.max(kick, k); },
      frame(dt) {
        // (on Auto, once the game has run slow it stays off: switching it back on would only slow it again)
        if (lowQ && settings.post === "auto") tooSlow = true;
        const want = !lost && !failed && settings.post !== "off" && (settings.post === "on" || !tooSlow);
        if (!want) { show(false); return; }
        const W0 = cv.width, H0 = cv.height;
        if (el.width !== W0 || el.height !== H0) { el.width = W0; el.height = H0; }
        try {
          use(0, frameTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);   // (a canvas comes in top row first; GL counts from the bottom)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
          const w1 = Math.max(1, W0 >> 2), h1 = Math.max(1, H0 >> 2), w2 = Math.max(1, W0 >> 3), h2 = Math.max(1, H0 >> 3);
          fit(A1, w1, h1); fit(B1, w1, h1); fit(A2, w2, h2); fit(B2, w2, h2);
          pass(P.bright, A1, w1, h1, p => { use(0, frameTex); gl.uniform1i(p.u("t"), 0); gl.uniform2f(p.u("px"), 2 / W0, 2 / H0); });
          pass(P.blur, B1, w1, h1, p => { use(0, A1.t); gl.uniform1i(p.u("t"), 0); gl.uniform2f(p.u("d"), 1 / w1, 0); });
          pass(P.blur, A1, w1, h1, p => { use(0, B1.t); gl.uniform1i(p.u("t"), 0); gl.uniform2f(p.u("d"), 0, 1 / h1); });
          pass(P.blur, B2, w2, h2, p => { use(0, A1.t); gl.uniform1i(p.u("t"), 0); gl.uniform2f(p.u("d"), 1 / w2, 0); });
          pass(P.blur, A2, w2, h2, p => { use(0, B2.t); gl.uniform1i(p.u("t"), 0); gl.uniform2f(p.u("d"), 0, 1 / h2); });
          kick = Math.max(0, kick - dt * 3.5);
          const ca = Math.min(0.012, 0.0015 + kick * 0.01 + flash * 0.006);
          pass(P.comp, null, W0, H0, p => { use(0, frameTex); use(1, A1.t); use(2, A2.t); gl.uniform1i(p.u("t"), 0); gl.uniform1i(p.u("b1"), 1); gl.uniform1i(p.u("b2"), 2);
            gl.uniform1f(p.u("bl"), 0.6); gl.uniform1f(p.u("ca"), ca); gl.uniform1f(p.u("vig"), playing ? 0.32 : 0.22); gl.uniform1f(p.u("sat"), 1.08); });
          show(true);
        } catch (e) { failed = true; show(false); console.warn("post effects off:", e.message); }
      }
    };
  })();
