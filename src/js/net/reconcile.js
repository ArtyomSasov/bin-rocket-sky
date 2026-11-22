  function reconcile(m) {
    const ak = Number.isSafeInteger(m.ak) ? m.ak : 0;
    while (srv.cmds.length && srv.cmds[0].s <= ak) srv.cmds.shift();   // flown on the server: done with
    const o = { lv: me.lv, inv: 0 }; setMoveState(o, m.mv);
    replaying = true;
    try { for (const c of srv.cmds) { o.vx += c.kx || 0; o.vy += c.ky || 0; pilotMove(o, c); } } finally { replaying = false; }   // (recoil first, as it went)
    // the flight takes the corrected state exactly (so the next bounce off a wall is the server's bounce too); only
    // the picture glides there: the gap is drawn as an offset that fades (vox, voy), as Overwatch and Rocket League do
    const ex = o.x - me.x, ey = o.y - me.y;
    srv.lastErr = Math.hypot(ex, ey); srv.errN = (srv.errN || 0) + 1;
    if (srv.lastErr > 300) srv.vox = srv.voy = 0;   // a teleport or a respawn: at once
    else { srv.vox -= ex; srv.voy -= ey; }
    srv.cx = srv.cy = 0;
    for (const k of MOVE_STATE) me[k] = o[k];
    me.stick = o.stick; me.boostOn = me.boosting = o.boostOn; energy = me.energy;
  }
  // each frame, after my flight: ease in what is left of the last correction, and remember where I was
  function serverTrack(dt, now) {
    if (me.dead || !srv.joined) { srv.hist.length = 0; srv.cx = srv.cy = srv.vox = srv.voy = 0; return; }
    const k = 1 - Math.exp(-15 * dt);
    srv.vox -= srv.vox * k; srv.voy -= srv.voy * k;
    me.x += srv.cx * k; me.y += srv.cy * k; srv.cx -= srv.cx * k; srv.cy -= srv.cy * k;
    srv.hist.push({ t: now, x: me.x + srv.cx, y: me.y + srv.cy, vx: me.vx, vy: me.vy });
    while (srv.hist.length > 2 && now - srv.hist[0].t > 1500) srv.hist.shift();
  }
  // where my flight was predicted to be at time t (between two frames)
  function histAt(t) {
    const h = srv.hist;
    if (!h.length || t < h[0].t) return null;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= t) {
      const a = h[i], b = h[i + 1];
      if (!b) return { i, ...a };
      const f = (t - a.t) / (b.t - a.t || 1);
      return { i, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, vx: a.vx + (b.vx - a.vx) * f, vy: a.vy + (b.vy - a.vy) * f };
    }
    return null;
  }
