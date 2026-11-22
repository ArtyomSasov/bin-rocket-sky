  // a shot as it flies: its own look (SHOT_ART, BOMB_ART), the fireball for any other; Quad damage puts a halo round it
  const UNSEEN = new Set([K.PISTOL, K.SHOCK, K.DET, K.MELEE, K.SWORD]);   // beams are drawn as beams, a blade on its bin; a detonator is not seen
  function drawShot(s, x, y, now) {
    if (s.m >= QUAD) {   // Quad damage shots carry a violet-blue halo
      const hg = g.createRadialGradient(x, y, 0, x, y, 26);
      hg.addColorStop(0, "rgba(195,139,255,0.55)"); hg.addColorStop(1, "rgba(195,139,255,0)");
      g.fillStyle = hg; g.beginPath(); g.arc(x, y, 26, 0, 6.29); g.fill();
    }
    if (UNSEEN.has(s.kind)) return;
    const art = SHOT_ART[s.kind] || BOMB_ART[s.kind];
    if (art) { art(s, x, y, now); return; }
    drawFireball(s, x, y, now);
  }
  function drawFireball(s, x, y, now) {
    const fl = 1 + Math.sin(now / 28 + s.y) * 0.18;
    g.save(); g.translate(x, y); g.rotate(Math.atan2(s.vy, s.vx));
    const tail = g.createLinearGradient(-52 * fl, 0, 10, 0);
    tail.addColorStop(0, "rgba(255,50,20,0)"); tail.addColorStop(0.55, "rgba(255,110,30,0.75)"); tail.addColorStop(1, "rgba(255,225,110,0.95)");
    g.fillStyle = tail;
    g.beginPath(); g.moveTo(10, 0);
    g.quadraticCurveTo(-12, -12 * fl, -52 * fl, Math.sin(now / 40) * 3);
    g.quadraticCurveTo(-12, 12 * fl, 10, 0); g.fill();
    const halo = g.createRadialGradient(4, 0, 0, 4, 0, 36 * fl);   // the light it throws around itself
    halo.addColorStop(0, "rgba(255,170,60,0.45)"); halo.addColorStop(1, "rgba(255,90,30,0)");
    g.fillStyle = halo; g.beginPath(); g.arc(4, 0, 36 * fl, 0, 6.29); g.fill();
    for (let k = -1; k <= 1; k += 2) {   // two licking tongues of flame
      const w2 = Math.sin(now / 35 + k * 2 + s.x) * 5;
      g.fillStyle = "rgba(255,150,40,0.55)"; g.beginPath(); g.moveTo(6, k * 3);
      g.quadraticCurveTo(-14, k * (10 + w2), -34 * fl, k * (6 + w2)); g.quadraticCurveTo(-12, k * 2, 6, k * 3); g.fill();
    }
    const core = g.createRadialGradient(4, 0, 0, 4, 0, 17 * fl);
    core.addColorStop(0, "#fffbe6"); core.addColorStop(0.35, "#ffd23f"); core.addColorStop(0.7, "rgba(255,110,30,0.8)"); core.addColorStop(1, "rgba(255,60,20,0)");
    g.fillStyle = core; g.beginPath(); g.arc(4, 0, 17 * fl, 0, 6.29); g.fill();
    g.restore();
  }
