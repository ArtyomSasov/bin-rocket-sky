  // ---------- energy bar & mini map ----------
  const nrgFill = document.getElementById("nrgFill");
  let shownEnergy = -1;
  function renderEnergy() {
    const e = Math.round(energy);
    if (e !== shownEnergy) { shownEnergy = e; nrgFill.style.width = e + "%"; }
  }
  const mm = document.getElementById("minimap"), mctx = mm.getContext("2d");
  // on touch screens the joystick takes the bottom-left corner, so the map sits right under the score chip
  if (COARSE) {
    const scoreChip = document.querySelector(".score");
    new ResizeObserver(() => { mm.style.top = scoreChip.getBoundingClientRect().bottom + 8 + "px"; }).observe(scoreChip);
  }
  // the map shows only who is where: the pilots (and in CTF the pads and flags), nothing else to sort through
  function drawMinimap(now) {
    const S = mm.width, k = (S - 16) / W, o = 8;
    const P = (x, y) => [o + x * k, o + y * k];
    mctx.clearRect(0, 0, S, S);
    mctx.strokeStyle = "rgba(189,255,246,0.5)"; mctx.lineWidth = 2;
    mctx.strokeRect(o, o, W * k, H * k);
    // what your screen shows
    const [vx0, vy0] = P(cam.x - vw / 2, cam.y - vh / 2);
    mctx.strokeStyle = "rgba(255,255,255,0.25)"; mctx.lineWidth = 1.5;
    mctx.strokeRect(vx0, vy0, vw * k, vh * k);
    // the arena's shape: planets and wrecks as faint outlines
    mctx.fillStyle = "rgba(189,200,255,0.16)";
    for (const b of bodies) { if (b.dead || b.moon) continue; const [x, y] = P(b.x, b.y); mctx.beginPath(); mctx.arc(x, y, Math.max(2, (b.wreck ? b.rr * 0.7 : b.rr) * k), 0, 6.29); mctx.fill(); }
    for (const p of arena.pads) { const [x, y] = P(p.x, p.y); mctx.save(); mctx.translate(x, y); mctx.rotate(p.a); mctx.fillStyle = "rgba(125,255,216,0.85)"; mctx.beginPath(); mctx.moveTo(6, 0); mctx.lineTo(-4, -4); mctx.lineTo(-4, 4); mctx.closePath(); mctx.fill(); mctx.restore(); }
    // the arena's spots, so they can be learned: bright while something lies there, faint while it is taken
    const dot = (c, col, r) => { if (!c) return; const [x, y] = P(c.x, c.y); mctx.globalAlpha = grabbed.has(c.key) ? 0.25 : 0.9; mctx.fillStyle = col; mctx.fillRect(x - r, y - r, r * 2, r * 2); };
    for (const c of world.picks) dot(c, WEAPONS[c.type].col, 2.5);
    for (const c of world.supplies) dot(c, SUPPLIES[c.type].col, 2);
    dot(world.amp, "#5b9bff", 3);
    for (const [id, d] of gunDrops) if (!grabbed.has("W" + id)) { const [x, y] = P(d.x, d.y); mctx.globalAlpha = 0.9; mctx.fillStyle = "#ffd36b"; mctx.fillRect(x - 3, y - 3, 6, 6); }
    for (const c of world.bombs) dot(c, WEAPONS[c.type].col, 3.5);
    mctx.globalAlpha = 1;
    // other flyers
    for (const r of remotes.values()) {
      if (r.dead) continue;
      const [x, y] = P(r.x, r.y);
      mctx.fillStyle = isTeams() && onTeam(r) ? TEAM_HEX[r.tm] : `hsl(${r.hue} 90% 70%)`;
      mctx.beginPath(); mctx.arc(x, y, 4.5 + r.lv * 0.3, 0, 6.29); mctx.fill();
      if (r.lv >= MAX_LV) { mctx.strokeStyle = "#ffd36b"; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(x, y, 10 + Math.sin(now / 200) * 2, 0, 6.29); mctx.stroke(); }   // the crown: seen by all
    }
    if (bases) for (const t of [0, 1]) {   // pads and flags
      const [bx, by] = P(bases[t].x, bases[t].y), c = flagCarrier[t], [fx, fy] = c ? P(c.o.x, c.o.y) : [bx, by];
      mctx.strokeStyle = TEAM_HEX[t]; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(bx, by, 7, 0, 6.29); mctx.stroke();
      if (!c || Math.floor(now / 250) % 2) { mctx.fillStyle = TEAM_HEX[t]; mctx.fillRect(fx, fy - 9, 2, 10); mctx.fillRect(fx + 2, fy - 9, 7, 5); }
    }
    // you: an arrow pointing where you fly
    if (!me.dead) {
      const [x, y] = P(me.x, me.y);
      mctx.save(); mctx.translate(x, y); mctx.rotate(me.a);
      mctx.fillStyle = "#ffffff"; mctx.strokeStyle = "#10302d"; mctx.lineWidth = 1.5;
      mctx.beginPath(); mctx.moveTo(9, 0); mctx.lineTo(-6, -6); mctx.lineTo(-3, 0); mctx.lineTo(-6, 6); mctx.closePath(); mctx.fill(); mctx.stroke();
      mctx.restore();
    }
  }

