  function flyMe(dt, now, im, boost) {
    const braking = playing && !me.dead && keys.has("KeyX");
    if (me.ctl) me.ctl.brake = braking;   // (for the authoritative server)
    // X with a direction is a drift: the engine cuts, the bin slides on with its speed and the nose swings round
    // fast to where you push, so you can turn and shoot back the way you came. X alone is the air brake
    let drift = false, lit = false;
    if (serverRun && !srv.placed && playing) { me.vx = me.vy = 0; return; }   // waiting for the server to say where I am
    const wr = WALL_R, a0 = me.a, cmdMode = serverRun && srv.joined && playing && !me.dead;
    if (cmdMode) boost = !!me.boosting;
    if (playing && !me.dead) {
      // (in a command flight the facing turns after: the commands carry the aim this frame's shots went out with)
      const f = cmdMode ? flyCmds(dt, braking) : flyPilot(me, steer.x, steer.y, boost, braking, dt, now, me.boostFx > 0);
      if (cmdMode) faceMe(dt, me.drift);
      drift = f.drift; lit = !!f.lit;
      if (f.crash && f.crash.slide > 220 && f.crash.hs < 200 && Math.random() < 0.6) sparkShower(f.crash.x, f.crash.y, -f.crash.pc.ny * Math.sign(me.vx * -f.crash.pc.ny + me.vy * f.crash.pc.nx), f.crash.pc.nx * Math.sign(me.vx * -f.crash.pc.ny + me.vy * f.crash.pc.nx), 0.5);   // scraping along it
      if (f.crash && f.crash.hs > 60) {
        const { big, hs, x: cx, y: cy, pc } = f.crash;
        impact(cx, cy, "#ffd9b0", Math.min(2, (big ? 0.4 : 0.2) + hs / 450));
        if (hs > 300) { sparkShower(cx, cy, pc.nx, pc.ny, Math.min(1.6, hs / 600)); oilSplash(cx, cy, Math.min(14, hs / 50), Math.min(380, hs * 0.5), pc.nx * hs * 0.3, pc.ny * hs * 0.3); }
        sfx("crash", Math.min(1, (big ? 0.3 : 0.15) + hs / 700), big ? 0.8 : 1.2);
        if (f.crash.dmg > 0) hurt(now, f.crash.dmg); else shake = Math.max(shake, big ? 0.12 : 0.06);
      }
      if (f.rock) {   // a junk rock bumped in a command flight: the knock shows here (the rock's own fate is the server's)
        const { k, sp } = f.rock, dx = me.x - k.x, dy = me.y - k.y, d = Math.hypot(dx, dy) || 1;
        impact(k.x + dx / d * k.r, k.y + dy / d * k.r, "#d9c8ff", Math.min(1.5, sp / 300));
        sfx("crash", Math.min(0.7, sp / 800), 1.4);
      }
      if (f.fence) {
        const { hitSpeed, x: wx, y: wy } = f.fence;
        impact(wx, wy, "#bdfff6", Math.min(2, 0.4 + hitSpeed / 450));
        if (hitSpeed > 300) sparkShower(wx, wy, W / 2 - wx || (W / 2 - me.x), H / 2 - wy || (H / 2 - me.y), Math.min(1.6, hitSpeed / 600));
        sfx("crash", Math.min(1, 0.3 + hitSpeed / 700));
        if (f.fence.dmg > 0) hurt(now, f.fence.dmg); else shake = Math.max(shake, 0.12);
      }
      if (drift && Math.abs(angD(Math.atan2(me.vy, me.vx) - me.a)) > 0.6 && Math.random() < 50 * dt) {   // the hull scrubs sideways: smoke off both flanks
        const s = 26, nx = -Math.sin(me.a), ny = Math.cos(me.a), side = Math.random() < 0.5 ? 1 : -1;
        puff(me.x + nx * s * side, me.y + ny * s * side, nx * side * 60 + (Math.random() - 0.5) * 40, ny * side * 60 + (Math.random() - 0.5) * 40, 0.6, 3 + Math.random() * 3, "rgb(190,200,225)", 2);
      }
      if (braking && !drift && Math.hypot(me.vx, me.vy) > 60 && Math.random() < 40 * dt) {   // retro jets puffing out of the nose
        const fx = me.x + Math.cos(me.a) * 30, fy = me.y + Math.sin(me.a) * 30;
        puff(fx, fy, Math.cos(me.a) * 220 + me.vx, Math.sin(me.a) * 220 + me.vy, 0.35, 3 + Math.random() * 3, "#cfe8ff", 2);
      }
    } else {   // the start screen's idle drift, or a wreck waiting to respawn
      if (!playing) { me.vx = Math.cos(now / 2400) * 120; me.vy = Math.sin(now / 3100) * 90 - 40; }
      if (me.dead) { me.vx = me.vy = 0; } else gravityOn(me, dt);
      me.x += me.vx * dt; me.y += me.vy * dt;
      if (!me.dead) bounceOff(me, wr, 0.7, BIN_MASS);
      if (me.x < wr || me.x > W - wr) { me.x = clamp(me.x, wr, W - wr); me.vx = -me.vx * 0.7 + Math.sign(W / 2 - me.x) * 220; }
      if (me.y < wr || me.y > H - wr) { me.y = clamp(me.y, wr, H - wr); me.vy = -me.vy * 0.7 + Math.sign(H / 2 - me.y) * 220; }
    }
    me.drift = drift;
    if (!cmdMode) faceMe(dt, drift);
    const steerMag = Math.hypot(steer.x, steer.y);
    me.thrust += ((playing ? (drift ? 0 : Math.min(1, im)) * (boost ? 1.4 : 1) : 0.6) - me.thrust) * Math.min(1, dt * 6);
    if (playing && !drift && steerMag > 0.1) me.tdir = Math.atan2(steer.y, steer.x); else if (!playing) me.tdir = undefined;   // the way I push: the jets fire the other way
    // the bin banks into a turn (drawn as a lean), and settles back when flying straight
    const turn = dt > 0 ? angD(me.a - a0) / dt : 0;
    me.bank += (clamp(turn * 0.09, -0.4, 0.4) - me.bank) * Math.min(1, dt * 8);
    // lighting the boost gives a shove forward and a flash of exhaust (in a command flight the shove is in pilotMove)
    if (cmdMode ? lit : boost && !me.boostOn && playing && !me.dead) {
      audioCue("boost");
      if (!cmdMode) { me.vx += Math.cos(me.a) * 220; me.vy += Math.sin(me.a) * 220; }
      camKick.x -= Math.cos(me.a) * 10; camKick.y -= Math.sin(me.a) * 10;
      const jet = exhaustJets(me, now).sort((a, b) => b.power - a.power)[0];
      impacts.push({ x: jet.x, y: jet.y, t: 0, r: 42, col: "#9ff3ff", dur: 0.14 });   // (a short flick at the nozzle, not a white ball)
    }
    if (!cmdMode) me.boostOn = boost;
    // the camera leads the bin by up to ~a fifth of the screen in the direction it flies
    const lead = Math.min(vw, vh) * 0.2, sp2 = Math.hypot(me.vx, me.vy), lk = me.dead ? 0 : Math.min(1, sp2 / 900) * lead / (sp2 || 1);
    const ce = 1 - Math.exp(-2.5 * dt);
    const [mcx, mcy] = mouseAim() && playing && !me.dead ? cursorAt() : [vw / 2, vh / 2], lean = 0.22;   // mouse aim: the view leans toward the cursor
    cam.lx += (me.vx * lk + (mcx - vw / 2) * lean - cam.lx) * ce; cam.ly += (me.vy * lk + (mcy - vh / 2) * lean - cam.ly) * ce;
    if (guided || now < camBackUntil) {   // riding along with the guided nuke, then easing back to the bin
      const to = guided || me, ce2 = 1 - Math.exp(-(guided ? 10 : 6) * dt);
      cam.x += (to.x + (guided ? 0 : cam.lx) - cam.x) * ce2; cam.y += (to.y + (guided ? 0 : cam.ly) - cam.y) * ce2;
    } else { cam.x = me.x + srv.vox + cam.lx; cam.y = me.y + srv.voy + cam.ly; }   // (following the bin as drawn)
    // on boost the view pulls back a little (and eases in again after): speed you can feel
    const vzT = playing && !me.dead && boost ? 0.84 : 1;
    viewZoom += (vzT - viewZoom) * (1 - Math.exp(-(vzT < viewZoom ? 2.2 : 1.4) * dt));
    applyView();
    engineHum(Math.hypot(me.vx, me.vy), drift ? 0 : me.thrust, me.boostFx, now, playing && roundLive && !me.dead);
    if (!me.dead) { trailFrom(me, 0.6 + me.thrust * 1.6 + me.boostFx * 1.5, dt); if (playing) damageFx(me, dt); emitPlume(me, dt, me.boostFx > 0); }
  }
  // every shot in flight: homing, ricochets, digging into bodies, hitting me (I decide) or reaching others
  let ricAt = 0, whizAt = 0;
  // hitscan, as in Quake: the rail, the laser, the shock beam and lightning hit along their whole line at once, so the
  // damage lands with the beam you see, not when a fast slug would have got there. The rail bores through every body
  // to the fence (each bin on the line is hit once); the others stop at the first rock. The shot then spans that line
  // (px,py -> x,y) for one frame, so the usual hit checks (me, the others, my bots, orbs for a combo) see all of it.
  const HITSCAN = { [K.BULLET]: 1, [K.PISTOL]: 1, [K.RAIL]: 1, [K.SHOCK]: 1 };
