  function trailFrom(b, rate, dt) {
    const n = emissionCount(b, "trailParticles", rate * (lowQ ? 18 : 42) * Math.max(0.08, b.thrust || 0), dt);
    const jets = exhaustJets(b, performance.now());
    const tr = b.ck ? customVal(b.ck, "trail") : null, trailCols = tr ? TRAILS[tr] : TRAIL;
    for (let k = 0; k < n; k++) {
      const j = jets[k % jets.length], age = Math.random() * dt;
      puff(j.x - (b.vx || 0) * age, j.y - (b.vy || 0) * age,
        Math.cos(j.a) * 100 + (b.vx || 0) * 0.65, Math.sin(j.a) * 100 + (b.vy || 0) * 0.65,
        0.25 + Math.random() * 0.45, 1 + Math.random() * 1.5, trailCols[k % trailCols.length]);
    }
    // and a thin smoke behind a working engine, thicker on boost
    const boostOn = b === me ? me.boostFx > 0 : (b.boost || 0) > 0;
    for (let k = 0, m = emissionCount(b, "trailSmoke", (boostOn ? 26 : 7) * (lowQ ? 0.4 : 1) * Math.max(0.1, b.thrust || 0), dt); k < m; k++) {
      const j = jets[0], a = j.a + (Math.random() - 0.5) * 0.5, v = 60 + Math.random() * 80;
      puff(j.x, j.y, Math.cos(a) * v + (b.vx || 0) * 0.3, Math.sin(a) * v + (b.vy || 0) * 0.3, 0.9 + Math.random() * 0.9, 3 + Math.random() * (boostOn ? 6 : 3), boostOn ? SMOKE_COLS[1] : SMOKE_COLS[2], 2, 0, (Math.random() - 0.5) * 0.8, 0.95);
    }
  }

  const FIRE_COLS = ["#fff3b0", "#ffd23f", "#ff9a2e", "#ff5a1f"];
  const afterBlasts = [];   // the smaller blasts that follow a big one, each at its moment (updateFx)
  const scorches = [];      // burns left on a station's deck (drawn with its floor), kept for the round
  // A layered blast, scaled by speed (a rocket is 420) with n setting how rich it is (a rocket is 80):
  //  1. a short white flash, and warm light thrown on everything round it;
  //  2. a fireball of several billowing clouds that cool white, yellow, orange, red as they swell and fade;
  //  3. dark smoke, lit from inside by the fire at first, swelling and turning slowly for 1.5-3 s;
  //  4. sparks and embers slowed by drag, flying on curving paths;
  //  5. a thin bright shock ring;
  //  6. a few hot chips of wreckage.
  //  7. burning chunks flung out, each trailing fire and smoke.
  // pal "plasma": the same blast in energy (the shock orb and its combo): blue-white clouds, cold light, no smoke or chips
  const BLAST_PAL = {
    fire: { cloud: "fire", light: "255,176,96", sparks: SPARK_COLS, ember: "fire", ring: "255,246,230", dust: "rgb(150,138,142)", smoke: true },
    demon: { cloud: "demon", light: "110,255,120", sparks: ["#ff4a3c", "#9dff6a", "#ff2a3c"], ember: "demon", ring: "170,255,160", dust: "rgb(60,120,70)", smoke: false },
    plasma_green: { cloud: "demon", light: "150,255,90", sparks: ["#ffffff", "#d8ff9a", "#9dff5a"], ember: "demon", ring: "190,255,140", dust: "rgb(90,140,70)", smoke: false },
    hell: { cloud: "hell", light: "200,20,40", sparks: ["#ff2a3c", "#ff7a4a", "#3a0208"], ember: "hell", ring: "120,10,24", dust: "rgb(120,26,30)", smoke: false },
    plasma: { cloud: "plasma", light: "120,200,255", sparks: ["#ffffff", "#c8f4ff", "#7fdcff"], ember: "plasma", ring: "200,240,255", dust: "rgb(110,160,220)", smoke: false }
  };
  function explode(x, y, n, speed, pal = "fire") {
    const P = BLAST_PAL[pal] || BLAST_PAL.fire;
    const s = speed / 420, ss = Math.sqrt(s), nn = n / 80, q = lowQ ? 0.4 : COARSE ? 0.65 : 1;   // a phone: fewer pieces
    impacts.push({ x, y, t: 0, r: 34 + 50 * s, col: pal === "plasma" ? "#e8fbff" : "#fffbe8", dur: 0.1 });
    impacts.push({ x, y, t: 0, r: 320 * s, col: P.light, dur: 0.4, soft: 0.75 });
    if (n >= 26 && post) { const d = Math.hypot(x - me.x, y - me.y); if (d < 1400) post.kick(Math.min(1, n / 110) * (1 - d / 1400)); }   // the colours split a moment
    if (n >= 26 && pal === "fire") impacts.push({ x, y, t: -0.1, r: 230 * s, col: P.light, dur: 1.4, soft: 0.32, flick: Math.random() * 6.28 });   // the fuel burning on
    for (let k = 0, m = Math.min(40, Math.round((8 + 10 * nn) * q)); k < m; k++) {   // the fireball (or the ball of energy)
      const a = Math.random() * 6.28, rr = Math.random() * 30 * s, v = (60 + Math.random() * 260) * s;
      puff(x + Math.cos(a) * rr, y + Math.sin(a) * rr, Math.cos(a) * v, Math.sin(a) * v, (0.5 + Math.random() * 0.6) * ss,
        (18 + Math.random() * 20) * s, P.cloud, 4, 0, 0, 0.9, (k < 3 ? 0 : 0.12 + Math.random() * 0.25) + (P.smoke ? 0 : 0.25));   // only the first few start white-hot (energy: blue from the start)
    }
    if (P.smoke) for (let k = 0, m = Math.round((6 + 9 * nn) * q); k < m; k++) {   // smoke, lit by the fire inside it at first
      const a = Math.random() * 6.28, rr = Math.random() * 40 * s, v = (30 + Math.random() * 130) * s;
      puff(x + Math.cos(a) * rr, y + Math.sin(a) * rr, Math.cos(a) * v, Math.sin(a) * v, (1.5 + Math.random() * 1.5) * Math.min(1.6, ss),
        (9 + Math.random() * 8) * s, SMOKE_COLS[k % 3], 2, 0, 0, 0.95, 0.6 + Math.random() * 0.4);
    }
    for (let k = 0, m = Math.round((10 + 20 * nn) * q); k < m; k++) {   // sparks
      const a = Math.random() * 6.28, v = (400 + Math.random() * 800) * ss;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.35 + Math.random() * 0.5, 1.4 + Math.random() * 1.2, P.sparks[k % 3], 1, 0.05, (Math.random() - 0.5) * 3, 0.955);
    }
    for (let k = 0, m = Math.round((8 + 16 * nn) * q); k < m; k++) {   // embers
      const a = Math.random() * 6.28, v = (120 + Math.random() * 380) * ss;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.8 + Math.random() * 1.2, 1 + Math.random() * 1.1, P.ember, 5, 0, (Math.random() - 0.5) * 2.5, 0.965);
    }
    // the shock wave: a lens racing out that bends what is behind it, with a bright front (drawBlastFx), and a ring
    // of dust and smoke thrown out with it
    if (n >= 26) rings.push({ x, y, t: 0, r: 260 * s, col: P.ring, dur: 0.38 + 0.12 * ss, w: 3, shock: 26 * ss });   // (a small burst has no wave of its own)
    for (let k = 0, m = Math.round((14 + 10 * nn) * q); k < m; k++) {
      const a = k / m * 6.283 + Math.random() * 0.3, v = (520 + Math.random() * 160) * s;
      puff(x + Math.cos(a) * 12 * s, y + Math.sin(a) * 12 * s, Math.cos(a) * v, Math.sin(a) * v, 0.8 + Math.random() * 0.5, (7 + Math.random() * 5) * s, P.dust, 2, 0, 0, 0.88, P.smoke ? 0.5 : 0);
    }
    for (let k = 0, m = Math.round((5 + 4 * nn) * q); k < m; k++) {   // tongues of flame licking out in the first instant
      const a = Math.random() * 6.28, v = (500 + Math.random() * 500) * ss;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.22 + Math.random() * 0.18, (10 + Math.random() * 8) * s, P.cloud, 6, 0, (Math.random() - 0.5) * 2, 0.9, Math.random() * 0.2);
    }
    if (!P.smoke) return;
    if (n >= 26) {   // the fuel still going up: a few smaller blasts round it a moment later
      for (let k = 0, m = Math.round((2 + Math.random() * 2) * (lowQ ? 0.5 : 1)); k < m; k++) {
        const a = Math.random() * 6.28, d = (40 + Math.random() * 70) * s;
        afterBlasts.push({ at: performance.now() + 100 + Math.random() * 250, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, speed: (140 + Math.random() * 80) * s });
      }
    }
    for (let k = 0, m = n >= 26 ? Math.round((3 + 3 * nn) * q) : 0; k < m; k++) {   // burning chunks, trailing fire and smoke
      const a = Math.random() * 6.28, v = (280 + Math.random() * 420) * ss;
      puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.9 + Math.random() * 0.9, 2.2 + Math.random() * 1.5, "fire", 8, 0, (Math.random() - 0.5) * 1.6, 0.975);
    }
    if (n >= 26) for (let k = 0, m = Math.round((2 + 3 * nn) * q); k < m; k++) {
      const a = Math.random() * 6.28, v = (100 + Math.random() * 260) * ss;
      addDebris(x, y, Math.cos(a) * v, Math.sin(a) * v, 1.5 + Math.random() * 2.5, k % 2 ? "#3a3036" : "#5a4a44", 2.5 + Math.random() * 2);
    }
  }
