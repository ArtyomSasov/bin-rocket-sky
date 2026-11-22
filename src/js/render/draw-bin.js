  // armour that grows with level, drawn in the art's own frame (P maps art pixels of the 320px sprite)
  function armorMat(lv) {
    if (lv >= 10) return { hi: "#fff1b8", lo: "#c98a1e", edge: "#7a4f08", glow: "255,215,120" };
    if (lv >= 7) return { hi: "#e3fbff", lo: "#3d8fc9", edge: "#1d3f73", glow: "120,220,255" };
    if (lv >= 5) return { hi: "#e2dcff", lo: "#5b54c9", edge: "#2c2670", glow: "170,150,255" };
    return { hi: "#eef2f8", lo: "#8a95ad", edge: "#4a5268", glow: null };
  }
  function metal(m, P, a, b) {
    const [x1, y1] = P(a[0], a[1]), [x2, y2] = P(b[0], b[1]);
    const gr = g.createLinearGradient(x1, y1, x2, y2);
    gr.addColorStop(0, m.hi); gr.addColorStop(1, m.lo);
    return gr;
  }
  function poly(P, pts) { g.beginPath(); pts.forEach(([px, py], i) => { const [x, y] = P(px, py); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); }
  function bolt(m, P, px, py, s) {
    const [x, y] = P(px, py), r = s * 0.02;
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, m.lo);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
  }
  function drawWings(lv, s) {
    if (lv < 4) return;
    const m = armorMat(lv), P = (px, py) => [(px / 320 - 0.5) * s, (py / 320 - 0.5) * s];
    g.lineWidth = s * 0.012; g.strokeStyle = m.edge;
    g.fillStyle = metal(m, P, [70, 110], [20, 150]);
    poly(P, [[74, 112], [lv >= 8 ? 4 : 20, 126], [lv >= 8 ? 26 : 38, 146], [74, 154]]); g.fill(); g.stroke();
    g.fillStyle = metal(m, P, [222, 132], [292, 178]);
    poly(P, [[220, 132], [lv >= 8 ? 312 : 294, 166], [lv >= 8 ? 286 : 272, 186], [220, 178]]); g.fill(); g.stroke();
  }
  function drawArmor(lv, s, now, crown) {
    if (lv < 2) return;
    const m = armorMat(lv), P = (px, py) => [(px / 320 - 0.5) * s, (py / 320 - 0.5) * s];
    g.lineJoin = "round";
    const glowEdge = () => { if (m.glow && !lowQ) { g.save(); g.strokeStyle = `rgba(${m.glow},0.35)`; g.lineWidth = s * 0.06; g.stroke(); g.restore(); } };
    if (lv >= 3) {
      // belly plate between the face and the engine rim
      g.fillStyle = metal(m, P, [140, 150], [140, 178]);
      g.strokeStyle = m.edge; g.lineWidth = s * 0.01;
      poly(P, [[64, 147], [224, 169], [222, 182], [64, 160]]); glowEdge(); g.fill(); g.stroke();
    }
    if (lv >= 6) {
      // trim along the lid's front edge
      g.strokeStyle = m.hi; g.lineWidth = s * 0.024; g.lineCap = "round";
      g.beginPath(); [[84, 77], [150, 87], [222, 97]].forEach(([px, py], i) => { const [x, y] = P(px, py); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    }
    if (lv >= 8) {
      // horns on the lid corners
      g.fillStyle = metal(m, P, [90, 60], [60, 30]); g.strokeStyle = m.edge; g.lineWidth = s * 0.01;
      poly(P, [[96, 48], [58, 26], [84, 70]]); glowEdge(); g.fill(); g.stroke();
      g.fillStyle = metal(m, P, [240, 60], [270, 30]);
      poly(P, [[236, 58], [276, 34], [250, 76]]); glowEdge(); g.fill(); g.stroke();
    }
    // bolts
    bolt(m, P, 76, 154, s); bolt(m, P, 212, 175, s);
    if (lv >= 3) bolt(m, P, 144, 165, s);
    if (lv >= 5) {
      // glowing antenna tips
      const pulse = 0.6 + 0.4 * Math.sin(now / 250);
      const glow = m.glow || "255,255,255";
      for (const [px, py] of [[128, 17], [232, 39]]) {
        const [x, y] = P(px, py), r = s * 0.09;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(${glow},${0.9 * pulse})`); gr.addColorStop(1, `rgba(${glow},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
      }
    }
    if (lv >= 10 && crown) {
      // crown on the lid
      const [cx0, cy0] = P(176, 30);
      g.save(); g.translate(cx0, cy0); g.rotate(0.13);
      const u = s * 0.012;
      const cg = g.createLinearGradient(0, -14 * u, 0, 4 * u);
      cg.addColorStop(0, "#fff6c8"); cg.addColorStop(1, "#d39a22");
      g.fillStyle = cg; g.strokeStyle = "#7a4f08"; g.lineWidth = u * 0.8;
      g.beginPath(); g.moveTo(-14 * u, 3 * u); g.lineTo(-16 * u, -10 * u); g.lineTo(-8 * u, -4 * u); g.lineTo(0, -15 * u);
      g.lineTo(8 * u, -4 * u); g.lineTo(16 * u, -10 * u); g.lineTo(14 * u, 3 * u); g.closePath(); g.fill(); g.stroke();
      for (const [gx, gc] of [[-8, "#ff5a6e"], [0, "#4fd6c8"], [8, "#c38bff"]]) { g.fillStyle = gc; g.beginPath(); g.arc(gx * u, -1 * u, 2.2 * u, 0, 6.29); g.fill(); }
      g.restore();
    }
  }

  function rainbowFlame(now) {
    const h = (now / 8) % 360;
    const c = (dh, sat, l) => hsl2rgb((h + dh) % 360, sat, l).map(Math.round);
    return { outer: c(0, 1, 0.55), mid: c(40, 1, 0.65), core: c(80, 1, 0.9) };
  }
  // hats sit on the lid in the art's frame (same anchor as the crown)
  function drawHat(hat, s, now) {
    const [cx0, cy0] = [(176 / 320 - 0.5) * s, (30 / 320 - 0.5) * s], u = s * 0.012;
    g.save(); g.translate(cx0, cy0); g.rotate(0.13);
    g.lineJoin = "round";
    if (hat === "party") {
      g.save(); g.beginPath(); g.moveTo(-12 * u, 2 * u); g.lineTo(0, -30 * u); g.lineTo(12 * u, 2 * u); g.closePath(); g.clip();
      for (let k = -2; k < 6; k++) { g.fillStyle = k % 2 ? "#ff6fd8" : "#ffe66b"; g.fillRect(-14 * u, (-30 + k * 7) * u, 28 * u, 7 * u); }
      g.restore();
      g.fillStyle = "#7df9ff"; g.beginPath(); g.arc(0, -31 * u, 4 * u, 0, 6.29); g.fill();
    } else if (hat === "tophat") {
      g.fillStyle = "#1d1630"; g.beginPath(); g.ellipse(0, 1 * u, 20 * u, 5 * u, 0, 0, 6.29); g.fill();
      g.fillRect(-12 * u, -22 * u, 24 * u, 23 * u);
      g.fillStyle = "#ff5a6e"; g.fillRect(-12 * u, -6 * u, 24 * u, 5 * u);
      g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(-9 * u, -21 * u, 4 * u, 14 * u);
    } else if (hat === "halo") {
      const bob = Math.sin(now / 400) * 2 * u;
      g.strokeStyle = "rgba(255,230,140,0.45)"; g.lineWidth = 7 * u;
      g.beginPath(); g.ellipse(0, -20 * u + bob, 17 * u, 5 * u, 0, 0, 6.29); g.stroke();
      g.strokeStyle = "#ffe9a3"; g.lineWidth = 3 * u;
      g.beginPath(); g.ellipse(0, -20 * u + bob, 17 * u, 5 * u, 0, 0, 6.29); g.stroke();
    } else if (hat === "bow") {
      g.translate(10 * u, -4 * u);
      g.fillStyle = "#ff6fae"; g.strokeStyle = "#b8326f"; g.lineWidth = 1.2 * u;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-13 * u, -8 * u); g.lineTo(-13 * u, 8 * u); g.closePath(); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(13 * u, -8 * u); g.lineTo(13 * u, 8 * u); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#ff9ccc"; g.beginPath(); g.arc(0, 0, 4 * u, 0, 6.29); g.fill(); g.stroke();
    } else if (hat === "hardhat") {   // a yellow site helmet
      g.fillStyle = "#ffc61a"; g.beginPath(); g.arc(0, 0, 15 * u, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = "#e0a400"; g.beginPath(); g.ellipse(0, 0, 21 * u, 4 * u, 0, 0, 6.29); g.fill();
      g.fillStyle = "#ffe27a"; g.fillRect(-2.5 * u, -15 * u, 5 * u, 15 * u);
      g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.ellipse(-6 * u, -8 * u, 3 * u, 5 * u, -0.5, 0, 6.29); g.fill();
    } else if (hat === "cone") {   // a traffic cone, white bands and all
      g.fillStyle = "#d8501a"; g.fillRect(-14 * u, -2 * u, 28 * u, 5 * u);
      g.fillStyle = "#ff6a1a"; g.beginPath(); g.moveTo(-11 * u, -1 * u); g.lineTo(-2 * u, -32 * u); g.lineTo(2 * u, -32 * u); g.lineTo(11 * u, -1 * u); g.closePath(); g.fill();
      g.fillStyle = "#f4f4f4";
      for (const [y0, y1] of [[-10, -6], [-21, -17]]) { const w0 = 11 - (-y0) * 0.28, w1 = 11 - (-y1) * 0.28; g.beginPath(); g.moveTo(-w0 * u, y0 * u); g.lineTo(-w1 * u, y1 * u); g.lineTo(w1 * u, y1 * u); g.lineTo(w0 * u, y0 * u); g.closePath(); g.fill(); }
    } else if (hat === "hivis") {   // a hi-vis beanie with a reflective band
      g.fillStyle = "#c8ff2a"; g.beginPath(); g.arc(0, 0, 15 * u, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = "#d8dde4"; g.fillRect(-15 * u, -5 * u, 30 * u, 4 * u);
      g.fillStyle = "#c8ff2a"; g.beginPath(); g.arc(0, -15 * u, 4 * u, 0, 6.29); g.fill();
    } else if (hat === "recycle") {   // three green recycling arrows chasing round above the lid
      g.translate(0, -18 * u); g.scale(1, 0.45); g.rotate(now / 700);
      g.fillStyle = "#3ad06a"; g.strokeStyle = "#1e7a40"; g.lineWidth = 1.2 * u;
      for (let k = 0; k < 3; k++) {
        g.rotate(Math.PI * 2 / 3);
        g.beginPath(); g.arc(0, 0, 17 * u, -0.3, 0.9); g.arc(0, 0, 11 * u, 0.9, -0.3, true); g.closePath(); g.fill(); g.stroke();
        const a = 0.9; g.beginPath(); g.moveTo(Math.cos(a) * 8 * u, Math.sin(a) * 8 * u); g.lineTo(Math.cos(a) * 20 * u, Math.sin(a) * 20 * u); g.lineTo(Math.cos(a + 0.45) * 14 * u, Math.sin(a + 0.45) * 14 * u); g.closePath(); g.fill(); g.stroke();
      }
    } else if (hat === "cap") {
      g.fillStyle = "#ff5a6e"; g.beginPath(); g.arc(0, 0, 14 * u, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = "#c8324a"; g.beginPath(); g.ellipse(12 * u, 0, 13 * u, 3.5 * u, 0, 0, 6.29); g.fill();
      g.fillStyle = "#ffffff"; g.beginPath(); g.arc(0, -14 * u, 2.5 * u, 0, 6.29); g.fill();
    }
    g.restore();
  }

  // soot and cracks, more as lives run out (art-pixel coordinates of the 320px sprite, away from the face)
  const SOOT = [[80, 166], [206, 182], [136, 54], [228, 122]];
  const CRACKS = [
    [[68, 118], [84, 128], [78, 140], [92, 152]],
    [[216, 148], [204, 160], [211, 171], [198, 183]],
    [[148, 44], [160, 55], [151, 64], [166, 73]]
  ];
  function drawDamage(dmg, s, now, seed) {
    if (dmg <= 0) return;
    const P = (px, py) => [(px / 320 - 0.5) * s, (py / 320 - 0.5) * s];
    for (let i = 0; i < Math.ceil(dmg * SOOT.length); i++) {
      const [x, y] = P(SOOT[i][0], SOOT[i][1]), r = s * 0.1;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(25,18,32,${0.25 + dmg * 0.35})`); gr.addColorStop(1, "rgba(25,18,32,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
    }
    const nCracks = dmg >= 0.6 ? 3 : dmg >= 0.3 ? 2 : 1;
    g.lineJoin = "round"; g.lineCap = "round";
    for (let i = 0; i < nCracks; i++) {
      g.beginPath(); CRACKS[i].forEach(([px, py], j) => { const [x, y] = P(px, py); j ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.strokeStyle = "rgba(25,18,32,0.75)"; g.lineWidth = s * 0.018; g.stroke();
      if (dmg >= 0.6) {   // last life: the cracks glow like embers
        g.strokeStyle = `rgba(255,140,50,${0.5 + 0.4 * Math.sin(now / 90 + seed + i)})`; g.lineWidth = s * 0.007; g.stroke();
      }
    }
  }

  // the weapon you carry is mounted on the wings, so everyone can see what is coming at them.
  // Drawn in art pixels; -y points the way the bin flies.
  let mountHeat = 0, barrelA = 0;   // my minigun's heat; its barrels' turn   (the blades are drawn on their own: drawBlade)
  function drawMounts(weapon, s, now) {
    if (!weapon) return;
    const u = s / 320, mounts = mountsOf(weapon);
    for (const [mx, my] of mounts) {
      g.save();
      g.translate((mx / 320 - 0.5) * s, (my / 320 - 0.5) * s);
      g.rotate(SPRITE_TILT); g.scale(u * 1.35, u * 1.35);
      if (weapon === "fire") {
        g.fillStyle = "#252c35"; rrect(-8, -9, 16, 23, 3); g.fill();
        const slide = g.createLinearGradient(-9, 0, 9, 0); slide.addColorStop(0, "#626d79"); slide.addColorStop(.5, "#dce4e9"); slide.addColorStop(1, "#687481");
        g.fillStyle = slide; rrect(-9, -43, 18, 38, 3); g.fill();
        g.fillStyle = "#111820"; g.fillRect(-5, -45, 10, 6);
        g.fillStyle = "#e9b45d"; g.fillRect(-2, -38, 4, 8);
      } else if (weapon === "laser") {
        const bg = g.createLinearGradient(-6, 0, 6, 0); bg.addColorStop(0, "#5a6684"); bg.addColorStop(0.5, "#dfe7f5"); bg.addColorStop(1, "#5a6684");
        g.fillStyle = bg; rrect(-6, -58, 12, 66, 5); g.fill();
        g.fillStyle = "#2a3550"; g.fillRect(-8, -10, 16, 12);
        const pulse = 0.6 + 0.4 * Math.sin(now / 120);
        const tg = g.createRadialGradient(0, -60, 0, 0, -60, 16);
        tg.addColorStop(0, `rgba(230,255,185,${pulse})`); tg.addColorStop(0.4, `rgba(145,255,75,${0.8 * pulse})`); tg.addColorStop(1, "rgba(145,255,75,0)");
        g.fillStyle = tg; g.beginPath(); g.arc(0, -60, 16, 0, 6.29); g.fill();
      } else if (weapon === "rocket") {
        g.fillStyle = "#3b2d5c"; rrect(-15, -26, 30, 40, 6); g.fill();
        for (const rx of [-7, 7]) {
          g.fillStyle = "#f4f1ff"; g.fillRect(rx - 4, -40, 8, 18);
          g.fillStyle = "#ff5a6e"; g.beginPath(); g.moveTo(rx - 4, -40); g.quadraticCurveTo(rx, -54, rx + 4, -40); g.fill();
        }
        g.fillStyle = "#ff5a6e"; g.fillRect(-15, -6, 30, 5);
      } else if (weapon === "scatter") {   // short double barrel with a wide flared muzzle
        g.fillStyle = "#3b2d5c"; rrect(-16, -8, 32, 16, 5); g.fill();
        for (const bx of [-7, 7]) {
          g.fillStyle = "#8a7fb0"; rrect(bx - 5, -34, 10, 30, 3); g.fill();
          g.fillStyle = "#ffd27a"; g.beginPath(); g.moveTo(bx - 5, -34); g.lineTo(bx - 8, -42); g.lineTo(bx + 8, -42); g.lineTo(bx + 5, -34); g.fill();
        }
      } else if (weapon === "rail") {   // long rail wrapped in glowing coils
        g.fillStyle = "#3b2d5c"; rrect(-10, -6, 20, 16, 4); g.fill();
        g.fillStyle = "#cfc6e8"; rrect(-4, -82, 8, 80, 3); g.fill();
        const pulse = 0.55 + 0.45 * Math.sin(now / 140);
        for (let c = 0; c < 4; c++) { g.fillStyle = `rgba(217,168,255,${0.5 + 0.5 * pulse})`; rrect(-9, -70 + c * 16, 18, 6, 3); g.fill(); }
        const tg = g.createRadialGradient(0, -84, 0, 0, -84, 14);
        tg.addColorStop(0, `rgba(255,255,255,${pulse})`); tg.addColorStop(1, "rgba(217,168,255,0)");
        g.fillStyle = tg; g.beginPath(); g.arc(0, -84, 14, 0, 6.29); g.fill();
      } else if (weapon === "mine") {   // a drum of mines with a blinking light
        g.fillStyle = "#3b2d5c"; rrect(-17, -30, 34, 40, 8); g.fill();
        for (const my of [-18, -2]) { g.fillStyle = "#6d5a8e"; g.beginPath(); g.arc(0, my, 8, 0, 6.29); g.fill(); }
        g.fillStyle = Math.floor(now / 300) % 2 ? "#ff6b3c" : "#5a2418"; g.beginPath(); g.arc(0, -36, 4, 0, 6.29); g.fill();
      } else if (weapon === "orb") {   // a ring emitter cradling a glowing sphere
        g.fillStyle = "#3b2d5c"; rrect(-13, -12, 26, 20, 6); g.fill();
        g.strokeStyle = "#8a7fb0"; g.lineWidth = 5; g.beginPath(); g.arc(0, -32, 15, 0, 6.29); g.stroke();
        const og = g.createRadialGradient(0, -32, 0, 0, -32, 14);
        og.addColorStop(0, "#ffffff"); og.addColorStop(0.5, `rgba(111,216,255,${0.7 + 0.3 * Math.sin(now / 120)})`); og.addColorStop(1, "rgba(111,216,255,0)");
        g.fillStyle = og; g.beginPath(); g.arc(0, -32, 14, 0, 6.29); g.fill();
      } else if (weapon === "bolt") {   // two prongs with an arc crackling between them
        g.fillStyle = "#3b2d5c"; rrect(-14, -10, 28, 18, 5); g.fill();
        g.fillStyle = "#cfc6e8"; rrect(-11, -58, 6, 50, 3); g.fill(); rrect(5, -58, 6, 50, 3); g.fill();
        g.strokeStyle = "#bfefff"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-8, -56);
        for (let k = 1; k < 5; k++) g.lineTo(-8 + k * 4, -56 + (Math.random() - 0.5) * 10);
        g.stroke();
      } else if (weapon === "shard") {   // a stubby cannon with glowing heat vents
        g.fillStyle = "#3b2d5c"; rrect(-15, -48, 30, 54, 7); g.fill();
        for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(255,154,60,${0.6 + 0.4 * Math.sin(now / 150 + k)})`; g.fillRect(-11, -38 + k * 11, 22, 4); }
        g.fillStyle = "#1d1630"; g.beginPath(); g.arc(0, -48, 9, 0, 6.29); g.fill();
      } else if (weapon === "triple") {
        for (const bx of [-11, 0, 11]) {
          g.fillStyle = "#6d5a8e"; rrect(bx - 3.5, -40, 7, 44, 3); g.fill();
          g.fillStyle = "#ffb43c"; g.fillRect(bx - 3.5, -42, 7, 5);
        }
        g.fillStyle = "#3b2d5c"; rrect(-17, -6, 34, 12, 4); g.fill();
      } else if (weapon === "nuke") {
        g.fillStyle = "#1d1630"; g.beginPath(); g.moveTo(-18, 12); g.lineTo(-10, -4); g.lineTo(10, -4); g.lineTo(18, 12); g.fill();
        g.save(); rrect(-11, -78, 22, 82, 9); g.clip();
        for (let i = -12; i < 4; i++) { g.fillStyle = i % 2 ? "#1d1630" : "#ffe14d"; g.beginPath(); g.moveTo(-12, i * 10); g.lineTo(12, i * 10 - 10); g.lineTo(12, i * 10); g.lineTo(-12, i * 10 + 10); g.fill(); }
        g.restore();
        g.fillStyle = "#1d1630"; g.beginPath(); g.moveTo(-11, -74); g.quadraticCurveTo(0, -98, 11, -74); g.fill();
        g.fillStyle = "#ffe14d"; g.save(); g.translate(-8, -46); g.scale(16 / 24, 16 / 24); g.fill(ICON_PATHS.nuke, "evenodd"); g.restore();
      } else if (weapon === "gamma") {   // a demonic orb mounted on the launcher
        g.fillStyle = "#3b2d5c"; rrect(-12, -20, 24, 26, 6); g.fill();
        drawDemonicOrb(0, -39, 18, now);
      } else if (weapon === "tele") {   // a little dish with a cyan tip
        g.fillStyle = "#3b2d5c"; rrect(-5, -24, 10, 28, 3); g.fill();
        g.fillStyle = "#5a6684"; g.beginPath(); g.ellipse(0, -28, 16, 6, 0, 0, 6.29); g.fill();
        g.fillStyle = "#8ff0ff"; g.beginPath(); g.arc(0, -38, 5 + Math.sin(now / 150), 0, 6.29); g.fill();
      } else if (weapon === "minigun") {   // a cluster of barrels that spins faster as it spins up
        g.fillStyle = "#3b2d5c"; rrect(-13, -14, 26, 20, 5); g.fill();
        const turn = barrelA;   // (spun up, the barrels blur into one)
        for (let k = 0; k < 6; k++) { const ph = turn + k * 1.047, off = Math.sin(ph) * 7, front = Math.cos(ph) > 0; if (!front) continue; g.fillStyle = k % 2 ? "#8a7fb0" : "#cfc6e8"; rrect(off - 2.5, -64, 5, 52, 2); g.fill(); }
        g.fillStyle = "#2a2140"; for (const yy of [-56, -38]) g.fillRect(-9, yy, 18, 3);   // the barrel clamps
        g.fillStyle = "#ffe08a"; g.fillRect(-9, -66, 18, 4);
        if (mountHeat > 0.05) {   // the barrels glow red-hot as it spins (and white-hot when it overheats)
          g.globalCompositeOperation = "lighter";
          const hg = g.createLinearGradient(0, -66, 0, -30); hg.addColorStop(0, `rgba(255,${me.overheat ? 230 : 90},40,${0.85 * mountHeat})`); hg.addColorStop(1, "rgba(255,60,20,0)");
          g.fillStyle = hg; rrect(-10, -66, 20, 36, 4); g.fill(); g.globalCompositeOperation = "source-over";
        }
      } else if (weapon === "gauss") {   // a long barrel in blue coils
        g.fillStyle = "#3b2d5c"; rrect(-10, -6, 20, 16, 4); g.fill();
        g.fillStyle = "#cfc6e8"; rrect(-4, -78, 8, 76, 3); g.fill();
        for (let k = 0; k < 4; k++) { g.fillStyle = `rgba(127,184,255,${0.5 + 0.5 * Math.sin(now / 120 + k)})`; rrect(-8, -66 + k * 15, 16, 7, 3); g.fill(); }
      } else if (weapon === "nail") {   // the nailgun: a squat block with a nail magazine on top and a short muzzle
        g.fillStyle = "#3b2d5c"; rrect(-13, -20, 26, 28, 5); g.fill();
        g.fillStyle = "#8a93ad"; rrect(-9, -30, 18, 10, 3); g.fill();
        for (let i = -2; i <= 2; i++) { g.fillStyle = "#e8eef8"; g.fillRect(i * 3.4 - 0.8, -28, 1.6, 7); }
        g.fillStyle = "#cfd6e2"; rrect(-4, -46, 8, 18, 2); g.fill();
      } else if (weapon === "gren") {   // the grenade launcher: a fat drum and a stubby wide tube
        g.fillStyle = "#3b2d5c"; rrect(-12, -10, 24, 18, 5); g.fill();
        g.fillStyle = "#4a7a3a"; g.beginPath(); g.arc(0, -16, 12, 0, 6.29); g.fill();
        g.fillStyle = "#26301e"; for (let i = 0; i < 6; i++) { const a = i * 1.047; g.beginPath(); g.arc(Math.cos(a) * 7, -16 + Math.sin(a) * 7, 2.4, 0, 6.29); g.fill(); }
        g.fillStyle = "#6b6f80"; rrect(-7, -44, 14, 18, 3); g.fill();
        g.fillStyle = "#8fd06a"; g.fillRect(-7, -44, 14, 3);
      } else if (weapon === "holy") {   // the golden orb held up on a short post, halo above
        g.fillStyle = "#3b2d5c"; rrect(-5, -26, 10, 30, 3); g.fill();
        const og = g.createRadialGradient(-5, -44, 2, 0, -40, 17);
        og.addColorStop(0, "#fffbe6"); og.addColorStop(0.5, "#ffd76a"); og.addColorStop(1, "#b07a1e");
        g.fillStyle = og; g.beginPath(); g.arc(0, -40, 17, 0, 6.29); g.fill();
        g.strokeStyle = "#fff3b0"; g.lineWidth = 4; g.beginPath(); g.ellipse(0, -68, 15, 5, 0, 0, 6.29); g.stroke();
      }
      g.restore();
    }
  }

