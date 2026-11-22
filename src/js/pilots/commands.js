  // ---- a player's flight as numbered commands, as Quake 3, Source and Overwatch fly it ----
  // A command is the controls for one fixed slice of flight (CMD_DT): the stick, the facing, boost, brake and the dash
  // count. The player's screen flies each one the moment it makes it, and sends it; the server flies the very same
  // one, once, with the same function and slice. The server then says where the pilot is after its last command,
  // and the screen flies the commands the server has not had yet again from there (reconcile in 12c-server.js): only
  // what really differs (a hit, a bump into something that moved) is left to correct. Its timers run on its own
  // command clock (mt), so both sides count them alike whenever the commands arrive.
  const CMD_DT = 1 / 60;
  let replaying = false;   // flying commands again from the server's word: no effects, nothing else pushed
  // the moving bodies near o (moons, wrecks) put where they were at t; returns what to put back
  function bodiesAt(t, o) {
    let out = null;
    for (const b of det) {
      if (b.free || b.dead || b.fixed || !(b.moon || b.wreck)) continue;
      if ((b.x - o.x) ** 2 + (b.y - o.y) ** 2 > ((b.r || 0) + 400) ** 2) continue;   // (far: it cannot come into reach within the clock's difference)
      (out || (out = [])).push([b, b.x, b.y, b.a]);
      const s = t / 1000;
      if (b.moon) { const a = TAU_MOD(b.ph + b.dir * 6.283 * s / b.period); b.x = b.p.hx + Math.cos(a) * b.orbit; b.y = b.p.hy + Math.sin(a) * b.orbit; b.a = a; }
      else { const w = Math.sin(s / b.T * 6.283 + b.ph) * b.A; b.x = b.bx + Math.cos(b.dirA) * w; b.y = b.by + Math.sin(b.dirA) * w; b.a = TAU_MOD(b.a0 + b.spin * s); }
      holePull(b, t, 0.2);
    }
    return out;
  }
  function pilotMove(o, c, dt = CMD_DT) {
    if (!Number.isFinite(o.mt)) { o.mt = 0; o.padAt = -1e9; }   // the command clock starts: a pad's wait from another clock is dropped
    o.mt += dt;
    const st = o.stick || (o.stick = { x: 0, y: 0 }), m = Math.hypot(c.mx, c.my), e = 1 - Math.exp(-13 * dt);
    st.x += ((m > 1 ? c.mx / m : c.mx) - st.x) * e; st.y += ((m > 1 ? c.my / m : c.my) - st.y) * e;
    o.a = c.aim;
    o.regenWait = Math.max(0, (o.regenWait || 0) - dt); o.dashCool = Math.max(0, (o.dashCool || 0) - dt); o.dashFx = Math.max(0, (o.dashFx || 0) - dt);
    if (!Number.isFinite(o.energy)) o.energy = 100;
    let dashed = false, lit = false;
    if (c.dash > (o.dashDone || 0)) {   // a dash: toward where it steers (or ahead)
      o.dashDone = c.dash;
      if (o.energy >= 25 && o.dashCool <= 0) {
        const a = Math.hypot(st.x, st.y) > 0.2 ? Math.atan2(st.y, st.x) : o.a;
        o.vx += Math.cos(a) * 900; o.vy += Math.sin(a) * 900; o.energy -= 25; o.regenWait = 0.7; o.dashCool = 0.15; o.dashFx = 0.35; dashed = a;
        if (!replaying) { o.dashAt = performance.now(); o.inv = Math.max(o.inv || 0, performance.now() + 280); }
      }
    }
    const boosting = !!c.boost && o.energy > 0 && Math.hypot(st.x, st.y) > 0.1;
    if (boosting && !o.boostOn) { o.vx += Math.cos(o.a) * 220; o.vy += Math.sin(o.a) * 220; lit = true; }   // lighting it shoves forward
    o.boostOn = o.boosting = boosting;
    if (boosting) { o.energy = Math.max(0, o.energy - 20 * dt); o.regenWait = 0.7; }
    else if (o.regenWait <= 0) o.energy = Math.min(100, o.energy + 22 * dt);
    // the moons and drifting wrecks too stand where the shared clock had them when the command was made, for its
    // flight only (they go back after): the screen and the server bounce off them in the same place
    const moved = c.ct > 0 ? bodiesAt(c.ct, o) : null;
    const f = flyPilot(o, st.x, st.y, boosting, !!c.brake, dt, o.mt * 1000, boosting || o.dashFx > 0);
    if (moved) for (const [b, x, y, a] of moved) { b.x = x; b.y = y; b.a = a; }
    f.dashed = dashed; f.lit = lit;
    // the junk rocks, where they were at the moment the command was made (ct, on the shared clock they move by): the
    // screen and the server meet each rock in the same place, whenever each flies the command
    if (c.ct > 0) for (let i = 0; i < ROCKS; i++) {
      const at = rockAt(i, c.ct);
      if ((at[0] - o.x) ** 2 + (at[1] - o.y) ** 2 > 140 ** 2) continue;   // (far: the whole rock is not worth making; the biggest reach is 40 + 60)
      const k = rock(i, c.ct);
      if (k.age < 0.6 || grabbed.has(k.key) || (k.x - o.x) ** 2 + (k.y - o.y) ** 2 > (k.r + 60) ** 2) continue;
      const sp = collideRock(o, k);
      if (sp > 0) f.rock = { k, sp };
    }
    // the state ends each command in hundredths, on both sides alike (as Gaffer on Games quantizes): the server sends
    // exactly what it flies on from, small numbers the deltas shorten, and a replay from it is still exact
    for (const k of MOVE_STATE) if (k !== "padAt") o[k] = Math.round(o[k] * 100) / 100;
    st.x = Math.round(st.x * 1e4) / 1e4; st.y = Math.round(st.y * 1e4) / 1e4;
    return f;
  }
  // a player's command queue starts afresh (a respawn, a new round): nothing old is flown again or owed, and the
  // allowance does not count the time spent dead
  function resetCmds(b) { if (!b.cq) return; b.cq.length = 0; b.cqBudget = 0; b.cqAt = undefined; b.cqOwed = 0; b.lastCmd = null; b.jkN = undefined; }   // (jkN: counted again from the next command)
  // what a command flight carries from one command to the next (sent by the server for the player's own pilot)
  const MOVE_STATE = ["x", "y", "vx", "vy", "a", "energy", "regenWait", "dashCool", "dashFx", "dashDone", "mt", "padAt"];
  // (exact, not rounded: a bounce off a wall turns on fractions of a pixel, and the replay must bounce the same)
  const moveState = o => [...MOVE_STATE.map(k => o[k] || 0), o.stick?.x || 0, o.stick?.y || 0, o.boostOn ? 1 : 0];
  function setMoveState(o, v) {
    MOVE_STATE.forEach((k, i) => o[k] = v[i]);
    o.stick = { x: v[MOVE_STATE.length], y: v[MOVE_STATE.length + 1] }; o.boostOn = o.boosting = !!v[MOVE_STATE.length + 2];
  }
  // touching another pilot pushes you off it (harder if it rams you on boost, softer if you ram it): kick, or 0
  // my flight: thrust with inertia, gravity, bumping off bodies and the fence, facing, exhaust
  // on the game server my flight goes as commands, one every CMD_DT of frame time (pilotMove): made, flown here and
  // kept until the server has flown it too (12c-server.js sends them and reconciles)
  function flyCmds(dt, braking) {
    srv.acc = Math.min((srv.acc || 0) + dt, CMD_DT * 8);
    const c0 = me.ctl || {}, r3 = v => Math.round(num(v, 0) * 1000) / 1000;
    let f = { crash: null, fence: null, drift: !!me.drift, dashed: false, lit: false };
    while (srv.acc >= CMD_DT - 1e-9) {
      srv.acc -= CMD_DT;
      // (rounded as the wire carries them, so both sides fly exactly the same numbers)
      const c = { s: ++srv.cs, mx: r3(c0.mx), my: r3(c0.my), aim: r3(Math.atan2(Math.sin(me.a), Math.cos(me.a))), boost: !!c0.boostReq, brake: braking, dash: srv.dashN,
        fire: !!c0.fire && roundLive, alt: !!c0.alt && roundLive,   // the trigger too: the server fires on this command, with this aim
        kx: srv.kx || 0, ky: srv.ky || 0,   // the recoil my shots gave before it (the server gives its own; a replay needs mine)
        ct: Math.round(clockNow()),   // when (shared clock): the junk rocks are met where they were then
        vt: serverRun ? Math.round(Date.now() + (srv.off || 0) - srv.interp) : 0 };   // the moment of the others shown now (serverInterp)
      srv.kx = srv.ky = 0;
      srv.cmds.push(c); if (srv.cmds.length > 240) srv.cmds.shift();
      if (srv.trig) { me.a = c.aim; srv.jk = c.s; fireTick(CMD_DT, performance.now(), srv.trig.held, srv.trig.altHeld); srv.jk = undefined; }   // the trigger, before the flight (as the server)
      const g = pilotMove(me, c);
      f = { crash: g.crash || f.crash, fence: g.fence || f.fence, drift: g.drift, dashed: g.dashed !== false ? g.dashed : f.dashed, lit: g.lit || f.lit, rock: g.rock || f.rock };
    }
    energy = me.energy;
    return f;
  }
  // face where you steer, not where you drift: recoil, bumps and the black hole's pull move the bin
  // but no longer spin it (shooting while standing still used to flip it round and round)
  function faceMe(dt, drift) {
    const steerMag = Math.hypot(steer.x, steer.y), sp = Math.hypot(me.vx, me.vy);
    if (playing && !me.dead && pad.on && pad.aimUntil > performance.now()) me.a = lerpAng(me.a, pad.aim, 1 - Math.exp(-30 * dt));   // a gamepad's right stick aims
    else if (playing && !me.dead && mouseAim()) {   // mouse aim: the nose follows the cursor, quick but not instant
      const [cx, cy] = cursorAt();
      if (Math.hypot(cx - sx(me.x), cy - sy(me.y)) > 12) me.a = lerpAng(me.a, Math.atan2(cy - sy(me.y), cx - sx(me.x)), 1 - Math.exp(-30 * dt));
    } else if (playing && steerMag > 0.15) me.a = lerpAng(me.a, Math.atan2(steer.y, steer.x), 1 - Math.exp(-(drift ? 20 : 13) * dt));
    else if (!playing && sp > 25) me.a = lerpAng(me.a, Math.atan2(me.vy, me.vx), 1 - Math.exp(-6 * dt));
  }
