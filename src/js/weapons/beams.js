  function railBeam(s) {
    const {x, y, vx, vy} = s, v = Math.hypot(vx, vy) || 1, dx = vx / v, dy = vy / v, L = beamReach(s), big = false;
    beams.push({ x1: x, y1: y, x2: x + dx * L, y2: y + dy * L, t: 0, big, cut: s.cut || 0 });
    if (beams.length > 12) beams.shift();
  }
  // the laser's look: each pulse lays a short-lived beam from the gun to where it stops; at 12 a second they
  // overlap into one shimmering beam, flaring and melting where it lands
  const lasers = [];
  const LASER_T = 0.32;   // (longer than a tick: a beam held on is one steady beam)
  function laserBeam(s, owner) {
    const v = Math.hypot(s.vx, s.vy) || 1, dx = s.vx / v, dy = s.vy / v;
    const e = { x: s.x, y: s.y, hit: s.beamHit };
    lasers.push({ x1: s.px, y1: s.py, x2: e.x, y2: e.y, t: 0, hit: e.hit, seed: s.kind === K.SHOCK ? Math.random() * 100 : [...(s.mine ? "me" : owner || "?")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) / 10, shock: s.kind === K.SHOCK, heat: Math.min(1, Math.max(0, ((s.m || 1) / (s.amp || 1) - LINK_MIN) / (LINK_HEAT - LINK_MIN))), who: (s.mine ? "me" : owner || "?") + (s.kind === K.SHOCK ? "s" + s.id : "") });
    if (lasers.length > 40) lasers.shift();
    if (e.hit && e.hit !== "wall" && onScreen(sx(e.x), sy(e.y), 60)) {
      for (let k = 0; k < (lowQ ? 1 : 3); k++) { const a = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 2.2, sp = 80 + Math.random() * 260; puff(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.25 + Math.random() * 0.25, 1.4 + Math.random() * 1.4, s.kind === K.SHOCK ? "#e4d2ff" : k % 2 ? "#bff9ff" : "#ffffff", 1, 0.05); }
      if (e.hit === "body" && Math.random() < 0.5) puff(e.x, e.y, (Math.random() - 0.5) * 30, -20 - Math.random() * 30, 0.6, 3 + Math.random() * 3, "rgb(255,140,60)", 1);   // the rock glows and melts
    }
  }
  // and it jumps on: up to two more enemies close to the one it hit, each taking a little less
  const CHAIN_R = 340, CHAIN_DMG = 0.14, CHAIN_JUMPS = 2;   // the laser: one jump, shorter and weaker
  function boltChain(s, hx, hy, hitId, now) {
    if (s.chained || s.kind === K.LASER) return; // Laser keeps tracking and Pulse; chaining belongs to Lightning.
    s.chained = true;
    const done = new Set([hitId]), laser = s.kind === K.LASER;
    let x = hx, y = hy;
    for (let j = 0; j < (laser ? 1 : CHAIN_JUMPS); j++) {
      let best = null, bd = laser ? 260 : CHAIN_R;
      const consider = (id, o) => { if (done.has(id) || !canHurt(s, o, id) || fixedCover(x, y, o.x, o.y)) return; const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = { id, o }; } };
      consider("me", me);
      for (const [id, r] of remotes) consider(id, r);
      if (!best) return;
      const t = best.o, a = Math.atan2(t.y - y, t.x - x);
      done.add(best.id);
      arcs.push({ x1: x, y1: y, x2: t.x, y2: t.y, t: 0 });
      impact(t.x, t.y, "#bfefff", 1);
      packPlay("p_hit_laser", 0.5, t.x, t.y);
      const dmg = (laser ? 0.1 : CHAIN_DMG * (1 - j * 0.25)) * (s.m || 1), cid = s.id + "c" + j;
      metricChild(s.id, cid);
      if (best.id === "me") { if (hurt(now, dmg, false, K.LASER, a)) { pushCapped(hitBy, cid, 12); if (me.dead) { meKilled(cid); killedBy(s.owner); } } }
      else if (botById.has(best.id)) botHurt(botById.get(best.id), dmg, cid, now, false, K.LASER, a);
      else if (s.mine) hitConfirm({ ...s, kind: K.LASER }, t.lv, t.x, t.y, t);
      x = t.x; y = t.y;
    }
  }
