  // ---------- loop ----------
  let last = performance.now(), frameAvg = 1 / 60;
  const world = { sparks: [], rocks: [], picks: [], nuke: null, amp: null, supplies: [] };   // shared-clock objects, computed once per frame
  // once a second, also in a background tab: the network keeps adding effects and ids there while no frame runs
  setInterval(() => {
    const t = performance.now(), cap = (list, n) => { if (list.length > n) list.splice(0, list.length - n); };
    cap(parts, MAX_PARTS); cap(impacts, 120); cap(rings, 80); cap(floaters, 60); cap(arcs, 40); cap(beams, 12);
    for (const [k, at] of seenShots) if (t - at > 5000) seenShots.delete(k);
    grabbed.prune(120000);
    pruneNetwork(t);
    pruneRockMotion(clockNow());
    while (myDrops.length && Date.now() - myDrops[0][4] > DROP_LIFE) myDrops.shift();
  }, 1000);
  let resCheckAt = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
    if (raw < 0.25) {   // ignore pauses (tab switch)
      frameAvg += (raw - frameAvg) * 0.05;
      if (settings.fx === "low") lowQ = true;               // the player asked for light effects
      else if (!lowQ && frameAvg > 1 / 42) lowQ = true;     // under ~42 fps: lighten the load
      else if (lowQ && frameAvg < 1 / 56) lowQ = false;     // back above ~56 fps: full effects
      // dynamic resolution: below ~50 fps draw fewer pixels (down to 55%), and climb back once it runs smoothly
      if (settings.res === "auto" && now - resCheckAt > 1500) {
        resCheckAt = now;
        if (frameAvg > 1 / 50 && resScale > 0.55) { resScale = Math.max(0.55, resScale - 0.15); resize(); }
        else if (frameAvg < 1 / 58 && resScale < 1) { resScale = Math.min(1, resScale + 0.15); resize(); }
      }
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
    // a black hole drags the junk and the pick-ups in too; what it swallows is gone (on every screen alike)
    for (const o of [...world.sparks, ...world.rocks, ...world.picks, ...world.supplies, world.nuke, world.amp]) {
      if (o && !(o.slot !== undefined && rockMotion.has(o.slot)) && holePull(o, wt, 0) > 0.9) grabbed.add(o.key);
    }
    update(now < hitStopUntil ? 0 : dt, now); draw(now);
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
    // other flyers
    for (const r of remotes.values()) {
      if (r.dead) continue;
      const [x, y] = P(r.x, r.y);
      mctx.fillStyle = isTeams() && onTeam(r) ? TEAM_HEX[r.tm] : `hsl(${r.hue} 90% 70%)`;
      mctx.beginPath(); mctx.arc(x, y, 4.5 + r.lv * 0.3, 0, 6.29); mctx.fill();
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
    for (const [val, label, hint] of items) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = label;
      if (hint) { const s = document.createElement("small"); s.textContent = hint; b.append(s); }
      b.setAttribute("aria-pressed", String(val === current));
      b.addEventListener("click", () => { for (const o of el.children) o.setAttribute("aria-pressed", String(o === b)); onPick(val); });
      el.appendChild(b);
    }
  }
  segButtons(document.getElementById("botCount"), [[0, "No bots"], [2, "2 bots"], [4, "4 bots"], [6, "6 bots"]], botChoice.n, v => { botChoice.n = v; store.set("binrocket.bots", JSON.stringify(botChoice)); });
  segButtons(document.getElementById("botLevel"), Object.entries(BOT_LEVELS).map(([k, L]) => [k, L.label]), botChoice.level, v => { botChoice.level = v; store.set("binrocket.bots", JSON.stringify(botChoice)); });

