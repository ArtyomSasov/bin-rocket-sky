  function floorTile(st) {
    let c = floorCache.get(st);
    if (c) return c;
    const S = 192, [a, b2, seam] = st.floor;
    c = document.createElement("canvas"); c.width = c.height = S;
    const q = c.getContext("2d");
    q.fillStyle = a; q.fillRect(0, 0, S, S);
    if (st.style === "cargo") {   // the cargo deck: long plates, worn yellow lane paint, scuffs
      q.fillStyle = b2; for (let k = 0; k < 4; k++) q.fillRect(3, 3 + k * S / 4, S - 6, S / 4 - 6);
      q.fillStyle = "rgba(240,180,60,0.16)"; q.fillRect(0, S * 0.46, S, 7);
      q.fillStyle = "rgba(0,0,0,0.12)"; for (let k = 0; k < 9; k++) q.fillRect(hash(k, 1, 33) * S, hash(k, 2, 33) * S, 6 + hash(k, 3, 33) * 30, 2);
      q.strokeStyle = seam; q.lineWidth = 2; q.strokeRect(1, 1, S - 2, S - 2);
      q.fillStyle = "rgba(0,0,0,0.5)"; for (let k = 0; k < 4; k++) for (const x of [10, S - 10]) { q.beginPath(); q.arc(x, 10 + k * S / 4, 2.2, 0, 6.29); q.fill(); }
      floorCache.set(st, c); return c;
    }
    if (st.style === "hangar") {   // the hangar: wide smooth slabs, a dashed taxi line, tyre marks
      const gr = q.createLinearGradient(0, 0, S, S); gr.addColorStop(0, b2); gr.addColorStop(1, a);
      q.fillStyle = gr; q.fillRect(2, 2, S - 4, S - 4);
      q.fillStyle = "rgba(255,255,255,0.10)"; for (let k = 0; k < 6; k++) q.fillRect(k * 32 + 6, S - 18, 18, 4);
      q.strokeStyle = "rgba(0,0,0,0.18)"; q.lineWidth = 5; q.beginPath(); q.moveTo(20, 30); q.quadraticCurveTo(S * 0.6, 50, S - 10, S * 0.45); q.stroke();
      q.strokeStyle = seam; q.lineWidth = 2; q.strokeRect(1, 1, S - 2, S - 2);
      floorCache.set(st, c); return c;
    }
    if (st.style === "inlay") {   // the vault: polished dark tiles with a gold diamond set in each
      q.fillStyle = b2; for (const [x, y] of [[0, 0], [S / 2, 0], [0, S / 2], [S / 2, S / 2]]) q.fillRect(x + 2, y + 2, S / 2 - 4, S / 2 - 4);
      const sh = q.createLinearGradient(0, 0, S, S); sh.addColorStop(0, "rgba(255,255,255,0.07)"); sh.addColorStop(0.5, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(255,255,255,0.04)");
      q.fillStyle = sh; q.fillRect(0, 0, S, S);
      q.strokeStyle = "rgba(255,200,120,0.35)"; q.lineWidth = 1.5;
      for (const [x, y] of [[S / 4, S / 4], [S * 3 / 4, S / 4], [S / 4, S * 3 / 4], [S * 3 / 4, S * 3 / 4]]) { q.beginPath(); q.moveTo(x, y - 14); q.lineTo(x + 14, y); q.lineTo(x, y + 14); q.lineTo(x - 14, y); q.closePath(); q.stroke(); }
      q.strokeStyle = seam; q.lineWidth = 2; q.strokeRect(1, 1, S - 2, S - 2);
      floorCache.set(st, c); return c;
    }
    q.fillStyle = b2;   // four plates
    for (const [x, y] of [[0, 0], [S / 2, 0], [0, S / 2], [S / 2, S / 2]]) q.fillRect(x + 4, y + 4, S / 2 - 8, S / 2 - 8);
    q.strokeStyle = "rgba(255,255,255,0.05)"; q.lineWidth = 2;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {   // the tread: little raised dashes, alternately turned
      const x = 12 + i * 24, y = 12 + j * 24, d = (i + j) % 2 ? 1 : -1;
      q.beginPath(); q.moveTo(x - 5, y - 5 * d); q.lineTo(x + 5, y + 5 * d); q.stroke();
    }
    q.strokeStyle = seam; q.lineWidth = 2; q.strokeRect(1, 1, S - 2, S - 2);
    q.beginPath(); q.moveTo(S / 2, 0); q.lineTo(S / 2, S); q.moveTo(0, S / 2); q.lineTo(S, S / 2); q.stroke();
    q.fillStyle = "rgba(0,0,0,0.5)";
    for (const x of [8, S / 2 - 8, S / 2 + 8, S - 8]) for (const y of [8, S / 2 - 8, S / 2 + 8, S - 8]) { q.beginPath(); q.arc(x, y, 2.2, 0, 6.29); q.fill(); }
    floorCache.set(st, c);
    return c;
  }
  // a pool of oil, round (0, 0): dark red, lumpy at the edge, a spatter and spines ahead of a fast one, runs crawling
  // out, and a wet sheen on top (grow: how far it has spread)
  function drawStain(q, o, grow, tNow) {
    const r = o.r * grow;
    q.save(); q.rotate(o.rot);
    q.fillStyle = "rgba(48,3,7,0.86)"; q.beginPath(); q.ellipse(0, 0, r * o.sx, r, 0, 0, 6.29); q.fill();
    for (const [bx, by, br] of o.blobs) { q.beginPath(); q.arc(bx * grow, by * grow, br * grow, 0, 6.29); q.fill(); }
    for (const [d, off, rr] of o.spat) { q.beginPath(); q.arc(d * o.sx * grow, off, rr, 0, 6.29); q.fill(); }
    q.strokeStyle = "rgba(48,3,7,0.8)"; q.lineCap = "round";
    for (const [a, L, w] of o.spines || []) { q.lineWidth = w; q.beginPath(); q.moveTo(Math.cos(a) * r * o.sx * 0.8, Math.sin(a) * r * 0.8); q.lineTo(Math.cos(a) * L * o.sx * grow, Math.sin(a) * L * grow); q.stroke(); }
    for (const [a, L, w, T] of o.runs || []) {
      const k = Math.min(1, Math.sqrt((tNow - o.born) / T)), ex = Math.cos(a) * (r + L * k), ey = Math.sin(a) * (r + L * k);
      q.lineWidth = w * 2; q.beginPath(); q.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); q.quadraticCurveTo(ex * 0.6 + Math.sin(a * 3) * 4, ey * 0.6, ex, ey); q.stroke();
      q.beginPath(); q.arc(ex, ey, w * 1.4, 0, 6.29); q.fill();
    }
    q.fillStyle = "rgba(150,20,26,0.35)"; q.beginPath(); q.ellipse(-r * 0.25, -r * 0.2, r * o.sx * 0.5, r * 0.35, 0, 0, 6.29); q.fill();
    q.fillStyle = "rgba(255,200,200,0.14)"; q.beginPath(); q.ellipse(-r * 0.35, -r * 0.35, r * 0.22, r * 0.1, -0.4, 0, 6.29); q.fill();
    q.restore();
  }
  // a burn on the deck, round (0, 0): a dark blot with a ragged edge, embers in it glowing out over six seconds
  function drawBurn(q, b, age, now) {
    const r = b.r, gr = q.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, "rgba(8,6,6,0.75)"); gr.addColorStop(0.55, "rgba(12,9,8,0.5)"); gr.addColorStop(1, "rgba(12,9,8,0)");
    q.fillStyle = gr; q.beginPath();
    for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283, rr = r * (0.8 + 0.2 * Math.sin(b.seed + k * 2.3)); q.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    q.fill();
    if (age > 0 && age < 6) {
      q.globalCompositeOperation = "lighter"; q.globalAlpha = 0.6 * (1 - age / 6) * (0.8 + 0.2 * Math.sin(now / 90 + b.seed));
      for (let k = 0; k < 7; k++) { const a = b.seed + k * 0.9, d = r * (0.15 + 0.5 * ((k * 37 % 10) / 10)); q.drawImage(dotSprite(k % 2 ? "#ff7a26" : "#ffab3d"), Math.cos(a) * d - 6, Math.sin(a) * d - 6, 12, 12); }
      q.globalAlpha = 1; q.globalCompositeOperation = "source-over";
    }
  }
  // what makes a station live: in some cells a fan turning under a floor grate, breathing steam; along others, guide
  // lights running one after another the way the corridor goes (where each is: fixed by the cell, the same for everyone)
  function stationDecor(st, x, y, px, py, unit, now) {
    const h = hash(x, y, 515);
    if (h < 0.09) {
      const cx = px + unit / 2, cy = py + unit / 2, r = unit * 0.3, a = now / (300 + h * 2000) * (h < 0.045 ? 1 : -1);
      g.fillStyle = "rgba(0,0,0,0.55)"; g.beginPath(); g.arc(cx, cy, r, 0, 6.29); g.fill();
      const glow = g.createRadialGradient(cx, cy, 0, cx, cy, r); glow.addColorStop(0, st.accent[0] + "55"); glow.addColorStop(1, st.accent[0] + "00");
      g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, r, 0, 6.29); g.fill();
      g.fillStyle = "#11161b";
      for (let k = 0; k < 5; k++) { const b = a + k * 1.2566; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r * 0.9, b, b + 0.55); g.closePath(); g.fill(); }
      g.strokeStyle = st.wall[2] + "aa"; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r, 0, 6.29); g.stroke();
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 2; g.beginPath();
      for (let k = -2; k <= 2; k++) { g.moveTo(cx + k * r * 0.35, cy - r * 0.95); g.lineTo(cx + k * r * 0.35, cy + r * 0.95); }
      g.stroke();
      if (!lowQ && Math.random() < 0.06) puff((x + 0.5) * unit + (Math.random() - 0.5) * r, (y + 0.5) * unit + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 30, -20 - Math.random() * 30, 1.6, 6 + Math.random() * 6, "rgb(190,200,210)", 2, 0, 0, 0.97);
    } else if (h < 0.22) {
      const horiz = foundryOpen(x - 1, y) && foundryOpen(x + 1, y), n = 4;
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n, lx = horiz ? px + unit * f : px + unit / 2, ly = horiz ? py + unit / 2 : py + unit * f;
        const on = Math.max(0, Math.cos(((now / 140 - k - (horiz ? x : y) * n) % 12) / 12 * 6.283)) ** 6;
        g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(lx - 6, ly - 6, 12, 12);
        g.fillStyle = st.accent[1]; g.globalAlpha = 0.3 + 0.7 * on; g.fillRect(lx - 4, ly - 4, 8, 8);
        if (on > 0.2) { g.globalAlpha = on * 0.6; g.drawImage(dotSprite(st.accent[1]), lx - 24, ly - 24, 48, 48); }
      }
      g.globalAlpha = 1;
    }
  }
  function drawFoundry(now) {
    const st = station();
    if (st.space) paintSky(now); else { g.fillStyle = st.void; g.fillRect(0, 0, vw, vh); }   // (a station in open space: the sky round it)
    const unit = W / FOUNDRY_N, tile = floorTile(st), sh = unit * 0.16;
    for (let y = 1; y < 20; y++) for (let x = 1; x < 20; x++) {
      const px = sx(x * unit), py = sy(y * unit);
      if (!onScreen(px + unit / 2, py + unit / 2, unit)) continue;
      if (!foundryOpen(x, y)) {   // the deck under a wall shows where the wall is broken: darker, dusty
        g.drawImage(tile, px, py, unit + 0.5, unit + 0.5);
        g.fillStyle = "rgba(10,8,10,0.55)"; g.fillRect(px, py, unit + 0.5, unit + 0.5);
        continue;
      }
      if (st.space && st.space(x, y)) continue;   // open space: nothing laid there
      g.drawImage(tile, px, py, unit + 0.5, unit + 0.5);
      stationDecor(st, x, y, px, py, unit, now);
      // the walls cast a shadow on the floor next to them, and a strip of light runs along their foot
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (!foundryOpen(x + dx, y + dy)) {
        const ex = dx > 0 ? px + unit - sh : px, ey = dy > 0 ? py + unit - sh : py, ew = dx ? sh : unit, eh = dy ? sh : unit;
        const gr = g.createLinearGradient(dx > 0 ? px + unit : dx < 0 ? px : 0, dy > 0 ? py + unit : dy < 0 ? py : 0, dx > 0 ? px + unit - sh : dx < 0 ? px + sh : 0, dy > 0 ? py + unit - sh : dy < 0 ? py + sh : 0);
        gr.addColorStop(0, "rgba(0,0,0,0.62)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.fillRect(ex, ey, ew, eh);
        g.fillStyle = x < 10 ? st.accent[0] : st.accent[1]; g.globalAlpha = 0.55 + 0.1 * Math.sin(now / 900 + x + y);
        g.fillRect(dx ? (dx > 0 ? px + unit - sh * 0.55 : px + sh * 0.45) : px + unit * 0.3, dy ? (dy > 0 ? py + unit - sh * 0.55 : py + sh * 0.45) : py + unit * 0.3, dx ? 3 : unit * 0.4, dy ? 3 : unit * 0.4);
        g.globalAlpha = 1;
      }
    }
    // what has settled on the deck (finished pools and burns, chunks and cases come to rest) is baked into tiles
    // (decals): one picture per tile, however much has piled up; only what still moves or spreads is drawn piece by piece
    drawDecals();
    const tNow = performance.now();
    for (let i = oilStains.length - 1; i >= 0; i--) {
      const o = oilStains[i], done = tNow - o.born > o.settle;
      if (done) { bakeDecal(o.x, o.y, o.r * 6, q => drawStain(q, o, 1, tNow)); oilStains.splice(i, 1); continue; }
      const x = sx(o.x), y = sy(o.y);
      if (!onScreen(x, y, o.r * 4)) continue;
      g.save(); g.translate(x, y); drawStain(g, o, Math.min(1, 0.35 + (tNow - o.born) / 1500 * 0.65), tNow); g.restore();
    }
    for (let i = scorches.length - 1; i >= 0; i--) {
      const b = scorches[i], age = (now - b.born) / 1000;
      if (age >= 6) { bakeDecal(b.x, b.y, b.r, q => drawBurn(q, b, 0, 0)); scorches.splice(i, 1); continue; }
      const x = sx(b.x), y = sy(b.y);
      if (!onScreen(x, y, b.r)) continue;
      g.save(); g.translate(x, y); drawBurn(g, b, age, now); g.restore();
    }
    if (st.reactor) drawReactor(now, unit);
    if (st.lift) drawLift(now, unit);
    if (st.hangar) drawHangarPads(now, unit);
    if (st.vault) drawVaultDoor(now, unit);
    for (const [text, x, y, color] of st.labels) {
      const p = foundryPoint(x, y), px = sx(p.x), py = sy(p.y);
      if (!onScreen(px, py, unit * 2)) continue;
      g.save(); g.globalAlpha = 0.3; g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(px - unit * 0.9, py - unit * 0.7, unit * 1.8, unit * 1.4);
      g.fillStyle = color; g.font = "800 " + Math.max(18, unit * 0.15) + "px monospace"; g.textAlign = "center"; g.fillText(text, px, py + unit * 0.55); g.restore();
    }
  }
  // Foundry's walkable reactor hatch: a landmark beneath the contested Quad pickup
  function drawReactor(now, unit) {
    const reactor = foundryPoint(10, 10), rx = sx(reactor.x), ry = sy(reactor.y), radius = unit * 0.76;
    if (!onScreen(rx, ry, radius * 2)) return;
    g.save(); g.translate(rx, ry);
    const glow = g.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius * 1.65);
    glow.addColorStop(0, "#57dcbc26"); glow.addColorStop(1, "#57dcbc00");
    g.fillStyle = glow; g.fillRect(-radius * 1.65, -radius * 1.65, radius * 3.3, radius * 3.3);
    g.fillStyle = "#0a161f"; g.strokeStyle = "#46606c"; g.lineWidth = 9;
    g.beginPath(); g.arc(0, 0, radius, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = "#213a43"; g.lineWidth = 14;
    g.beginPath(); g.arc(0, 0, radius * 0.72, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      g.strokeStyle = i % 3 ? "#d7a650" : "#70e0c1"; g.lineWidth = 4;
      g.beginPath(); g.arc(0, 0, radius * 0.9, a, a + 0.22); g.stroke();
      g.strokeStyle = "#324a55"; g.lineWidth = 7;
      g.beginPath(); g.moveTo(Math.cos(a) * radius * 0.25, Math.sin(a) * radius * 0.25); g.lineTo(Math.cos(a) * radius * 0.62, Math.sin(a) * radius * 0.62); g.stroke();
    }
    g.strokeStyle = "rgba(104,239,201," + (0.4 + Math.sin(now / 1100) * 0.15) + ")"; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, radius * 0.52, 0, Math.PI * 2); g.stroke(); g.restore();
  }
  // Cargo Deck's freight lift in the middle of the hall: a hazard-edged platform with a blinking beacon at each corner
  function drawLift(now, unit) {
    const c = foundryPoint(10, 10), x = sx(c.x), y = sy(c.y), s = unit * 1.3;
    if (!onScreen(x, y, s * 2)) return;
    g.save(); g.translate(x, y);
    g.fillStyle = "rgba(0,0,0,0.45)"; g.fillRect(-s * 0.56, -s * 0.56, s * 1.12, s * 1.12);
    hazardBand(g, -s / 2, -s / 2, s, s * 0.07); hazardBand(g, -s / 2, s / 2 - s * 0.07, s, s * 0.07);
    hazardBand(g, -s / 2, -s / 2, s * 0.07, s); hazardBand(g, s / 2 - s * 0.07, -s / 2, s * 0.07, s);
    g.fillStyle = "#35302a"; g.fillRect(-s * 0.43, -s * 0.43, s * 0.86, s * 0.86);
    g.strokeStyle = "#4d453c"; g.lineWidth = 4;
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(-s * 0.43, k * s * 0.12); g.lineTo(s * 0.43, k * s * 0.12); g.stroke(); }
    const on = Math.sin(now / 300) > 0;
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.fillStyle = on === (cx === cy) ? "#ffb43c" : "#5a3a12";
      g.beginPath(); g.arc(cx * s * 0.47, cy * s * 0.47, s * 0.03, 0, 6.29); g.fill();
    }
    g.restore();
  }
  // Hangar: two landing circles painted on the bay floor, an H in each, and the yellow taxi lines between them
  function drawHangarPads(now, unit) {
    for (const [cx, cy] of [[7.5, 7.5], [13.5, 13.5]]) {
      const x = sx(cx * unit), y = sy(cy * unit), r = unit * 1.15;
      if (!onScreen(x, y, r * 1.5)) continue;
      g.save(); g.translate(x, y);
      g.strokeStyle = "rgba(255,211,77,0.55)"; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, r, 0, 6.29); g.stroke();
      g.setLineDash([24, 16]); g.lineWidth = 4; g.beginPath(); g.arc(0, 0, r * 0.78, 0, 6.29); g.stroke(); g.setLineDash([]);
      g.fillStyle = "rgba(255,211,77,0.45)"; const h = r * 0.5, w = r * 0.12;
      g.fillRect(-h * 0.6, -h, w, h * 2); g.fillRect(h * 0.6 - w, -h, w, h * 2); g.fillRect(-h * 0.6, -w / 2, h * 1.2, w);
      const on = Math.sin(now / 400 + cx) > 0;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.fillStyle = on === (k % 2 === 0) ? "#5ad1ff" : "#1d3a48"; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, unit * 0.035, 0, 6.29); g.fill(); }
      g.restore();
    }
    const a = sx(7.5 * unit), b = sy(7.5 * unit), c = sx(13.5 * unit), d = sy(13.5 * unit);
    g.save(); g.strokeStyle = "rgba(255,211,77,0.3)"; g.lineWidth = 6; g.setLineDash([40, 30]);
    g.beginPath(); g.moveTo(a, b); g.lineTo(c, b); g.lineTo(c, d); g.moveTo(a, b); g.lineTo(a, d); g.lineTo(c, d); g.stroke(); g.restore();
  }
  // Vault: the great round vault door set in the floor of the middle room, its bolts and a slowly turning wheel
  function drawVaultDoor(now, unit) {
    const p = foundryPoint(10, 10), x = sx(p.x), y = sy(p.y), r = unit * 1.05;
    if (!onScreen(x, y, r * 1.6)) return;
    g.save(); g.translate(x, y);
    const gr = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    gr.addColorStop(0, "#6b4a3a"); gr.addColorStop(0.7, "#3e2a24"); gr.addColorStop(1, "#22150f");
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 6.29); g.fill();
    g.strokeStyle = "#b07a4a"; g.lineWidth = 10; g.stroke();
    g.fillStyle = "#d8a060";
    for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; g.beginPath(); g.arc(Math.cos(a) * r * 0.88, Math.sin(a) * r * 0.88, unit * 0.04, 0, 6.29); g.fill(); }
    g.rotate(now / 6000);
    g.strokeStyle = "#c8925a"; g.lineWidth = 9;
    g.beginPath(); g.arc(0, 0, r * 0.42, 0, 6.29); g.stroke();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12); g.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62); g.stroke(); }
    g.fillStyle = "#ffcf8a"; g.beginPath(); g.arc(0, 0, r * 0.1, 0, 6.29); g.fill();
    g.restore();
  }

