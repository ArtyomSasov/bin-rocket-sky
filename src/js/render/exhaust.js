  // ---------- the engine's exhaust: a plume of flame, built afresh ----------
  // As a rocket's: hundreds of small hot gas particles leave each nozzle every second, fast along the jet on top of the
  // bin's own speed, and then live in the world on their own: as the bin turns the plume curls behind it, at speed it
  // stretches out, at rest it stands short and full. Each cools as it goes, from the palette's white-hot core (the bin's
  // tier or the flame it wears) through its middle and outer colours to a dull red, swelling as it cools, and some leave
  // a wisp of smoke. On boost it pours out twice as thick, faster and hotter, and the core turns blue-white
  const plume = [];   // { x, y, vx, vy, t, life, s0, s1, c: [core, mid, outer], boost }
  const plumeCols = new Map();   // a palette's colours as sprite keys (quantized, so a rainbow flame keeps the cache small)
  function plumeColsOf(pal, boost) {
    const q = c => (c[0] >> 4 << 4) + "," + (c[1] >> 4 << 4) + "," + (c[2] >> 4 << 4), key = q(pal.core) + "|" + q(pal.mid) + "|" + q(pal.outer) + (boost ? "b" : "");
    let c = plumeCols.get(key);
    if (!c) { c = [boost ? "rgb(215,235,255)" : `rgb(${q(pal.core)})`, `rgb(${q(pal.core)})`, `rgb(${q(pal.mid)})`, `rgb(${q(pal.outer)})`, "rgb(120,30,14)"];
      c.own = pal !== FLAME && !(pal.outer[0] > 200 && pal.outer[1] < 120 && pal.outer[2] < 80);   // (an orange fire uses real flame; other colours their glow)
      plumeCols.set(key, c); }
    return c;
  }
  function emitPlume(b, dt, boost) {
    if (dt <= 0) return;
    const jets = exhaustJets(b, performance.now()), pal = b.flamePal || FLAME, cols = plumeColsOf(pal, boost), q = lowQ ? 0.45 : 1;
    for (const j of jets) {
      if (j.power < 0.05) continue;
      // the jet itself is drawn on the bin (drawJet); these are the flame licks torn off its end, which live in the
      // world and so curl away behind a turning bin, cooling to smoke
      const rate = (j.main ? (boost ? 70 : 30) : 10) * Math.min(1.4, j.power) * q;
      const n = emissionCount(b, j.main ? "plumeMain" : "plumeSide", rate, dt);
      const wid = j.size * (j.main ? 0.22 : 0.1) * Math.sqrt(j.power) * (boost ? 1.25 : 1), speed = (boost ? 900 : 480) * Math.sqrt(Math.min(1.4, j.power));
      const reach = j.size * (j.main ? 0.65 : 0.4) * j.power * (boost ? 2.7 : 1) * (boost ? 1.2 : 1.55);   // how far out the drawn jet ends
      for (let k = 0; k < n; k++) {
        const age = Math.random() * dt, a = j.a + (Math.random() - 0.5) * (boost ? 0.12 : 0.25), sp = speed * (0.8 + Math.random() * 0.4), at = reach * (0.55 + Math.random() * 0.35);
        const vx = (b.vx || 0) * 0.85 + Math.cos(a) * sp, vy = (b.vy || 0) * 0.85 + Math.sin(a) * sp;
        plume.push({ x: j.x + Math.cos(a) * at - (b.vx || 0) * age + vx * age * 0.15, y: j.y + Math.sin(a) * at - (b.vy || 0) * age + vy * age * 0.15, vx, vy, t: age,
          life: (boost ? 0.28 : 0.24) * (0.7 + Math.random() * 0.6) * (j.main ? 1 : 0.6), s0: wid * 0.3, s1: wid * (boost ? 0.7 : 0.6), c: cols, boost, wob: Math.random() * 6.28 });
      }
    }
    if (plume.length > 2600) plume.splice(0, plume.length - 2600);
  }
  function updatePlume(dt) {
    const drag = Math.exp(-2.6 * dt);
    for (let i = plume.length - 1; i >= 0; i--) {
      const p = plume[i]; p.t += dt;
      if (p.t >= p.life) {
        if (Math.random() < (lowQ ? 0.03 : 0.08)) puff(p.x, p.y, p.vx * 0.15, p.vy * 0.15, 0.7 + Math.random() * 0.6, p.s1 * 0.5, SMOKE_COLS[2], 2, 0, 0, 0.94);   // a wisp of smoke
        plume[i] = plume[plume.length - 1]; plume.pop(); continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= drag; p.vy *= drag;
    }
  }
  // Drawn as fire is: each particle a puff of turbulent flame (the blasts' noise-textured flame), stretched along its
  // flight and turned with it. Young ones are added (light: a blinding jet), older ones laid over (body: an orange and
  // red flame with ragged edges that turns to smoke). A flame the bin wears in its own colours keeps its glow sprites
  function drawPlume() {
    if (!plume.length) return;
    g.save();
    for (const pass of [0, 1]) {   // 0: the cooler body laid over; 1: the hot jet added on top
      g.globalCompositeOperation = pass ? "lighter" : "source-over";
      for (const p of plume) {
        const f = p.t / p.life;
        if ((f < 0.35) !== !!pass) continue;
        const x = sx(p.x), y = sy(p.y), r = (p.s0 + (p.s1 - p.s0) * Math.sqrt(f)) * 1.35;
        if (x < -r * 2 || y < -r * 2 || x > vw + r * 2 || y > vh + r * 2) continue;
        const sp = Math.hypot(p.vx, p.vy), st = Math.min(2.6, 1 + sp / 900), a = Math.atan2(p.vy, p.vx);
        const flick = 0.82 + 0.18 * Math.sin(p.wob + p.t * 45);
        g.save(); g.translate(x, y); g.rotate(a);
        if (p.c.own) {   // (a coloured flame: its glow)
          g.globalAlpha = Math.pow(1 - f, 1.5) * 0.35 * flick; const ci = f < 0.1 ? 0 : f < 0.25 ? 1 : f < 0.5 ? 2 : f < 0.78 ? 3 : 4;
          g.drawImage(dotSprite(p.c[ci]), -r * st, -r, r * 2 * st, r * 2);
        } else {
          // the shade: white-hot at the nozzle (blue-white on boost), then yellow, orange, red, dark
          const shade = Math.min(7, 2 + Math.floor(f * 6.5)), ramp = FIRE_RAMP;   // (torn off the jet's end: already orange, cooling to red)
          g.globalAlpha = (pass ? 0.3 * (1 - f / 0.35) : 0.38 * Math.pow(1 - (f - 0.35) / 0.65, 1.5)) * flick;
          g.drawImage(fireSprite(shade, (p.wob * 3) | 0, ramp), -r * st, -r, r * 2 * st, r * 2);
        }
        g.restore();
      }
    }
    g.restore();
  }
  // dash: a flash at the nozzle, sparks thrown back (no ring: it read as a circle round whoever dashed)
  function dashBurst(b) {
    const jet = exhaustJets({ ...b, thrust: Math.max(1, b.thrust || 0) }, performance.now()).sort((a, b) => b.power - a.power)[0];
    const A = jet.a - Math.PI, tx = jet.x, ty = jet.y;
    impacts.push({ x: tx, y: ty, t: 0, r: 90, col: "#ffd23f" });
    for (let k = 0; k < (lowQ ? 12 : 30); k++) {
      const a = A + Math.PI + (Math.random() - 0.5) * 0.9, v = 400 + Math.random() * 500;
      puff(tx, ty, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.25, 1.2 + Math.random(), k % 2 ? "#fff6c8" : "#ffb43c", 1);
    }
  }
  // a hurt bin smokes; on its last life it also throws sparks
  const damageOf = b => 1 - b.lives / LIVES;
