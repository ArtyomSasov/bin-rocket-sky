  function railBeam(s) {
    const {x, y, vx, vy} = s, v = Math.hypot(vx, vy) || 1, dx = vx / v, dy = vy / v, L = beamReach(s);
    beams.push({ x1: x, y1: y, x2: x + dx * L, y2: y + dy * L, t: 0 });
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
