  // ---- the teleporter: the first shot throws a beacon, the next one jumps you onto it; anyone sitting there is
  // telefragged (a stationary shot that kills whatever bin it overlaps, judged by the victim like any other hit)
  const TELEFRAG = { shot: [K.TFRAG, 0] };
  const myBeacon = () => shots.find(s => s.mine && s.kind === K.BEACON && s.life > 0);
  function teleport(now) {
    const b = myBeacon();
    b.life = 0;
    for (const [x, y] of [[me.x, me.y], [b.x, b.y]]) {
      rings.push({ x, y, t: 0, r: 160, col: "143,240,255", warp: true, dur: 0.4, w: 12 });
      for (let k = 0; k < 24; k++) { const a = Math.random() * 6.283, v = 100 + Math.random() * 300; puff(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.5, 2.5, k % 2 ? "#8ff0ff" : "#ffffff"); }
    }
    me.x = b.x; me.y = b.y; me.vx = me.vy = 0;
    volley(me, now, TELEFRAG, { x: b.x, y: b.y });
    me.vx = b.vx * 0.5; me.vy = b.vy * 0.5;
    audioCue("teleport");
    flash = Math.max(flash, 0.15);
    me.teleN = Math.max(0, (me.teleN || 0) - 1); renderTele();
  }
  // the teleporter is a tool, not a gun: T (or its button) throws the beacon, then jumps you onto it. A pick-up
  // gives three jumps; the gun in your hands stays where it is
  let teleCdUntil = 0;
  function useTele(now) {
    if (serverRun) {   // the server throws the beacon and makes the jump; my controls carry the press
      if (playing && !me.dead && now >= teleCdUntil && (me.teleN > 0 || shots.some(s => mySrvShot(s) && s.kind === K.BEACON && s.life > 0))) { srv.teleN++; teleCdUntil = now + 350; }
      return;
    }
    if (!playing || me.dead || guided || now < teleCdUntil) return;
    if (myBeacon()) { teleport(now); teleCdUntil = now + 350; return; }
    if (!(me.teleN > 0)) return;
    const w = WEAPONS.tele, muzzle = volley(me, now, w, muzzleAt("tele"));
    sfx(...w.sfx);
    shotFeel("tele", muzzle, w.kick, ...w.feel);
    teleCdUntil = now + 350;
  }
  function renderTele() {
    const n = me.teleN || 0, teleChip = document.getElementById("teleChip"), teleBtn = document.getElementById("teleBtn");
    teleChip.hidden = teleBtn.hidden = !playing || !n;
    teleChip.textContent = "TELEPORT ×" + n + (COARSE ? "" : " · T");
    teleBtn.lastChild.nodeValue = "×" + n;
  }
  document.getElementById("teleBtn").addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); useTele(performance.now()); });
