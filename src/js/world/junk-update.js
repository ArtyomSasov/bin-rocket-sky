  function chipRock(k, units, fromX, fromY) {
    const taken = (rockWear.get(k.key) || 0) + units;
    rockWear.set(k.key, taken);
    const a = Math.atan2(fromY - k.y, fromX - k.x);
    for (let j = 0; j < (lowQ ? 2 : 4); j++) {   // chips fly off the side that was hit
      const b = a + (Math.random() - 0.5) * 1.6, v = 80 + Math.random() * 180;
      addDebris(k.x + Math.cos(a) * k.r * 0.8, k.y + Math.sin(a) * k.r * 0.8, Math.cos(b) * v, Math.sin(b) * v, 2 + Math.random() * 3, j % 2 ? "#6d5a90" : "#8a76ad", 4 + Math.random() * 3);
    }
    smoke(k.x + Math.cos(a) * k.r * 0.7, k.y + Math.sin(a) * k.r * 0.7, lowQ ? 2 : 4, 50, 1);
    sfx("chunk", 0.35, 1.5, k.x, k.y);
    return taken >= rockHp(k);
  }
  function breakRock(k, mine) {
    grabbed.add(k.key); rockWear.delete(k.key);
    if (mine) { pushCapped(myGrabs, k.key, 40); me.score += 2; showScore(); floaters.push({ x: k.x, y: k.y, t: 0, txt: "+2", gold: false }); }
    const n = 3 + Math.floor(k.r / 15);   // it cracks into a few big chunks that drift apart, like a dead bin's wreckage
    for (let j = 0; j < n; j++) {
      const a = j / n * 6.283 + Math.random() * 0.6, v = 40 + Math.random() * 90;
      addDebris(k.x + Math.cos(a) * k.r * 0.4, k.y + Math.sin(a) * k.r * 0.4, Math.cos(a) * v, Math.sin(a) * v, k.r * (0.3 + Math.random() * 0.2), j % 2 ? "#6d5a90" : "#8a76ad", 18 + Math.random() * 8);
    }
    smoke(k.x, k.y, lowQ ? 4 : 10, 60, 1.6);
    impact(k.x, k.y, "#d9c8ff", 1.2);
    sfx("chunk", 0.7, 0.9, k.x, k.y);
  }
  function updateJunk(dt, now) {
    for (let i = 0; i < ROCKS; i++) {
      const k = world.rocks[i];
      if (grabbed.has(k.key) || k.age < 0.6) continue;
      for (const s of shots) {
        if (s.life <= 0 || SHOTS[s.kind].inert || !segHit(s, k.x, k.y, k.r + 10)) continue;
        if (pierces(s)) { if (!railOnce(s, k.key)) continue; } else s.life = 0;
        impact(s.x, s.y, "#d9c8ff", 0.8);
        if (chipRock(k, Math.max(0.5, shotDmg(s) / DMG_UNIT), s.px, s.py)) breakRock(k, s.mine);
        break;
      }
      if (grabbed.has(k.key) || !playing || me.dead || (serverRun && srv.placed)) continue;   // (a command flight meets the rocks in pilotMove)
      const speed = collideRock(me, k);
      if (speed > 0) {
        const dx = me.x - k.x, dy = me.y - k.y, d = Math.hypot(dx, dy);
        impact(k.x + dx / d * k.r, k.y + dy / d * k.r, "#d9c8ff", Math.min(1.5, speed / 300));
        sfx("crash", Math.min(0.7, speed / 800), 1.4);
        if (speed > 280 && chipRock(k, 1, me.x, me.y)) breakRock(k, true);
      }
    }
    if (rockWear.size > 200) for (const key of rockWear.keys()) if (!world.rocks.some(k => k.key === key)) rockWear.delete(key);
  }
  let firstRoundIdx = null;   // rounds are numbered from the one you joined
