  // ---------- planet art: the disc on the body canvas; atmosphere and rings are drawn apart (they can't be shot) ----------
  function paintPlanet(b, R, kind, rnd) {
    const pal = PLANET_PAL[kind], q = b.q;
    q.save(); q.translate(b.hw, b.hh);
    q.beginPath(); q.arc(0, 0, R, 0, 6.29); q.clip();
    q.fillStyle = pal.base; q.fillRect(-R, -R, R * 2, R * 2);
    q.save(); q.rotate(b.tilt * 0.6);
    if (kind === "gas" || kind === "ice") {   // wavy cloud bands
      for (let k = 0; k < 14; k++) {
        const y = -R + (k + rnd(k)) * R * 2 / 14, th = R * (0.05 + rnd(k + 20) * 0.1);
        q.fillStyle = pal.bands[k % pal.bands.length]; q.globalAlpha = 0.45 + rnd(k + 30) * 0.4;
        q.beginPath();
        for (let x = -R; x <= R; x += R / 12) q.lineTo(x, y + Math.sin(x / R * 4 + rnd(k + 40) * 6) * R * 0.035);
        for (let x = R; x >= -R; x -= R / 12) q.lineTo(x, y + th + Math.sin(x / R * 3 + rnd(k + 45) * 6) * R * 0.035);
        q.fill();
      }
      q.globalAlpha = 1;
      if (kind === "gas") {
        q.fillStyle = "rgba(170,70,50,0.75)"; q.beginPath(); q.ellipse(R * (rnd(70) - 0.5), R * (rnd(71) * 0.6 - 0.1), R * 0.2, R * 0.1, 0, 0, 6.29); q.fill();
        q.fillStyle = "rgba(240,170,120,0.6)"; q.beginPath(); q.ellipse(R * (rnd(70) - 0.5), R * (rnd(71) * 0.6 - 0.1), R * 0.11, R * 0.05, 0, 0, 6.29); q.fill();
      } else {
        q.fillStyle = "rgba(255,255,255,0.85)";
        q.beginPath(); q.ellipse(0, -R * 0.95, R * 0.6, R * 0.25, 0, 0, 6.29); q.fill();
        q.beginPath(); q.ellipse(0, R * 0.97, R * 0.45, R * 0.18, 0, 0, 6.29); q.fill();
      }
    } else {   // rocky surface: blotches and craters (and rivers of lava)
      for (let k = 0; k < 26; k++) {
        q.fillStyle = pal.bands[k % pal.bands.length]; q.globalAlpha = 0.35;
        q.beginPath(); q.arc(R * (rnd(k) * 2 - 1), R * (rnd(k + 100) * 2 - 1), R * (0.1 + rnd(k + 200) * 0.3), 0, 6.29); q.fill();
      }
      q.globalAlpha = 1;
      for (let k = 0; k < 16; k++) {
        const x = R * (rnd(k + 300) * 1.8 - 0.9), y = R * (rnd(k + 400) * 1.8 - 0.9), cr = R * (0.04 + rnd(k + 500) * 0.11);
        q.fillStyle = "rgba(20,10,30,0.35)"; q.beginPath(); q.arc(x, y, cr, 0, 6.29); q.fill();
        q.strokeStyle = "rgba(255,255,255,0.18)"; q.lineWidth = cr * 0.25; q.beginPath(); q.arc(x - cr * 0.1, y - cr * 0.1, cr, 3.4, 5.6); q.stroke();
      }
      if (kind === "lava") {
        q.lineCap = "round"; q.lineJoin = "round";
        for (let k = 0; k < 9; k++) {
          let x = R * (rnd(k + 600) * 1.6 - 0.8), y = R * (rnd(k + 700) * 1.6 - 0.8), a = rnd(k + 800) * 6.28;
          q.beginPath(); q.moveTo(x, y);
          for (let j = 0; j < 7; j++) { a += (rnd(k * 10 + j + 900) - 0.5) * 1.6; x += Math.cos(a) * R * 0.13; y += Math.sin(a) * R * 0.13; q.lineTo(x, y); }
          q.strokeStyle = "rgba(255,90,30,0.55)"; q.lineWidth = R * 0.05; q.stroke();
          q.strokeStyle = "#ffc06a"; q.lineWidth = R * 0.015; q.stroke();
        }
      }
    }
    q.restore();
    const sg = q.createRadialGradient(-R * 0.45, -R * 0.45, R * 0.05, -R * 0.15, -R * 0.15, R * 1.4);
    sg.addColorStop(0, "rgba(255,255,255,0.22)"); sg.addColorStop(0.45, "rgba(0,0,0,0)"); sg.addColorStop(1, "rgba(8,4,24,0.85)");
    q.fillStyle = sg; q.fillRect(-R, -R, R * 2, R * 2);
    q.restore();
    // cells: the disc
    let m = 0;
    for (let j = 0; j < b.gh; j++) for (let i = 0; i < b.gw; i++) {
      if (((i + 0.5) * b.cs - b.hw) ** 2 + ((j + 0.5) * b.cs - b.hh) ** 2 < (R + b.cs * 0.2) ** 2) { b.cells[j * b.gw + i] = 1; m++; }
    }
    b.mass = b.mass0 = m;
    b.initialCells = b.cells.slice();
  }
  function paintRings(b, R, rnd) {
    const half = Math.ceil(R * 1.85), mk = front => {
      const c = document.createElement("canvas"); c.width = c.height = Math.ceil(half * 2 * BODY_RES);
      const q = c.getContext("2d"); q.scale(BODY_RES, BODY_RES); q.translate(half, half);
      q.rotate(b.tilt); q.scale(1, 0.3);
      q.beginPath(); q.rect(-half * 3, front ? 0 : -half * 6, half * 6, half * 6); q.clip();
      for (let k = 0; k < 7; k++) {
        q.strokeStyle = `rgba(${k % 2 ? "240,210,170" : "200,160,130"},${0.25 + rnd(k + 50) * 0.35})`;
        q.lineWidth = R * (0.03 + rnd(k + 60) * 0.05);
        q.beginPath(); q.arc(0, 0, R * (1.3 + k * 0.075), 0, 6.29); q.stroke();
      }
      return c;
    };
    b.ringB = mk(false); b.ringF = mk(true); b.ringHalf = half;
  }

  // ---------- wreck art: broken ship hulls, chunks of buildings, container stacks, station ring pieces ----------
  function bite(q, x, y, r, rnd, k0) {   // tear a ragged piece out
    q.save(); q.globalCompositeOperation = "destination-out"; q.beginPath();
    for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283, rr = r * (0.55 + rnd(k0 + k) * 0.6); q.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    q.closePath(); q.fill(); q.restore();
  }
  function scorch(q, x, y, r) {
    q.save(); q.globalCompositeOperation = "source-atop";
    const g2 = q.createRadialGradient(x, y, 0, x, y, r);
    g2.addColorStop(0, "rgba(20,12,16,0.75)"); g2.addColorStop(1, "rgba(20,12,16,0)");
    q.fillStyle = g2; q.beginPath(); q.arc(x, y, r, 0, 6.29); q.fill(); q.restore();
  }
  const rrectQ = (q, x, y, w, h, r) => { q.beginPath(); q.moveTo(x + r, y); q.arcTo(x + w, y, x + w, y + h, r); q.arcTo(x + w, y + h, x, y + h, r); q.arcTo(x, y + h, x, y, r); q.arcTo(x, y, x + w, y, r); q.closePath(); };
  function paintWreck(b, type, w, h, rnd) {
    const q = b.q, pal = WRECK_PAL[type];
    q.save(); q.translate((b.hw * 2 - w) / 2, (b.hh * 2 - h) / 2);
    if (type === "hull") {
      const g1 = q.createLinearGradient(0, 0, 0, h);
      g1.addColorStop(0, pal[2]); g1.addColorStop(0.5, pal[0]); g1.addColorStop(1, pal[1]);
      q.fillStyle = g1;
      q.beginPath(); q.moveTo(w * 0.02, h * 0.4); q.lineTo(w * 0.2, h * 0.1); q.lineTo(w * 0.88, h * 0.08); q.lineTo(w * 0.98, h * 0.28);
      q.lineTo(w * 0.98, h * 0.72); q.lineTo(w * 0.88, h * 0.92); q.lineTo(w * 0.2, h * 0.9); q.lineTo(w * 0.02, h * 0.6); q.closePath(); q.fill();
      q.strokeStyle = "rgba(20,24,40,0.45)"; q.lineWidth = 1.5;
      for (let k = 1; k < 8; k++) { const x = w * (0.2 + k * 0.088); q.beginPath(); q.moveTo(x, h * 0.1); q.lineTo(x, h * 0.9); q.stroke(); }
      q.beginPath(); q.moveTo(w * 0.2, h * 0.5); q.lineTo(w * 0.96, h * 0.5); q.stroke();
      q.fillStyle = rnd(1) < 0.5 ? "#ff8a3c" : "#4fd6c8"; q.fillRect(w * 0.22, h * 0.62, w * 0.66, h * 0.06);
      for (let k = 0; k < 14; k++) { q.fillStyle = rnd(k + 10) < 0.5 ? "#9ff3ff" : "#1a2236"; q.fillRect(w * (0.24 + k * 0.047), h * 0.27, w * 0.022, h * 0.08); }
      for (const yy of [0.22, 0.56]) { q.fillStyle = "#2a3044"; q.fillRect(w * 0.93, h * yy, w * 0.06, h * 0.2); }
      q.fillStyle = "rgba(20,24,40,0.6)"; q.beginPath(); q.moveTo(w * 0.02, h * 0.4); q.lineTo(w * 0.2, h * 0.1); q.lineTo(w * 0.2, h * 0.9); q.lineTo(w * 0.02, h * 0.6); q.fill();
      for (let k = 0; k < 5; k++) scorch(q, w * rnd(k + 30), h * rnd(k + 40), h * (0.2 + rnd(k + 50) * 0.3));
      bite(q, rnd(2) < 0.5 ? w * 0.06 : w * 0.95, h * (0.3 + rnd(3) * 0.4), h * 0.55, rnd, 60);
      bite(q, w * (0.3 + rnd(4) * 0.4), rnd(5) < 0.5 ? 0 : h, h * 0.35, rnd, 80);
    } else if (type === "tower") {
      q.fillStyle = pal[0];
      q.beginPath(); q.moveTo(0, h); q.lineTo(0, h * 0.12);
      for (let k = 0; k <= 8; k++) q.lineTo(w * k / 8, h * (0.04 + rnd(k) * 0.16));   // torn top edge
      q.lineTo(w, h); q.closePath(); q.fill();
      q.fillStyle = pal[1]; q.fillRect(0, h * 0.94, w, h * 0.06);
      const cols = 5, rows = 9;
      for (let r2 = 0; r2 < rows; r2++) for (let c2 = 0; c2 < cols; c2++) {
        const lit = rnd(r2 * 7 + c2 + 100);
        q.fillStyle = lit < 0.3 ? "#ffd27a" : lit < 0.45 ? "#9ff3ff" : "#2a2440";
        q.fillRect(w * (0.08 + c2 * 0.18), h * (0.24 + r2 * 0.08), w * 0.12, h * 0.05);
      }
      q.strokeStyle = "#5a5470"; q.lineWidth = 3;   // rebar sticking out of the break
      for (let k = 0; k < 6; k++) { const x = w * (0.1 + rnd(k + 200) * 0.8); q.beginPath(); q.moveTo(x, h * 0.18); q.lineTo(x + (rnd(k + 210) - 0.5) * 30, h * (0.02 + rnd(k + 220) * 0.08)); q.stroke(); }
      for (let k = 0; k < 4; k++) scorch(q, w * rnd(k + 30), h * rnd(k + 40), w * (0.2 + rnd(k + 50) * 0.3));
      bite(q, rnd(6) < 0.5 ? 0 : w, h * (0.4 + rnd(7) * 0.4), w * 0.35, rnd, 90);
    } else if (type === "crates") {
      for (let k = 0; k < 5; k++) {
        const cw = w * 0.42, ch = h * 0.24, x = w * (0.05 + rnd(k + 300) * 0.5), y = h * (0.05 + k * 0.18);
        q.save(); q.translate(x + cw / 2, y + ch / 2); q.rotate((rnd(k + 310) - 0.5) * 0.5);
        q.fillStyle = pal[k % pal.length]; q.fillRect(-cw / 2, -ch / 2, cw, ch);
        q.strokeStyle = "rgba(0,0,0,0.3)"; q.lineWidth = 2;
        for (let s = 1; s < 8; s++) { q.beginPath(); q.moveTo(-cw / 2 + cw * s / 8, -ch / 2); q.lineTo(-cw / 2 + cw * s / 8, ch / 2); q.stroke(); }
        q.strokeRect(-cw / 2, -ch / 2, cw, ch);
        q.restore();
      }
      for (let k = 0; k < 3; k++) scorch(q, w * rnd(k + 30), h * rnd(k + 40), w * 0.2);
    } else if (type === "skip") {   // a skip: a tapered steel container, ribbed sides, lifting lugs, rubbish heaped on top
      for (let k = 0; k < 9; k++) { q.fillStyle = ["#7a6a8a", "#4f8a5a", "#b05040", "#d8c8a0", "#5a6a9a"][k % 5]; q.beginPath(); q.arc(w * (0.12 + k * 0.095), h * (0.2 + rnd(k + 500) * 0.08), h * (0.1 + rnd(k + 510) * 0.08), 0, 6.29); q.fill(); }
      const g1 = q.createLinearGradient(0, 0, 0, h); g1.addColorStop(0, pal[2]); g1.addColorStop(1, pal[1]);
      q.fillStyle = g1; q.beginPath(); q.moveTo(0, h * 0.25); q.lineTo(w, h * 0.25); q.lineTo(w * 0.86, h * 0.95); q.lineTo(w * 0.14, h * 0.95); q.closePath(); q.fill();
      q.strokeStyle = "rgba(60,36,10,0.5)"; q.lineWidth = 3;
      for (let k = 1; k < 6; k++) { const x = w * (0.1 + k * 0.135); q.beginPath(); q.moveTo(x, h * 0.28); q.lineTo(x + (0.5 - k / 6) * w * 0.12, h * 0.92); q.stroke(); }
      q.fillStyle = "#4a3a20"; for (const x of [0.08, 0.92]) { q.beginPath(); q.arc(w * x, h * 0.45, h * 0.07, 0, 6.29); q.fill(); }
      q.fillStyle = "#222630"; q.fillRect(w * 0.12, h * 0.95, w * 0.76, h * 0.05);
      for (let k = 0; k < 3; k++) scorch(q, w * rnd(k + 30), h * (0.3 + rnd(k + 40) * 0.6), h * 0.3);
      bite(q, rnd(6) < 0.5 ? 0 : w, h * (0.5 + rnd(7) * 0.3), h * 0.35, rnd, 90);
    } else if (type === "truck") {   // a refuse truck: cab, compactor body with a green stripe, rear hopper, wheels
      const g1 = q.createLinearGradient(0, 0, 0, h); g1.addColorStop(0, "#ffffff"); g1.addColorStop(1, "#b8c2cc");
      q.fillStyle = g1; rrectQ(q, w * 0.24, h * 0.08, w * 0.62, h * 0.62, 10); q.fill();   // the body
      q.fillStyle = pal[1]; q.fillRect(w * 0.24, h * 0.44, w * 0.62, h * 0.1);   // the green stripe
      q.fillStyle = "#c8d0d8"; q.beginPath(); q.moveTo(w * 0.86, h * 0.12); q.lineTo(w * 0.99, h * 0.3); q.lineTo(w * 0.99, h * 0.7); q.lineTo(w * 0.86, h * 0.7); q.closePath(); q.fill();   // hopper
      q.fillStyle = "#e8eef4"; rrectQ(q, w * 0.02, h * 0.22, w * 0.22, h * 0.48, 12); q.fill();   // the cab
      q.fillStyle = "#9ff3ff"; rrectQ(q, w * 0.05, h * 0.27, w * 0.12, h * 0.17, 6); q.fill();   // its window
      q.fillStyle = "#ffb43c"; q.fillRect(w * 0.1, h * 0.17, w * 0.05, h * 0.05);   // beacon
      q.fillStyle = "#1e222c"; q.fillRect(w * 0.02, h * 0.7, w * 0.96, h * 0.08);
      for (const x of [0.13, 0.55, 0.75]) { q.fillStyle = "#1a1d26"; q.beginPath(); q.arc(w * x, h * 0.8, h * 0.15, 0, 6.29); q.fill(); q.fillStyle = "#8a93ad"; q.beginPath(); q.arc(w * x, h * 0.8, h * 0.06, 0, 6.29); q.fill(); }
      q.strokeStyle = "rgba(30,34,44,0.35)"; q.lineWidth = 2;
      for (let k = 1; k < 6; k++) { const x = w * (0.24 + k * 0.1); q.beginPath(); q.moveTo(x, h * 0.1); q.lineTo(x, h * 0.42); q.stroke(); }
      for (let k = 0; k < 4; k++) scorch(q, w * rnd(k + 30), h * rnd(k + 40), h * 0.3);
      bite(q, w * (0.3 + rnd(4) * 0.4), rnd(5) < 0.5 ? 0 : h, h * 0.35, rnd, 80);
    } else if (type === "wheelie") {   // a giant wheelie bin, its lid in one of the collection colours
      const lid = ["#3c78c0", "#3a7a4a", "#8a5a30", "#2a2a34", "#7a4a9a"][Math.floor(rnd(9) * 5)];
      const g1 = q.createLinearGradient(0, 0, w, 0); g1.addColorStop(0, "#2a2e3a"); g1.addColorStop(0.5, "#3e4454"); g1.addColorStop(1, "#262a34");
      q.fillStyle = g1; q.beginPath(); q.moveTo(w * 0.08, h * 0.16); q.lineTo(w * 0.92, h * 0.16); q.lineTo(w * 0.84, h * 0.9); q.lineTo(w * 0.16, h * 0.9); q.closePath(); q.fill();
      q.fillStyle = lid; rrectQ(q, w * 0.02, h * 0.06, w * 0.96, h * 0.12, 8); q.fill();
      q.fillStyle = "#1a1d26"; q.fillRect(w * 0.3, 0, w * 0.4, h * 0.07);   // the handle
      q.strokeStyle = "rgba(255,255,255,0.08)"; q.lineWidth = 3;
      for (let k = 1; k < 4; k++) { q.beginPath(); q.moveTo(w * (0.15 + k * 0.17), h * 0.22); q.lineTo(w * (0.18 + k * 0.16), h * 0.86); q.stroke(); }
      q.fillStyle = "#f2f2f2"; rrectQ(q, w * 0.34, h * 0.35, w * 0.32, h * 0.16, 6); q.fill();   // a label panel
      q.fillStyle = lid; q.font = `700 ${Math.round(h * 0.09)}px sans-serif`; q.textAlign = "center"; q.fillText("♻", w * 0.5, h * 0.47);
      for (const x of [0.22, 0.78]) { q.fillStyle = "#14161e"; q.beginPath(); q.arc(w * x, h * 0.92, h * 0.08, 0, 6.29); q.fill(); }
      for (let k = 0; k < 3; k++) scorch(q, w * rnd(k + 30), h * (0.2 + rnd(k + 40) * 0.6), w * 0.25);
      bite(q, rnd(6) < 0.5 ? 0 : w, h * (0.3 + rnd(7) * 0.5), w * 0.3, rnd, 90);
    } else if (type === "bales") {   // bales of crushed waste, mottled and strapped with wire
      for (let k = 0; k < 6; k++) {
        const bw = w * 0.46, bh = h * 0.3, x = w * (k % 2 ? 0.5 : 0.04) + (rnd(k + 600) - 0.5) * 10, y = h * (0.06 + Math.floor(k / 2) * 0.31);
        q.save(); q.translate(x + bw / 2, y + bh / 2); q.rotate((rnd(k + 610) - 0.5) * 0.25);
        q.fillStyle = pal[k % pal.length]; q.fillRect(-bw / 2, -bh / 2, bw, bh);
        for (let j = 0; j < 22; j++) { q.fillStyle = ["#d8c8a0", "#4f8a5a", "#b05040", "#5a6a9a", "#e8e0d0", "#3a3a44"][j % 6]; q.globalAlpha = 0.55; q.fillRect(-bw / 2 + rnd(k * 40 + j) * bw * 0.9, -bh / 2 + rnd(k * 40 + j + 20) * bh * 0.85, 6 + rnd(j + k) * 10, 4 + rnd(j * 3 + k) * 6); }
        q.globalAlpha = 1; q.strokeStyle = "#c8ccd4"; q.lineWidth = 2;
        for (const sx2 of [-0.25, 0.25]) { q.beginPath(); q.moveTo(bw * sx2, -bh / 2); q.lineTo(bw * sx2, bh / 2); q.stroke(); }
        q.restore();
      }
      for (let k = 0; k < 3; k++) scorch(q, w * rnd(k + 30), h * rnd(k + 40), w * 0.2);
    } else {   // a piece of a station ring
      q.save(); q.translate(w / 2, h * 1.35);
      const R1 = h * 1.3, R0 = h * 0.85, a0 = -Math.PI / 2 - 0.62, a1 = -Math.PI / 2 + 0.62;
      q.fillStyle = pal[0]; q.beginPath(); q.arc(0, 0, R1, a0, a1); q.arc(0, 0, R0, a1, a0, true); q.closePath(); q.fill();
      q.strokeStyle = pal[1]; q.lineWidth = 2;
      for (let k = 0; k <= 10; k++) { const a = a0 + (a1 - a0) * k / 10; q.beginPath(); q.moveTo(Math.cos(a) * R0, Math.sin(a) * R0); q.lineTo(Math.cos(a) * R1, Math.sin(a) * R1); q.stroke(); }
      for (let k = 0; k < 12; k++) { const a = a0 + (a1 - a0) * (k + 0.5) / 12; q.fillStyle = rnd(k + 400) < 0.6 ? "#9ff3ff" : "#1a2236"; q.beginPath(); q.arc(Math.cos(a) * (R0 + R1) / 2, Math.sin(a) * (R0 + R1) / 2, 4, 0, 6.29); q.fill(); }
      q.restore();
      for (let k = 0; k < 3; k++) scorch(q, w * rnd(k + 30), h * rnd(k + 40), h * 0.4);
      bite(q, rnd(8) < 0.5 ? w * 0.08 : w * 0.92, h * 0.5, h * 0.4, rnd, 120);
    }
    q.restore();
    shade(q, b.hw * 2, b.hh * 2);
    cellsFromArt(b);
  }

  const toLocal = (b, px, py) => { const dx = px - b.x, dy = py - b.y, c = Math.cos(b.a), s = Math.sin(b.a); return [dx * c + dy * s + b.hw, -dx * s + dy * c + b.hh]; };
  const toWorld = (b, lx, ly) => { const dx = lx - b.hw, dy = ly - b.hh, c = Math.cos(b.a), s = Math.sin(b.a); return [b.x + dx * c - dy * s, b.y + dx * s + dy * c]; };
