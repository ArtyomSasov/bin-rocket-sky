  // ---------- the modes' own goals: King of the Hill, Last Bin Standing, Juggernaut ----------
  // ---------- king of the hill ----------
  // One hill, a ring where the Quad damage lies. A pilot alone on it (no living enemy inside) holds it: every HOLD_S
  // seconds held without a break scores a hold (its caps, as CTF's captures are, so every screen sees the count). Each
  // screen judges its own pilot and its bots, the server its pilots, as every pick-up is judged
  let hill = null;   // { x, y, r } on the map being played
  const HOLD_S = 5, HILL_R = 300;
  const placeHill = () => { hill = MODES[MODE].hill && arena.amp ? { x: arena.amp.x, y: arena.amp.y, r: HILL_R } : null; };
  const onHill = o => !o.dead && Math.hypot(o.x - hill.x, o.y - hill.y) < hill.r;
  // who is on the hill now: the pilots inside it, as this screen sees them
  function hillPilots() {
    const on = [];
    if (playing && onHill(me)) on.push(me);
    for (const [id, r] of remotes) if (!botById.has(id) && onHill(r)) on.push(r);
    for (const b of bots) if (onHill(b)) on.push(b);
    return on;
  }
  let hillHolder = null;   // the one holding it now (for its drawing), or null: nobody or a fight on it
  function hillTick(dt, now) {
    hillHolder = null;
    if (!hill) return;
    const on = hillPilots();
    if (on.length === 1) hillHolder = on[0];
    const actors = [];
    if (roundLive && playing && !serverRun) actors.push(me);   // (on the server, the server holds my hill)
    if (roundLive) actors.push(...bots);
    for (const o of actors) {
      if (o !== hillHolder) { o.hillT = 0; continue; }
      o.hillT = (o.hillT || 0) + dt;
      if (o.hillT < HOLD_S) continue;
      o.hillT -= HOLD_S; o.caps = (o.caps || 0) + 1;
      if (o === me) { me.score += 5; showScore(); floaters.push({ x: me.x, y: me.y - 70, t: 0, txt: "HOLD +1", gold: true }); sfx("p_pickup", 0.6, 1.2); }
    }
  }
  // the hill: a wide ring on the ground, its colour who holds it (white: nobody, a pilot's own hue, red flicker: a
  // fight on it); mine fills round as my hold builds
  function drawHill(now) {
    if (!hill) return;
    const x = sx(hill.x), y = sy(hill.y), R = hill.r;
    if (!onScreen(x, y, R + 40)) return;
    const fight = !hillHolder && hillPilots().length > 1, col = hillHolder ? (hillHolder === me ? "79,214,200" : "255,211,107") : fight ? "255,90,110" : "255,255,255";
    g.save();
    g.globalCompositeOperation = "lighter";
    const gr = g.createRadialGradient(x, y, R * 0.6, x, y, R);
    gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(1, `rgba(${col},${fight && Math.floor(now / 180) % 2 ? 0.08 : 0.16})`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, 6.29); g.fill();
    g.globalCompositeOperation = "source-over";
    g.strokeStyle = `rgba(${col},0.8)`; g.lineWidth = 4; g.setLineDash([22, 14]); g.lineDashOffset = now / 60;
    g.beginPath(); g.arc(x, y, R, 0, 6.29); g.stroke(); g.setLineDash([]);
    if (hillHolder === me && me.hillT > 0) {   // my hold, filling round
      g.strokeStyle = "rgba(79,214,200,0.95)"; g.lineWidth = 9; g.lineCap = "round";
      g.beginPath(); g.arc(x, y, R - 10, -Math.PI / 2, -Math.PI / 2 + 6.283 * me.hillT / HOLD_S); g.stroke();
    }
    g.restore();
  }
  // ---------- last bin standing ----------
  // Nobody comes back while two or more still fly: the fallen wait. When one is left, it has won the heat (a win, as
  // its caps) and the fallen come back a moment later for the next. Each screen judges its own pilot and bots, the
  // server its pilots (players' among them), from the pilots it sees
  function standingTick(now) {
    if (!MODES[MODE].lastStanding || !roundLive) return;
    const all = bots.slice();
    if (playing) all.push(me);
    for (const [id, r] of remotes) if (!botById.has(id)) all.push(r);
    if (all.length < 2) return;
    const actors = bots.slice();
    if (playing && !serverRun) actors.push(me);   // (on the server, the server decides for my pilot)
    if (all.filter(o => !o.dead).length >= 2) { for (const o of actors) o.heatWon = false; return; }
    for (const o of actors) {
      if (!o.dead && !o.heatWon) {   // the last one standing
        o.heatWon = true; o.caps = (o.caps || 0) + 1; o.lives = LIVES;
        if (o === me) { me.score += 10; showScore(); renderHearts(false); announce("LAST BIN STANDING", "you win the heat", "#ffd36b", 2); }
      }
      if (o.dead && !Number.isFinite(o.respawnAt)) o.respawnAt = now + 2500;   // the next heat
    }
  }
  // ---------- juggernaut ----------
  // The Quad damage makes its taker the Juggernaut until it dies (no other Quad comes while it lives; one is back on its
  // spot JUG_PERIOD after). Every HOLD_S seconds as the Juggernaut scores a point (its caps), judged as the hill is
  const juggernaut = now => {
    if (playing && !me.dead && amped(me, now)) return me;
    for (const b of bots) if (!b.dead && amped(b, now)) return b;
    for (const r of remotes.values()) if (!r.dead && r.amp) return r;
    return null;
  };
  function juggernautTick(dt, now) {
    if (!MODES[MODE].juggernaut || !roundLive) return;
    const actors = bots.slice();
    if (playing && !serverRun) actors.push(me);
    for (const o of actors) {
      if (o.dead || !amped(o, now)) { o.jugT = 0; continue; }
      o.jugT = (o.jugT || 0) + dt;
      if (o.jugT < HOLD_S) continue;
      o.jugT -= HOLD_S; o.caps = (o.caps || 0) + 1;
      if (o === me) { me.score += 5; showScore(); floaters.push({ x: me.x, y: me.y - 70, t: 0, txt: "JUGGERNAUT +1", gold: true }); }
    }
  }
