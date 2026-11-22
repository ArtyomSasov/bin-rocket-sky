  // ---------- oil: a bin's blood ----------
  // A hit splashes it out in dark glossy drops; a bin badly hurt leaks it. A drop that lands on a station's deck leaves
  // a stain there (a leaking bin a trail), kept for the round; in space the drops fly on and thin out
  // ---------- brass: a minigun's spent cases ----------
  // thrown out to the right of the gun as it fires, tumbling, clinking off walls; on a deck they skid and lie there for
  // the round (the oldest go once there are too many), in space they drift away
  const casings = [];
  function ejectCasing(x, y, a, vx = 0, vy = 0) {
    const side = a + Math.PI / 2 + (Math.random() - 0.5) * 0.6, v = 160 + Math.random() * 160;
    casings.push({ x: x - Math.cos(a) * 30, y: y - Math.sin(a) * 30, vx: Math.cos(side) * v + vx * 0.6, vy: Math.sin(side) * v + vy * 0.6, a: Math.random() * 6.28, spin: (Math.random() - 0.5) * 40, t: 0, life: stationMap() ? Infinity : 6 });
    if (casings.length > 260) casings.shift();
  }
  function updateCasings(dt) {
    const deck = stationMap(), drag = Math.exp(-(deck ? 3 : 0.1) * dt);
    for (let i = casings.length - 1; i >= 0; i--) {
      const c = casings[i]; c.t += dt;
      if (c.t > c.life) { casings.splice(i, 1); continue; }
      const ox = c.x, oy = c.y;
      c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= drag; c.vy *= drag; c.spin *= Math.exp(-(deck ? 3 : 0.2) * dt); c.a += c.spin * dt;
      if (solidCell(c.x, c.y) && bounceSmall(c, ox, oy, 0.4) && Math.hypot(c.vx, c.vy) > 60 && Math.random() < 0.3) sfx("hit", 0.08, 3.2, c.x, c.y);   // a clink
      if (deck && Math.abs(c.vx) + Math.abs(c.vy) < 4 && c.t > 1.5) {   // lying still on the deck: baked into it
        bakeDecal(c.x, c.y, 6, q => { q.rotate(c.a); q.fillStyle = "#c9962e"; q.fillRect(-3.5, -1.4, 7, 2.8); q.fillStyle = "#ffe08a"; q.fillRect(-3.5, -1.4, 7, 1); q.fillStyle = "#7a5718"; q.fillRect(2.6, -1.6, 1.2, 3.2); });
        casings.splice(i, 1);
      }
    }
  }
  function drawCasings() {
    for (const c of casings) {
      const x = sx(c.x), y = sy(c.y);
      if (!onScreen(x, y, 10)) continue;
      g.save(); g.translate(x, y); g.rotate(c.a); g.globalAlpha = c.life === Infinity ? 1 : Math.min(1, (c.life - c.t) * 2);
      g.fillStyle = "#c9962e"; g.fillRect(-3.5, -1.4, 7, 2.8); g.fillStyle = "#ffe08a"; g.fillRect(-3.5, -1.4, 7, 1); g.fillStyle = "#7a5718"; g.fillRect(2.6, -1.6, 1.2, 3.2);
      g.restore();
    }
    g.globalAlpha = 1;
  }
