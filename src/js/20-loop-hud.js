  // ---------- loop ----------
  let last = performance.now(), frameAvg = 1 / 60;
  const world = { sparks: [], rocks: [], picks: [], nuke: null, amp: null, supplies: [] };   // shared-clock objects, computed once per frame
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
    if (raw < 0.25) {   // ignore pauses (tab switch)
      frameAvg += (raw - frameAvg) * 0.05;
      if (!lowQ && frameAvg > 1 / 42) lowQ = true;          // under ~42 fps: lighten the load
      else if (lowQ && frameAvg < 1 / 56) lowQ = false;     // back above ~56 fps: full effects
    }
    const wt = clockNow();
    for (let i = 0; i < SLOTS; i++) world.sparks[i] = spark(i, wt);
    for (let i = 0; i < ROCKS; i++) world.rocks[i] = rock(i, wt);
    const solo = !!MODES[MODE].only;
    world.picks.length = solo ? 0 : PICKS;
    for (let i = 0; i < world.picks.length; i++) world.picks[i] = pickup(i, wt);
    world.nuke = solo ? null : nukePickup(wt);
    world.amp = solo ? null : ampPickup(wt);
    world.supplies.length = MODES[MODE].noSupplies ? 0 : SUPPLY_SLOTS;
    roundTick(now);
    for (let i = 0; i < world.supplies.length; i++) world.supplies[i] = supply(i, wt);
    update(dt, now); draw(now);
    if (!playing) drawPreview(now);
    else { drawMinimap(now); renderEnergy(); }
  }
  requestAnimationFrame(frame);

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
  function drawMinimap(now) {
    const S = mm.width, k = (S - 16) / W, o = 8;
    const P = (x, y) => [o + x * k, o + y * k];
    mctx.clearRect(0, 0, S, S);
    mctx.strokeStyle = "rgba(189,255,246,0.5)"; mctx.lineWidth = 2;
    mctx.strokeRect(o, o, W * k, H * k);
    for (const b of bodies) {
      if (b.free && b.mass < 60) continue;
      const [x, y] = P(b.x, b.y), sz = Math.max(2, b.rr * k * Math.sqrt(b.mass / b.mass0));
      mctx.fillStyle = b.planet ? `rgba(${PLANET_PAL[b.kind].glow},0.45)` : "rgba(200,190,220,0.4)";
      if (b.wreck || b.free) mctx.fillRect(x - sz * 0.7, y - sz * 0.7, sz * 1.4, sz * 1.4);
      else { mctx.beginPath(); mctx.arc(x, y, sz, 0, 6.29); mctx.fill(); }
    }
    // what your screen shows
    const [vx0, vy0] = P(cam.x - vw / 2, cam.y - vh / 2);
    mctx.strokeStyle = "rgba(255,255,255,0.25)"; mctx.lineWidth = 1.5;
    mctx.strokeRect(vx0, vy0, vw * k, vh * k);
    // weapon crates
    const wt = clockNow();
    world.picks.forEach((c, i) => {
      if (!grabbed.has(c.key)) { const [x, y] = P(c.x, c.y); mctx.fillStyle = WEAPONS[c.type].col; mctx.fillRect(x - 3, y - 3, 6, 6); return; }
      const nx = pickup(i, wt + (1 - c.age) * PICK_PERIOD * 1000 + 50), [x, y] = P(nx.x, nx.y);   // taken: show where the next one lands
      mctx.strokeStyle = WEAPONS[nx.type].col; mctx.globalAlpha = 0.55; mctx.lineWidth = 1;
      mctx.strokeRect(x - 2.5, y - 2.5, 5, 5);
      mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(x, y, 5.5, -1.57, -1.57 + c.age * 6.283); mctx.stroke();
      mctx.globalAlpha = 1;
    });
    for (const c of world.supplies) {
      if (grabbed.has(c.key)) continue;
      const [x, y] = P(c.x, c.y), sp = SUPPLIES[c.type];
      mctx.fillStyle = sp.col;
      if (sp.heal) { mctx.fillRect(x - 1.5, y - 4.5, 3, 9); mctx.fillRect(x - 4.5, y - 1.5, 9, 3); }
      else { mctx.beginPath(); mctx.arc(x, y, 3.5, 0, 6.29); mctx.fill(); }
    }
    if (world.amp && !grabbed.has(world.amp.key) && Math.floor(now / 250) % 2) {
      const [x, y] = P(world.amp.x, world.amp.y);
      mctx.fillStyle = "#c38bff"; mctx.beginPath(); mctx.moveTo(x, y - 7); mctx.lineTo(x + 5, y); mctx.lineTo(x, y + 7); mctx.lineTo(x - 5, y); mctx.closePath(); mctx.fill();
    }
    if (world.nuke && !grabbed.has(world.nuke.key) && Math.floor(now / 250) % 2) {
      const [x, y] = P(world.nuke.x, world.nuke.y);
      mctx.fillStyle = "#ffe14d"; mctx.beginPath(); mctx.moveTo(x, y - 8); mctx.lineTo(x + 7, y + 5); mctx.lineTo(x - 7, y + 5); mctx.closePath(); mctx.fill();
    }
    // event hazards
    const ev = eventAt(clockNow());
    if (ev.active && ev.type === "blackhole") {
      const bh = blackHole(ev), [x, y] = P(bh.x, bh.y);
      mctx.fillStyle = `rgba(195,139,255,${0.5 + 0.3 * Math.sin(now / 200)})`;
      mctx.beginPath(); mctx.arc(x, y, 9 * bh.k + 2, 0, 6.29); mctx.fill();
      mctx.fillStyle = "#05010c"; mctx.beginPath(); mctx.arc(x, y, 4 * bh.k, 0, 6.29); mctx.fill();
    }
    if (ev.active && ev.type === "aliens") for (let u = 0; u < UFO_N; u++) {
      if (grabbed.has("e" + ev.cyc + "u" + u)) continue;
      const p = ufoPos(ev, u, ev.et), [x, y] = P(p.x, p.y);
      mctx.fillStyle = "#7dffb0"; mctx.beginPath(); mctx.ellipse(x, y, 6, 3, 0, 0, 6.29); mctx.fill();
    }
    // other flyers
    for (const r of remotes.values()) {
      if (r.dead) continue;
      const [x, y] = P(r.x, r.y);
      mctx.fillStyle = isTeams() && onTeam(r) ? TEAM_HEX[r.tm] : `hsl(${r.hue} 90% 70%)`;
      mctx.beginPath(); mctx.arc(x, y, 4 + r.lv * 0.3, 0, 6.29); mctx.fill();
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

  // ---------- bot picker ----------
  const botChoice = (() => { try { const v = JSON.parse(store.get("binrocket.bots")); if (v && [0, 2, 4, 6].includes(v.n) && BOT_LEVELS[v.level]) return v; } catch {} return { n: 0, level: "normal" }; })();
  function segButtons(el, items, current, onPick) {
    for (const [val, label] of items) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = label;
      b.setAttribute("aria-pressed", String(val === current));
      b.addEventListener("click", () => { for (const o of el.children) o.setAttribute("aria-pressed", String(o === b)); onPick(val); });
      el.appendChild(b);
    }
  }
  segButtons(document.getElementById("botCount"), [[0, "No bots"], [2, "2 bots"], [4, "4 bots"], [6, "6 bots"]], botChoice.n, v => { botChoice.n = v; store.set("binrocket.bots", JSON.stringify(botChoice)); });
  segButtons(document.getElementById("botLevel"), Object.entries(BOT_LEVELS).map(([k, L]) => [k, L.label]), botChoice.level, v => { botChoice.level = v; store.set("binrocket.bots", JSON.stringify(botChoice)); });

