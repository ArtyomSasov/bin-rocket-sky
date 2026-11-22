  // a new rail shot of mine: if the one before it hit nothing, the run of hits is over
  function railFired(id) { if (railLast && !railHits.has(railLast)) railRun = 0; railLast = id; if (railHits.size > 64) railHits.clear(); }
  const myRails = new Map(), myMelee = new Set();
  const pendingHitFx = new Map();
  function predictHit(s, id, r) {
    pendingHitFx.set(id + ":" + s.id, { s, at: performance.now(), lv: r.lv });
    if (pendingHitFx.size > 256) pendingHitFx.delete(pendingHitFx.keys().next().value);
  }
  function confirmShotHit(id, shotId, r) {
    const key = id + ":" + shotId, pending = pendingHitFx.get(key);
    if (!pending) return;
    pendingHitFx.delete(key);
    if (performance.now() - pending.at < 2000) hitConfirm(pending.s, pending.lv, r.x, r.y, r);
  }
  function killStyle(k, victim) {
    if (k.includes(".ram") || myMelee.has(k)) { setTimeout(() => announce("HUMILIATION", "rammed " + victim.name, "#ff8a5a", 3), 1400); return; }
    const r = myRails.get(k);
    if (r && r.charged && Math.hypot(victim.x - r.x, victim.y - r.y) > (r.cut ? 800 : 1200)) setTimeout(() => announce("HEADSHOT", "a charged rail kill from afar", "#d9a8ff", 3), 1400);
  }
  function hitConfirm(s, lv, x, y, target) {
    const t0 = performance.now();
    // Impressive, as Quake 3 gives it: two rail hits in a row, a miss in between starting the count again (a shot that
    // pierces two pilots counts once). On the server the shot is the one shown here (its id), offline my own
    if (s.mine && s.kind === K.RAIL && !railHits.has(s.id)) { railHits.add(s.id); if (++railRun >= 2) announce("IMPRESSIVE", railRun + " rail hits in a row", "#d9a8ff", 2); }
    if (target) target.hitAt = t0;
    if (s.mine && shotDmg(s) >= 0.9) hitStopUntil = Math.max(hitStopUntil, t0 + (s.kind === K.RAIL ? 70 : 45));   // a heavy hit lands: the world stops for a beat
    if (!s.mine) return;
    const pct = Math.max(1, Math.round(shotDmg(s) / maxLivesOf(lv || 1) * 100));
    floaters.push({ x: x + (Math.random() - 0.5) * 30, y: y - 40, t: 0, txt: "-" + pct + "%", hit: true, col: SHOTS[s.kind].col, big: pct >= 40 });
    const t = performance.now();
    if (t - hitTickAt > 60) { hitTickAt = t; sfx("hit", 0.4, 1.8); }
  }
  function pelletShove(o, s, f = 150) { const v = Math.hypot(s.vx, s.vy) || 1; o.vx += s.vx / v * f; o.vy += s.vy / v * f; }
  // one volley from any pilot, me or a bot: the shots go out, get logged for the network, and the last one is returned
  // (muzzle effects start from it). pat: a weapon or its alt (shot, spread, back); from: the gun's muzzle, if known
  // mul: extra damage (a charge, Quad damage), sent with the shot
  const FIRE_TWIN = { ...WEAPONS.fire, spread: [-0.05, 0.05] };
  // a gun's random spread follows from whose shot it is and its number, not from Math.random: the server's copy of a
  // player's shot then flies exactly where that player's screen showed it (12c-server.js learns the server's numbers)
  const tagSeed = t => { let h = 7; for (let i = 0; i < t.length; i++) h = Math.imul(h, 31) + t.charCodeAt(i) | 0; return h; };
  const shotJitter = (tag, n, j) => (hash(tagSeed(String(tag || "")), n, 991) - 0.5) * 2 * j;
