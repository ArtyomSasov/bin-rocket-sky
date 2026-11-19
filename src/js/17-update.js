  // ---------- update ----------
  let sendAcc = 0, boardAcc = 0, sendSeq = 0, slowAcc = 1, lastSlow = "", lastNetTick = performance.now();
  const ampChip = document.getElementById("ampChip");
  let ampShown = -1;
  function ampHud(now) {
    const left = me.ampUntil > now ? Math.ceil((me.ampUntil - now) / 1000) : 0;
    if (left === ampShown) return;
    ampShown = left; ampChip.hidden = !left; ampChip.textContent = "QUAD DAMAGE x4 · " + left + "s";
  }
  // controls: respawn when due, fire, read the stick / keys / mouse, boost energy
  function steerAndShoot(dt, now) {
    // input → acceleration
    let ix = 0, iy = 0;
    const shiftHeld = keys.has("ShiftLeft") || keys.has("ShiftRight");
    let boost = (shiftHeld || boostBtnDown) && boostDownAt >= 0 && now - boostDownAt > BOOST_HOLD * 1000 && !keys.has("KeyX");
    if (me.dead && now >= me.respawnAt && !serverRun) respawn(now);   // the server respawns my pilot where it chooses
    fireCd -= dt; shake = Math.max(0, shake - dt);
    const aimM = mouseAim();
    const held = firing || FIRE_KEYS.some(k => keys.has(k)) || (aimM && ptr.down);   // with mouse aim the left button fires
    const ready = playing && roundLive && !me.dead && fireCd <= 0 && !guided && (!serverRun || srv.joined);   // on the server my shots are only shown (12c-server.js)
    const altW = WEAPONS[me.weapon].alt, altHeld = altFiring || keys.has("KeyC");
    rocketLoadTick(dt, now, altHeld, ready);
    if (altW && altW.charge) {   // rail alt: hold to widen the cutter, release to open a short breach
      if (altHeld && ready && me.arsenal[me.weapon] >= altW.cost) {
        const was = railCharge; railCharge = Math.min(1, railCharge + dt / altW.charge);
        if (Math.floor(was * 6) !== Math.floor(railCharge * 6)) sfx("p_charge", 0.3, 0.8 + railCharge * 0.5);
        if (was < 1 && railCharge === 1) audioCue("chargeFull");
      } else {
        if (altHeld && ready && (me.arsenal[me.weapon] || 0) < altW.cost) rejectFire("NEED " + altW.cost + " AMMO", now);
        if (railCharge > 0) { if (!altHeld && ready && me.arsenal[me.weapon] >= altW.cost) shoot(now, true); else audioCue("chargeCancel"); railCharge = 0; }
      }
    } else railCharge = 0;
    me.heat = Math.max(0, (me.heat || 0) - 0.45 * dt); if (me.overheat && me.heat < 0.3) { me.overheat = false; renderAmmo(me.weapon); audioCue("ready"); }
    if (ready && altHeld && altW && !altW.charge && !altW.load) { triggerTick(dt, now, false, held); shoot(now, true); }
    else if (triggerTick(dt, now, ready && fireCd <= 0 && !(altHeld && (altW?.charge || altW?.load)) && railCharge === 0, held) || (ready && me.weapon === "gauntlet" && now < (me.lungeUntil || 0))) shoot(now);   // a lunge lands blows too
    if (playing && !me.dead) {
      if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
      if (keys.has("KeyW") || keys.has("ArrowUp")) iy -= 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) iy += 1;
      const jm = Math.hypot(joy.x, joy.y);
      if (jm > 0.12) { const m = Math.min(1, (jm - 0.12) / 0.8); ix += joy.x / jm * m; iy += joy.y / jm * m; }
      if ((ptr.down && !aimM) || (aimM && guided)) {   // the pointer steers (with mouse aim: only a guided nuke)
        const [cx, cy] = cursorAt(), from = guided || me, dx = cx - sx(from.x), dy = cy - sy(from.y), d = Math.hypot(dx, dy);   // steer from where the bin (or the guided nuke) is on screen
        if (d > 8) { const m = Math.min(1, d / 140); ix += dx / d * m; iy += dy / d * m; }
        if (d > Math.min(vw, vh) * 0.4 && !aimM) boost = true;
      }
    }
    const raw = Math.hypot(ix, iy);
    if (raw > 1) { ix /= raw; iy /= raw; }
    if (guideTick(dt, now, ix, iy, held)) { ix = iy = 0; boost = false; }   // the stick flies the nuke; the bin coasts
    // input eases in/out over ~0.1 s, then velocity eases toward the wanted velocity: turns become arcs
    const ease = 1 - Math.exp(-13 * dt);
    steer.x += (ix - steer.x) * ease; steer.y += (iy - steer.y) * ease;
    const im = Math.hypot(steer.x, steer.y);
    const boostReq = !!boost && playing && !me.dead;   // what the player asks (a command flight checks the energy itself)
    boost = boost && playing && !me.dead && energy > 0 && im > 0.1;
    me.boostFx = now - me.dashAt < 350 ? 2 : boost ? 1 : 0;
    if (boost) { energy = Math.max(0, energy - 20 * dt); energyRegenAt = now + 700; }   // a full bar is ~5 s of boost
    else if (now > energyRegenAt) energy = Math.min(100, energy + 22 * dt);   // perk: faster energy from Lv 2
    me.ctl = { mx: ix, my: iy, fire: held, alt: altHeld, boost, boostReq };   // the raw controls, for the authoritative server
    return { im, boost };
  }
  // the flight model every pilot flies by, me and the bots alike (sx, sy: the stick, eased; k: a bot's speed factor).
  // Inertia: thrust pushes the bin and it keeps its speed, coasting down only slowly. Pushing against your motion
  // fires the retro thrusters (they bite harder), braking is an air brake; past top speed the excess (a hit, a blast) bleeds off
  function thrustPilot(o, sx_, sy_, boost, braking, dt, k = 1) {
    const im = Math.hypot(sx_, sy_), top = (boost ? 880 : 560) * k, acc = (boost ? 1500 : 980) * k, sp0 = Math.hypot(o.vx, o.vy);
    if (im > 0.05) {
      const ux = sx_ / im, uy = sy_ / im, along = sp0 > 1 ? (o.vx * ux + o.vy * uy) / sp0 : 1;
      const va = o.vx * ux + o.vy * uy;   // speed already going this way: thrust fades out as it nears top speed
      const kk = Math.max(0, Math.min(acc * Math.min(1, im) * (along < 0 ? 1 - 0.8 * along : 1) * dt, (top * Math.min(1, im) - va) * Math.min(1, 6 * dt)));
      o.vx += ux * kk; o.vy += uy * kk;
      const lat = -o.vx * uy + o.vy * ux, ld = lat * (1 - Math.exp(-2.2 * dt));   // sideways slip fades: turns sweep in tight arcs
      o.vx += uy * ld; o.vy -= ux * ld;
    } else { const d = Math.exp(-0.45 * dt); o.vx *= d; o.vy *= d; }
    if (braking) { const s = Math.hypot(o.vx, o.vy), ns = Math.max(0, s - 1000 * dt); if (s > 1) { o.vx *= ns / s; o.vy *= ns / s; } }
    const s1 = Math.hypot(o.vx, o.vy);
    if (s1 > top) { const ns = top + (s1 - top) * Math.exp(-2.5 * dt); o.vx *= ns / s1; o.vy *= ns / s1; }
  }
  // boost pads: fly over one and it flings you its way (at least PAD_V fast); the same for bots
  const PAD_R = 70, PAD_V = 1500;
  function padsFor(o, now) {
    for (const p of arena.pads) {
      if ((o.x - p.x) ** 2 + (o.y - p.y) ** 2 > PAD_R * PAD_R || now - (o.padAt || 0) < 700) continue;
      o.padAt = now;
      const ux = Math.cos(p.a), uy = Math.sin(p.a), along = o.vx * ux + o.vy * uy, lat = -o.vx * uy + o.vy * ux;
      const v = Math.max(PAD_V, along + 500);
      o.vx = ux * v - uy * lat * 0.3; o.vy = uy * v + ux * lat * 0.3;   // most of the sideways drift is cancelled
      if (!replaying && onScreen(sx(p.x), sy(p.y), 200)) {
        rings.push({ x: p.x, y: p.y, t: 0, r: 150, col: "120,255,220", warp: true, dur: 0.45, w: 10 });
        for (let k = 0; k < 24; k++) { const a = p.a + Math.PI + (Math.random() - 0.5) * 0.8, s2 = 200 + Math.random() * 400; puff(p.x, p.y, Math.cos(a) * s2, Math.sin(a) * s2, 0.4, 2.4, k % 2 ? "#7dffd8" : "#ffffff"); }
        sfx("dash", 0.9, 0.8, p.x, p.y);
      }
      if (o === me && !replaying) { camKick.x -= ux * 30; camKick.y -= uy * 30; shake = Math.max(shake, 0.12); }
    }
  }
  // the gravity slingshot: skimming past a planet fast and along its rim gives extra speed (up to boost speed),
  // with a streak of light off the hull: diving round planets is the quickest way about
  function slingshot(o, dt) {
    const v = Math.hypot(o.vx, o.vy);
    if (v < 420) return;
    for (const p of planets) {
      if (p.dead || p.star) continue;
      const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy), gap = d - p.rr;
      if (gap < 30 || gap > p.rr * 0.9 + 120) continue;
      const tang = Math.abs((dx * o.vy - dy * o.vx) / (d * v));   // 1 when flying along the rim
      if (tang < 0.65) continue;
      const k = tang * (1 - gap / (p.rr * 0.9 + 120)), nv = Math.min(1000, v + 750 * k * dt);
      if (nv > v) { o.vx *= nv / v; o.vy *= nv / v; }
      if (!replaying && Math.random() < dt * 30 * k) puff(o.x, o.y, -o.vx * 0.2 + (Math.random() - 0.5) * 40, -o.vy * 0.2 + (Math.random() - 0.5) * 40, 0.5, 2 + Math.random() * 2, "#bff3ff", 1, 0.05);
      return;
    }
  }
  // One step of a player's flight: the same function flies my bin here and a player's pilot on the server, so the
  // server's word on where I am agrees with what this screen predicted. Thrust (or a drift: with the brake and a
  // direction the engine cuts and the bin slides on), gravity, the slingshot and pads, the move, then bumping off
  // bodies and the fence. It says what was hit and the damage that does; the caller shows it and applies it.
  // boosted: on boost or just dashed (a crash then hurts more)
  function flyPilot(o, sx_, sy_, boost, brake, dt, now, boosted) {
    const drift = brake && Math.hypot(sx_, sy_) > 0.3 && Math.hypot(o.vx, o.vy) > 150;
    if (drift) thrustPilot(o, 0, 0, false, false, dt);
    else thrustPilot(o, sx_, sy_, boost, brake, dt, performance.now() < (o.pinnedUntil || 0) ? 0.6 : 1);   // pinned by nails: slower
    gravityOn(o, dt); slingshot(o, dt); padsFor(o, now);
    o.x += o.vx * dt; o.y += o.vy * dt;
    const wr = WALL_R * sizeOf(o.lv || 1), pc = bounceOff(o, wr, 0.7);
    let crash = null, fence = null;
    if (pc) {   // planets and moons: like the fence, and worse on boost
      const big = hurtsOnHit(pc.b), hs = -pc.vn;
      if (big) { o.vx += pc.nx * 220; o.vy += pc.ny * 220; }
      crash = { pc, big, hs, x: o.x - pc.nx * wr, y: o.y - pc.ny * wr, dmg: big && hs > 60 ? crashDmg(hs, boosted) : 0 };
    }
    const hitX = o.x < wr ? wr : o.x > W - wr ? W - wr : null, hitY = o.y < wr ? wr : o.y > H - wr ? H - wr : null;
    if (hitX !== null || hitY !== null) {   // the fence: bounced back in, and hurt if it was fast
      const hitSpeed = Math.hypot(o.vx, o.vy);
      if (hitX !== null) { o.x = hitX; o.vx = -o.vx * 0.7 + Math.sign(W / 2 - o.x) * 220; }
      if (hitY !== null) { o.y = hitY; o.vy = -o.vy * 0.7 + Math.sign(H / 2 - o.y) * 220; }
      fence = { hitSpeed, x: hitX !== null ? (hitX < W / 2 ? 0 : W) : o.x, y: hitY !== null ? (hitY < H / 2 ? 0 : H) : o.y, dmg: hitSpeed > 120 ? 0.6 : 0 };
    }
    return { drift, crash, fence };
  }
  // ---- a player's flight as numbered commands, as Quake 3, Source and Overwatch fly it ----
  // A command is the controls for one fixed slice of flight (CMD_DT): the stick, the facing, boost, brake and the dash
  // count. The player's screen flies each one the moment it makes it, and sends it; the server flies the very same
  // one, once, with the same function and slice. The server then says where the pilot is after its last command,
  // and the screen flies the commands the server has not had yet again from there (reconcile in 12c-server.js): only
  // what really differs (a hit, a bump into something that moved) is left to correct. Its timers run on its own
  // command clock (mt), so both sides count them alike whenever the commands arrive.
  const CMD_DT = 1 / 60;
  let replaying = false;   // flying commands again from the server's word: no effects, nothing else pushed
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
    const f = flyPilot(o, st.x, st.y, boosting, !!c.brake, dt, o.mt * 1000, boosting || o.dashFx > 0);
    f.dashed = dashed; f.lit = lit;
    // the junk rocks, where they were at the moment the command was made (ct, on the shared clock they move by): the
    // screen and the server meet each rock in the same place, whenever each flies the command
    if (c.ct > 0) for (let i = 0; i < ROCKS; i++) {
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
  function resetCmds(b) { if (!b.cq) return; b.cq.length = 0; b.cqBudget = 0; b.cqAt = undefined; b.cqOwed = 0; b.lastCmd = null; }
  // what a command flight carries from one command to the next (sent by the server for the player's own pilot)
  const MOVE_STATE = ["x", "y", "vx", "vy", "a", "energy", "regenWait", "dashCool", "dashFx", "dashDone", "mt", "padAt"];
  // (exact, not rounded: a bounce off a wall turns on fractions of a pixel, and the replay must bounce the same)
  const moveState = o => [...MOVE_STATE.map(k => o[k] || 0), o.stick?.x || 0, o.stick?.y || 0, o.boostOn ? 1 : 0];
  function setMoveState(o, v) {
    MOVE_STATE.forEach((k, i) => o[k] = v[i]);
    o.stick = { x: v[MOVE_STATE.length], y: v[MOVE_STATE.length + 1] }; o.boostOn = o.boosting = !!v[MOVE_STATE.length + 2];
  }
  // touching another pilot pushes you off it (harder if it rams you on boost, softer if you ram it): kick, or 0
  const boopKick = (rammed, mineRam) => rammed ? 900 : mineRam ? 260 : 420;
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
        ct: Math.round(clockNow()) };   // when (shared clock): the junk rocks are met where they were then
      srv.kx = srv.ky = 0;
      srv.cmds.push(c); if (srv.cmds.length > 240) srv.cmds.shift();
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
    if (playing && !me.dead && mouseAim()) {   // mouse aim: the nose follows the cursor, quick but not instant
      const [cx, cy] = cursorAt();
      if (Math.hypot(cx - sx(me.x), cy - sy(me.y)) > 12) me.a = lerpAng(me.a, Math.atan2(cy - sy(me.y), cx - sx(me.x)), 1 - Math.exp(-30 * dt));
    } else if (playing && steerMag > 0.15) me.a = lerpAng(me.a, Math.atan2(steer.y, steer.x), 1 - Math.exp(-(drift ? 20 : 13) * dt));
    else if (!playing && sp > 25) me.a = lerpAng(me.a, Math.atan2(me.vy, me.vx), 1 - Math.exp(-6 * dt));
  }
  function flyMe(dt, now, im, boost) {
    const braking = playing && !me.dead && keys.has("KeyX");
    if (me.ctl) me.ctl.brake = braking;   // (for the authoritative server)
    // X with a direction is a drift: the engine cuts, the bin slides on with its speed and the nose swings round
    // fast to where you push, so you can turn and shoot back the way you came. X alone is the air brake
    let drift = false, lit = false;
    if (serverRun && !srv.placed && playing) { me.vx = me.vy = 0; return; }   // waiting for the server to say where I am
    const wr = WALL_R * sizeOf(me.lv), a0 = me.a, cmdMode = serverRun && srv.joined && playing && !me.dead;
    if (cmdMode) boost = !!me.boosting;
    if (playing && !me.dead) {
      // (in a command flight the facing turns after: the commands carry the aim this frame's shots went out with)
      const f = cmdMode ? flyCmds(dt, braking) : flyPilot(me, steer.x, steer.y, boost, braking, dt, now, me.boostFx > 0);
      if (cmdMode) faceMe(dt, me.drift);
      drift = f.drift; lit = !!f.lit;
      if (f.crash && f.crash.hs > 60) {
        const { big, hs, x: cx, y: cy, pc } = f.crash;
        impact(cx, cy, "#ffd9b0", Math.min(2, (big ? 0.4 : 0.2) + hs / 450));
        if (hs > 300) sparkShower(cx, cy, pc.nx, pc.ny, Math.min(1.6, hs / 600));
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
        const s = 26 * sizeOf(me.lv), nx = -Math.sin(me.a), ny = Math.cos(me.a), side = Math.random() < 0.5 ? 1 : -1;
        puff(me.x + nx * s * side, me.y + ny * s * side, nx * side * 60 + (Math.random() - 0.5) * 40, ny * side * 60 + (Math.random() - 0.5) * 40, 0.6, 3 + Math.random() * 3, "rgb(190,200,225)", 2);
      }
      if (braking && !drift && Math.hypot(me.vx, me.vy) > 60 && Math.random() < 40 * dt) {   // retro jets puffing out of the nose
        const fx = me.x + Math.cos(me.a) * 30 * sizeOf(me.lv), fy = me.y + Math.sin(me.a) * 30 * sizeOf(me.lv);
        puff(fx, fy, Math.cos(me.a) * 220 + me.vx, Math.sin(me.a) * 220 + me.vy, 0.35, 3 + Math.random() * 3, "#cfe8ff", 2);
      }
    } else {   // the start screen's idle drift, or a wreck waiting to respawn
      if (!playing) { me.vx = Math.cos(now / 2400) * 120; me.vy = Math.sin(now / 3100) * 90 - 40; }
      if (me.dead) { me.vx = me.vy = 0; } else gravityOn(me, dt);
      me.x += me.vx * dt; me.y += me.vy * dt;
      if (!me.dead) bounceOff(me, wr, 0.7);
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
      impacts.push({ x: jet.x, y: jet.y, t: 0, r: 70, col: "#9ff3ff" });
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
    if (!me.dead) { trailFrom(me, 0.6 + me.thrust * 1.6 + me.boostFx * 1.5, dt); if (playing) damageFx(me, dt); afterburner(me, me.boostFx, dt); }
  }
  // every shot in flight: homing, ricochets, digging into bodies, hitting me (I decide) or reaching others
  let ricAt = 0, whizAt = 0;
  // hitscan, as in Quake: the rail, the laser, the shock beam and lightning hit along their whole line at once, so the
  // damage lands with the beam you see, not when a fast slug would have got there. The rail bores through every body
  // to the fence (each bin on the line is hit once); the others stop at the first rock. The shot then spans that line
  // (px,py -> x,y) for one frame, so the usual hit checks (me, the others, my bots, orbs for a combo) see all of it.
  const HITSCAN = { [K.BULLET]: 1, [K.PISTOL]: 1, [K.RAIL]: 1, [K.LASER]: 1, [K.SHOCK]: 1, [K.BOLT]: 1, [K.GAUSS]: 1 };
  function traceBeam(s) {
    s.traced = true; s.expireAfterStep = true;
    const v = Math.hypot(s.vx, s.vy) || 1, dx = s.vx / v, dy = s.vy / v, pierce = pierces(s);
    s.px = s.x; s.py = s.y;
    const reach = beamReach(s), max = pierce ? reach : firstBinAlong(s, reach);
    const own = s.mine || botById.has(s.owner);
    let L = pierce ? max : 0, stop = null;
    while (L < max) {
      const nl = Math.min(max, L + 4), x = s.x + dx * nl, y = s.y + dy * nl;
      if (x < 0 || x > W || y < 0 || y > H) break;
      L = nl;
      const b = solidAny(x, y);
      if (!b) continue;
      if (!pierce) { stop = { b, x, y }; break; }
      // Piercing terrain is cut as a single capsule after the endpoint is known.
    }
    const ex = s.x + dx * L, ey = s.y + dy * L;
    s.px = s.x; s.py = s.y; s.x = ex; s.y = ey;
    if (pierce) carveBeam(s, s.cut || SHOTS[s.kind].carve);
    if (stop) {   // a beam ends on rock: it scorches a crater there
      if (own || stop.b.free) carveAt(stop.b, stop.x, stop.y, SHOTS[s.kind].carve, own);
      impact(stop.x, stop.y, SHOTS[s.kind].col, 0.8);
    }
    if (s.kind === K.PISTOL) beams.push({ x1: s.px, y1: s.py, x2: s.x, y2: s.y, t: 0, pistol: true });
    if (s.kind === K.BULLET) {
      const speed = 2600;
      const distance = Math.hypot(s.x - s.px, s.y - s.py);
      beams.push({ x1: s.px, y1: s.py, x2: s.x, y2: s.y, t: 0, round: s.kind, speed, duration: Math.min(.45, distance / speed + .035) });
      if (beams.length > 256) beams.splice(0, beams.length - 256);
    }
    s.beamHit = stop ? "body" : max < reach ? "bin" : null;
    if (s.kind === K.LASER || s.kind === K.SHOCK) laserBeam(s, s.owner);
    s.life = Math.min(s.life, 1e-4);   // one frame of hits, then gone
  }
  const spotHeard = new Set();
  function updateShots(dt, now) {
    // fireballs
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      // Preserve the final partial step; collision checks (including bots) run before expiry.
      if (s.expireAfterStep) s.life = 0;
      let extra = s.catchup || 0; s.catchup = 0;
      if (s.catchSlow > 0) { const e = Math.min(s.catchSlow, s.catchRate * dt); s.catchSlow -= e; extra += e; }   // made up gradually
      const stepDt = Math.min(Math.max(0, s.life), dt + extra);
      s.stepFrom = now - (dt + extra) * 1000; s.stepTo = s.stepFrom + stepDt * 1000;
      if (s.life > 0) {
        const left = s.life - stepDt;
        s.expireAfterStep = left <= 1e-8;
        s.life = Math.max(1e-4, left);
      }
      if (s.kind === K.RECALL) { recallSaws(s); shots.splice(i, 1); continue; }
      // Ripper discs retain their ricochet direction; no automatic recall.
      if (s.kind === K.DET) { detonateOrb(s); if (s.life <= 0) shots.splice(i, 1); continue; }   // inert: it only sets off its orb
      if (HITSCAN[s.kind] && !s.traced && s.life > 0) traceBeam(s);   // rail, laser, beams: the whole line, this very frame
      if (s.kind === K.MDET) { detonateMines(s); if (s.life <= 0) shots.splice(i, 1); continue; }   // ...and this one its pilot's mines
      if (s.kind === K.MINE && s.trigAt && now >= s.trigAt) s.life = 0;   // a triggered mine goes off
      if (s.life <= 0 && s.kind === K.FLAK) flakBurst(s);
      if (s.life <= 0) { if (SPLASH[s.kind]) splash(s, now); if (BOMBS[s.kind]) detonate(s, now); shots.splice(i, 1); continue; }
      if (s.kind === K.HROCKET) steerRocket(s, stepDt);
      if (s.kind === K.HROCKET && s.life > 0) for (const o of shots) {   // homing rockets are slow: any enemy shot can blow one up mid-air
        if (o === s || o.life <= 0 || SHOTS[o.kind].inert || o.kind === K.MINE || (o.mine ? s.mine : o.owner === s.owner)) continue;
        if (isTeams() && teamOfShot(o) !== undefined && teamOfShot(o) === teamOfShot(s)) continue;   // a teammate's shot passes it
        if (segHit(o, s.x, s.y, 24)) { s.life = 0; if (!pierces(o)) o.life = 0; impact(s.x, s.y, "#ffb43c", 1.6); explode(s.x, s.y, 40, 300); sfx("boom_small", 0.8, 1.2, s.x, s.y); break; }
      }
      if (s.life <= 0) continue;   // shot down: it blows up (splash) at the start of next frame
      if (s.kind === K.MINE) {
        if (s.stuck) mineStick(s); else { const k = Math.exp(-1.6 * stepDt); s.vx *= k; s.vy *= k; }   // a prox mine slows in flight, then rides the rock it stuck to
        if (!s.trigAt && SHOTS[K.MINE].life - s.life >= MINE_ARM) {   // armed: an enemy coming within reach sets it ticking
          let near = canHurt(s, me, "me") && playing && Math.hypot(me.x - s.x, me.y - s.y) < 150;
          if (!near) for (const [rid, r] of remotes) if (canHurt(s, r, rid) && Math.hypot(r.x - s.x, r.y - s.y) < 150 + binR(r.lv || 1) * 0.5) { near = true; break; }
          if (near) { s.trigAt = now + 250; packPlay("p_tick_mine", 0.8, s.x, s.y) || sfx("hit", 0.4, 2.4, s.x, s.y); }
        }
      }
      if (s.kind === K.GREN) { const k = Math.exp(-0.7 * stepDt); s.vx *= k; s.vy *= k; }   // a grenade slows as it flies
      if (s.kind === K.NUKE) { const v = Math.hypot(s.vx, s.vy), nv = Math.min(720, v + 260 * stepDt); s.vx *= nv / v; s.vy *= nv / v; }
      if (!s.traced) { s.px = s.x; s.py = s.y; s.x += s.vx * stepDt; s.y += s.vy * stepDt; }   // a traced beam already spans its whole line
      if (!s.traced && !pierces(s) && !SHOTS[s.kind].inert && s.kind !== K.MINE) {
        const v = Math.hypot(s.vx, s.vy) || 1, L = firstBinAlong(s, v * stepDt);
        const full = v * stepDt;
        if (full > 0) s.stepTo = s.stepFrom + (s.stepTo - s.stepFrom) * L / full;
        s.x = s.px + s.vx / v * L; s.y = s.py + s.vy / v * L;
      }
      if (s.kind === K.NUKE && (s.x < 0 || s.x > W || s.y < 0 || s.y > H || solidAny(s.x, s.y) || nukeTouches(s))) { detonate(s, now); shots.splice(i, 1); continue; }
      if (s.kind === K.HOLY) { holyFlight(s, stepDt); continue; }
      if (s.kind === K.BEACON) {   // the teleporter's beacon: slides to a stop and blinks
        bounceFlight(s, stepDt, 1.9);
        if (Math.random() < stepDt * 12) puff(s.x, s.y, (Math.random() - .5) * 60, (Math.random() - .5) * 60, 0.4, 2, "#8ff0ff");
        continue;
      }
      if (s.kind === K.GAMMA) gammaZap(s, stepDt, now);
      if (s.kind === K.NUKE) {
        if (Math.random() < stepDt * 70) puff(s.x, s.y, -s.vx * 0.15 + (Math.random() - .5) * 50, -s.vy * 0.15 + (Math.random() - .5) * 50, 0.9, 3 + Math.random() * 3, Math.random() < 0.5 ? "#8a7fb0" : "#ffe14d");
        continue;
      }
      if (s.kind === K.MINE && !s.stuck && (s.x < 0 || s.x > W || s.y < 0 || s.y > H)) { s.x = clamp(s.x, 0, W); s.y = clamp(s.y, 0, H); s.stuck = { b: null }; packPlay("p_mine_hit", 0.7, s.x, s.y); }   // sticks to the fence
      const bounce = SHOTS[s.kind].bounce;
      if (bounce && s.bn < bounce) {   // shards and saws ricochet off the fence and off planets, losing a bit of speed
        let hit = false;
        if (s.x < 0 || s.x > W) { s.vx = -s.vx; s.x = clamp(s.x, 0, W); hit = true; }
        if (s.y < 0 || s.y > H) { s.vy = -s.vy; s.y = clamp(s.y, 0, H); hit = true; }
        if (hit) { if (s.kind === K.SAW) packPlay("p_ut_saw_ric", .7, s.x, s.y); s.bn++; s.vx *= s.kind === K.GREN ? 0.6 : 0.85; s.vy *= s.kind === K.GREN ? 0.6 : 0.85; s.px = s.x; s.py = s.y; impact(s.x, s.y, SHOTS[s.kind].col, 0.5); if (s.kind === K.SHARD) shardRicochet(s); if (s.kind === K.GREN) grenBounce(s); }
      }
      if ((s.kind === K.RAIL || s.kind === K.SHOCK) && s.life > 0) for (const o of shots) {
        if (o.kind === K.ORB && o.life > 0 && !o.combo && segHit(s, o.x, o.y, 45)) { comboBlast(o, s, now); if (s.kind === K.SHOCK) { s.life = 0; break; } }
      }
      // planets, moons, wrecks and rubble: the shot digs a crater where it lands (my shots and my bots' report theirs;
      // others' craters on shared bodies arrive over the network, but anyone's shot chips local rubble)
      const hb = s.stuck || s.traced ? null : shotBody(s);
      if (hb) {
        const own = s.mine || botById.has(s.owner), dig = own || hb.b.free;
        if (s.kind === K.RAIL || s.kind === K.GAUSS) {   // rail and gauss slugs bore a tunnel straight through and keep going
          if (dig) for (let f = 0; f <= 1.0001; f += 0.125) { const px = s.px + (s.x - s.px) * f, py = s.py + (s.y - s.py) * f; if (solidAt(hb.b, px, py)) carveAt(hb.b, px, py, SHOTS[s.kind].carve, own); }
          impact(hb.x, hb.y, SHOTS[s.kind].col, 0.8);
        } else if (bounce && s.bn < bounce) {   // shards and saws chip and ricochet; grenades just bounce
          if (dig && s.kind !== K.GREN) carveAt(hb.b, hb.x, hb.y, SHOTS[s.kind].carve, own);
          const [nx, ny] = normalAt(hb.b, hb.x, hb.y), vn = s.vx * nx + s.vy * ny, keep = s.kind === K.GREN ? 0.6 : 0.85;
          if (s.kind === K.SAW) packPlay("p_ut_saw_ric", .7, s.x, s.y);
          if (vn < 0) { s.vx = (s.vx - 2 * vn * nx) * keep; s.vy = (s.vy - 2 * vn * ny) * keep; }
          if (s.kind === K.GREN) grenBounce(s);
          s.x = hb.x + nx * 4; s.y = hb.y + ny * 4; s.px = s.x; s.py = s.y; s.bn++;
          impact(s.x, s.y, SHOTS[s.kind].col, 0.5);
          if (s.kind === K.SHARD) shardRicochet(s);
        } else {
          if (dig && SHOTS[s.kind].carve && s.kind !== K.MINE && s.kind !== K.SAW) carveAt(hb.b, hb.x, hb.y, SHOTS[s.kind].carve, own);   // only the mine attaches; an exhausted saw disappears
          if ((s.kind === K.BULLET || s.kind === K.PELLET) && now - ricAt > 90) { ricAt = now; packPlay("p_ric", 0.4, hb.x, hb.y); }   // whine off the rock
          if (s.kind === K.NAIL || s.kind === K.SPIKE) { stickNail(hb.b, hb.x, hb.y, Math.atan2(s.vy, s.vx), s.kind === K.SPIKE); audioCue("nailWall", hb.x, hb.y); }
          if (s.kind === K.MINE) {   // a prox mine sticks where it lands, just off the surface
            const [nx, ny] = normalAt(hb.b, hb.x, hb.y), px = hb.x + nx * 10, py = hb.y + ny * 10, [lx, ly] = toLocal(hb.b, px, py);
            s.stuck = { b: hb.b, lx, ly }; s.x = px; s.y = py; s.vx = s.vy = 0;
            packPlay("p_mine_hit", 0.7, hb.x, hb.y);
            continue;
          }
          s.x = hb.x; s.y = hb.y;
          if (s.kind === K.PULSE_BOLT) shotBurst(s);
          if (s.kind === K.SHARD) packPlay("p_ric", .25, s.x, s.y);
          if (s.kind === K.FLAK) { const [nx, ny] = normalAt(hb.b, hb.x, hb.y); s.x += nx * 12; s.y += ny * 12; flakBurst(s); }   // bursts just off the surface
          if (SPLASH[s.kind]) splash(s, now);
          impact(hb.x, hb.y, SHOTS[s.kind].col, s.kind === K.MINE ? 1.6 : 0.8);
          if (s.kind === K.MINE) explode(hb.x, hb.y, 40, 260);
          shots.splice(i, 1); continue;
        }
      }
      if ((s.x < 0 || s.x > W || s.y < 0 || s.y > H) && SPLASH[s.kind]) splash(s, now);
      if (s.x < 0 || s.x > W || s.y < 0 || s.y > H) { if (!SPLASH[s.kind]) explode(clamp(s.x, 0, W), clamp(s.y, 0, H), 10, 160); shots.splice(i, 1); continue; }   // (a blast weapon has had its own)
      if (s.kind === K.ROCKET || s.kind === K.HROCKET) {   // a smoke trail with fire licking out of the motor
        const sp = Math.hypot(s.vx, s.vy) || 1, bx = s.x - s.vx / sp * 26, by = s.y - s.vy / sp * 26;
        if (Math.random() < stepDt * (lowQ ? 30 : 70)) puff(bx, by, -s.vx * 0.08 + (Math.random() - .5) * 50, -s.vy * 0.08 + (Math.random() - .5) * 50, 1.2 + Math.random() * 1.0, 6 + Math.random() * 6, "rgb(120,110,140)", 2);
        if (Math.random() < stepDt * 60) puff(bx, by, -s.vx * 0.4 + (Math.random() - .5) * 60, -s.vy * 0.4 + (Math.random() - .5) * 60, 0.2 + Math.random() * 0.2, 3 + Math.random() * 3, FIRE_COLS[(Math.random() * 3) | 0]);
      } else if (s.kind === K.LASER || s.kind === K.SHOCK || s.kind === K.MELEE || s.kind === K.NAIL) {
        // a beam is drawn as a beam; a gauntlet blow isn't seen; nails are too many for trails
      } else if (s.kind === K.SAW) {
        if (Math.random() < stepDt * 45) puff(s.x, s.y, -s.vx * 0.05, -s.vy * 0.05, 0.22, 2, s.returning ? "#6fffe0" : "#d6dde8");
      } else if (s.kind === K.RAIL) {   // the slug leaves a glowing wake along its whole path
        for (let k = 0; k < 4; k++) { const f = Math.random(); puff(s.px + (s.x - s.px) * f, s.py + (s.y - s.py) * f, (Math.random() - .5) * 30, (Math.random() - .5) * 30, 0.5 + Math.random() * 0.4, 1.6 + Math.random() * 1.6, k % 2 ? "#e9c8ff" : "#ffffff"); }
      } else if (s.kind === K.ORB) {   // a plasma wake: glowing motes peeling off, and crackle
        if (Math.random() < stepDt * (lowQ ? 40 : 90)) puff(s.x + (Math.random() - .5) * 30, s.y + (Math.random() - .5) * 30, -s.vx * 0.15 + (Math.random() - .5) * 60, -s.vy * 0.15 + (Math.random() - .5) * 60, 0.5 + Math.random() * 0.4, 2.5 + Math.random() * 3, Math.random() < 0.6 ? "#6fd8ff" : "#ffffff");
      } else if (s.kind === K.SHARD) {   // a hot trail that grows with every ricochet
        if (Math.random() < stepDt * (40 + s.bn * 25)) puff(s.x, s.y, -s.vx * 0.05, -s.vy * 0.05, 0.25 + s.bn * 0.05, 2 + s.bn * 0.6, s.bn ? "#ffe0a0" : "#ffc070");
      } else if (s.kind === K.SLUG) {   // the slug drags a short hot trail
        if (Math.random() < stepDt * 50) puff(s.x, s.y, -s.vx * 0.05, -s.vy * 0.05, 0.25, 2, Math.random() < 0.5 ? "#ffe7a0" : "#ffb43c");
      } else if (s.kind === K.PELLET || s.kind === K.MINE || s.kind === K.BOLT) {
        // pellets are too short-lived for a trail; mines just sit there blinking
      } else if (Math.random() < stepDt * 40) puff(s.x, s.y, -s.vx * 0.08 + (Math.random() - .5) * 60, -s.vy * 0.08 + (Math.random() - .5) * 60, 0.25 + Math.random() * 0.25, 1.5 + Math.random() * 2, FIRE_COLS[(Math.random() * 4) | 0]);
      // a round that only just misses me whizzes by
      if (!s.mine && !s.whiz && playing && !me.dead && (s.kind === K.BULLET || s.kind === K.PELLET || s.kind === K.SHARD || s.kind === K.RAIL || s.kind === K.NAIL || s.kind === K.SPIKE) && now - whizAt > 120
          && segHit(s, me.x, me.y, binR(me.lv) + 140) && !segHit(s, me.x, me.y, binR(me.lv))) { s.whiz = true; whizAt = now; packPlay(s.kind === K.NAIL || s.kind === K.SPIKE ? "p_whiz_nail" : "p_whiz", 0.7, s.x, s.y); }
      // a rocket or an orb flying past roars by (yours too, once, as it leaves)
      if (!s.flyby && s.kind === K.ORB && playing && !me.dead && Math.hypot(s.x - me.x, s.y - me.y) < (s.mine ? 200 : 380)) {
        s.flyby = true; packPlay(s.kind === K.ORB ? "p_fly_orb" : "p_fly_rocket", s.mine ? 0.35 : 0.7, s.x, s.y);
      }

      if (s.kind === K.MINE && s.mine && !s.armedFx && SHOTS[K.MINE].life - s.life >= MINE_ARM) { s.armedFx = true; packPlay("p_arm_mine", 0.5, s.x, s.y); }   // my mine is armed
      // enemy fireball hits me (I decide, then report the shot id)
      const armed = s.kind !== K.MINE || SHOTS[K.MINE].life - s.life >= MINE_ARM;
      if (armed && canHurt(s, me, "me", s.kind === K.MINE) && targetHit(s, me) && (!pierces(s) || railOnce(s, "me"))) {
        if (!pierces(s)) s.life = 0;
        s.direct = "me";   // its blast (if any) spares me: I took the direct hit
        shotBurst(s);
        if (SHOTS[s.kind].shove) pelletShove(me, s, SHOTS[s.kind].shove);
        if (s.kind === K.BOLT || s.kind === K.LASER) boltChain(s, me.x, me.y, "me", now);
        if (s.kind === K.NAIL || s.kind === K.SPIKE) { if (now > (me.pinnedUntil || 0)) floaters.push({ x: me.x, y: me.y - 50, t: 0, txt: "PINNED", gold: false }); me.pinnedUntil = now + 1000; }
        hurtMe(s, now, shotDmg(s), s.kind, Math.atan2(s.vy, s.vx));
      }
      // someone else's bolt hitting a third pilot can still jump to me or my bots
      if ((s.kind === K.BOLT || s.kind === K.LASER) && !s.mine && !s.chained && s.life > 0) for (const [rid, r] of remotes) {
        if (r.inv || botById.has(rid) || !canHurt(s, r, rid)) continue;
        if (segHit(s, r.x, r.y, binR(r.lv))) { s.life = 0; boltChain(s, r.x, r.y, rid, now); break; }
      }
      // a shot reaches a bin flown in another browser: it ends here and they confirm the hit. Mine is predicted
      // (the hit marker waits for their word); a bot's or a third pilot's just bursts, so it neither hangs on its
      // target nor flies on through it and blows up somewhere it never reached on the victim's screen
      if (s.life > 0) for (const [rid, r] of remotes) {
        if (botById.has(rid)) continue;
        if (r.inv || !canHurt(s, r, rid)) continue;
        if (armed && targetHit(s, r)) {
          if (pierces(s)) { if (railOnce(s, rid)) { shotBurst(s); if (s.mine) predictHit(s, rid, r); else if (mySrvShot(s)) serverHitFx(s, rid, r); } continue; }
          s.life = 0; s.direct = rid; shotBurst(s); if (s.mine) predictHit(s, rid, r); else if (mySrvShot(s)) serverHitFx(s, rid, r);
          if ((s.kind === K.BOLT || s.kind === K.LASER) && s.mine) boltChain(s, r.x, r.y, rid, now);
          break;
        }
      }
    }
    while (myShotLog.length && now - myShotLog[0].at > 1200) myShotLog.shift();
  }
  // space junk: shot apart for points, or crashed into
  // space junk: little rocks that take a few hits, chipping and shrinking, then crack into drifting chunks.
  // Everyone sees the same shots hit them, so they wear down alike; the one whose shot breaks a rock reports it (+2).
  // Collisions exchange momentum with the bin; a hard knock also chips the rock.
  const rockWear = new Map();   // rock key -> damage taken, in fireballs
  const rockHp = k => 2 + Math.round((k.r - 22) / 18 * 3);   // 2 fireballs for the smallest, 5 for the biggest
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
    sfx("chunk", 0.7, 0.9, k.x, k.y) || blip(300, 0.2, "square");
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
  // the shared clock and the other pilots: extrapolated and eased toward their reported spots
  function updateRemotes(dt, now) {
    // shared clock: drift smoothly toward the average offset
    let offSum = 0, offN = 1;
    for (const r of remotes.values()) if (Number.isFinite(r.off)) { offSum += r.off; offN++; }
    clockTarget = clockBase + offSum / offN;
    clockOff += (clockTarget - clockOff) * Math.min(1, dt * 0.5);

    // remotes: extrapolate + ease toward reported spot
    for (const [rid, r] of remotes) {
      if (!botById.has(rid) && now - r.seen > 7000) { removeRemote(rid); continue; }
      if (serverRun && r.buf?.length) serverInterp(r);   // the server's pilots: between two of its snapshots
      else {
      const predict = now - r.seen < 250 ? dt : 0; // packet loss must not make a ghost fly through the whole map
      r.tx = clamp(r.tx + r.vx * predict, 0, W); r.ty = clamp(r.ty + r.vy * predict, 0, H);
      const corr = 1 - Math.exp(-12 * dt);
      r.x = clamp(r.x + r.vx * predict + (r.tx - (r.x + r.vx * predict)) * corr, 0, W);
      r.y = clamp(r.y + r.vy * predict + (r.ty - (r.y + r.vy * predict)) * corr, 0, H);
      r.a = lerpAng(r.a, r.ta, 1 - Math.exp(-14 * dt));
      }
      if (r.dead) continue;
      if (Math.abs(r.x - me.x) < vw / 2 + 300 && Math.abs(r.y - me.y) < vh / 2 + 300) { trailFrom(r, 0.6 + r.thrust * 1.4 + (r.boost || 0) * 1.5, dt); damageFx(r, dt); afterburner(r, r.boost || 0, dt); }
      // boop
      const dx = wrapD(me.x - r.x, W), dy = wrapD(me.y - r.y, H), d = Math.hypot(dx, dy);
      if (playing && !me.dead && d < 31 * (sizeOf(me.lv) + sizeOf(r.lv || 1)) && d > 0.01 && (!r.boop || now - r.boop > 400)) {
        r.boop = now;
        const rammed = (r.boost || 0) > 0, mineRam = me.boostFx > 0;
        const kick = boopKick(rammed, mineRam);   // (the server pushes a player's pilot the same way: updateBots)
        me.vx += dx / d * kick; me.vy += dy / d * kick;
        impact(me.x - dx / 2, me.y - dy / 2, "#bdfff6", 1.2);
        if (rammed || mineRam) { sparkShower(me.x - dx / 2, me.y - dy / 2, -dy, dx, 1.3); sparkShower(me.x - dx / 2, me.y - dy / 2, dy, -dx, 1.3); shake = Math.max(shake, 0.4); }
        sfx("ram", rammed ? 1 : 0.6);
        // they rammed me on boost: I take the damage and report it so they get the credit
        if (rammed && r.tag && !mates(r, me)) {
          const id = r.tag + ".ram" + Math.floor(now);
          if (hurt(now, r.boost === 2 ? 1.2 : 0.6)) {
            pushCapped(hitBy, id, 12);
            if (me.dead) { meKilled(id); killedBy(rid); }
          }
        }
      }
    }
  }
  // sparks, spilled stars, medkits and shields, Overdrive and weapon crates
  const magnet = () => 0;   // perk: pick-ups from further away from Lv 5
  function updatePickups(dt, now) {
    if (serverRun) { if (roundLive) serverPickups(now); return; }   // on the server, what I pick up is its call: shown at once, confirmed by its snapshots
    if (!roundLive) return;
    // sparks
    if (playing && !me.dead) {
      for (let i = 0; i < SLOTS; i++) {
        const s = world.sparks[i];
        if (grabbed.has(s.key) || s.age < 0.04) continue;
        if (Math.hypot(wrapD(s.x - me.x, W), wrapD(s.y - me.y, H)) < 22 + 30 * sizeOf(me.lv) + magnet()) {
          grabbed.add(s.key); pushCapped(myGrabs, s.key, 40);
          const val = s.gold ? 5 : 1;
          me.score += val;
          showScore();
          floaters.push({ x: s.x, y: s.y, t: 0, txt: "+" + val, gold: s.gold });
          gainXp(val, now);
          for (let k = 0; k < (s.gold ? 30 : 14); k++) {
            const a = Math.random() * 6.28, v = 60 + Math.random() * 200;
            puff(s.x, s.y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.6, 1.5 + Math.random() * 2, s.gold ? "#ffd36b" : "#ffffff");
          }
          audioCue("pickup");
        }
      }
    }
    // spilled stars
    for (const [id, d] of drops) {
      if (now - d.born > DROP_LIFE) { drops.delete(id); continue; }
      if (!playing || me.dead) continue;
      for (let j = 0; j < d.n; j++) {
        const st = dropStar(d, id, j, now);
        if (!st.ready || grabbed.has(st.key)) continue;
        if (Math.hypot(st.x - me.x, st.y - me.y) < 22 + 30 * sizeOf(me.lv) + magnet()) {
          grabbed.add(st.key); pushCapped(myGrabs, st.key, 40);
          me.score += 1; showScore();
          for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28; puff(st.x, st.y, Math.cos(a) * 120, Math.sin(a) * 120, 0.4, 1.8, "#ffe3f6"); }
          audioCue("pickup");
          gainXp(1, now);
        }
      }
    }
    // trophies: a dead pilot's gun, with its ammo
    for (const [id, d] of gunDrops) {
      if (now - d.born > GUN_DROP_LIFE) { gunDrops.delete(id); continue; }
      const key = "W" + id;
      if (WEAPONS[d.type]?.disabled || !playing || me.dead || grabbed.has(key) || now - d.born < 600 || Math.hypot(d.x - me.x, d.y - me.y) > 30 + 30 * sizeOf(me.lv) + magnet()) continue;
      grabbed.add(key); pushCapped(myGrabs, key, 40);
      const w = WEAPONS[d.type];
      me.arsenal[d.type] = Math.min(Number.isFinite(w.ammo) ? w.ammo * 2 : 1, (me.arsenal[d.type] || 0) + d.ammo);
      renderWeapon();
      floaters.push({ x: d.x, y: d.y - 20, t: 0, txt: "TROPHY · " + w.name.toUpperCase(), gold: true });
      for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 220; puff(d.x, d.y, Math.cos(a) * v, Math.sin(a) * v, 0.6, 2.2, k % 2 ? "#ffd36b" : w.col); }
      if (d.type === "nuke") packPlay("p_ut_nuke_pick", .9); else sfx("weapon_get", 0.9, 0.85);
    }
    // medkits and shields (left on the ground when they would do nothing, like in Doom)
    if (playing && !me.dead) {
      for (const c of world.supplies) {
        if (grabbed.has(c.key) || c.age < 0.05) continue;
        if (Math.hypot(c.x - me.x, c.y - me.y) > 26 + 30 * sizeOf(me.lv) + magnet()) continue;
        const sp = SUPPLIES[c.type];
        if (!applySupply(me, c.type)) continue;
        grabbed.add(c.key); pushCapped(myGrabs, c.key, 40);
        renderHearts(false); renderShield();
        floaters.push({ x: c.x, y: c.y - 20, t: 0, txt: sp.name, gold: !!sp.big });
        for (let k = 0; k < 26; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 200; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.6, 2.2, sp.col); }
        impacts.push({ x: c.x, y: c.y, t: 0, r: 70, col: sp.col });
        if (!sfx(sp.heal ? "heal" : "shield_get", 0.8)) [523, 784].forEach((f, j) => setTimeout(() => blip(f, 0.14, "triangle"), j * 70));
      }
    }
    // Overdrive
    if (playing && !me.dead && world.amp && !grabbed.has(world.amp.key) && Math.hypot(world.amp.x - me.x, world.amp.y - me.y) < 30 + 30 * sizeOf(me.lv) + magnet()) {
      const c = world.amp;
      grabbed.add(c.key); pushCapped(myGrabs, c.key, 40);
      me.ampUntil = now + AMP_TIME;
      announce("QUAD DAMAGE", "four times the damage for 20 seconds", "#6fa8ff", 4);
      for (let k = 0; k < 50; k++) { const a = Math.random() * 6.28, v = 100 + Math.random() * 300; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.8, 2.5, k % 2 ? "#5b9bff" : "#ffffff"); }
      rings.push({ x: c.x, y: c.y, t: 0, r: 260, col: "91,155,255", warp: true, dur: 0.6, w: 14 });
    }
    // a gun lying on its spot hums as you come near (once per approach)
    if (playing && !me.dead) for (const c of world.picks) {
      const d = Math.hypot(c.x - me.x, c.y - me.y), k = "h" + Math.round(c.x) + ":" + Math.round(c.y);
      if (d < 260 && !grabbed.has(c.key) && !spotHeard.has(k)) { spotHeard.add(k); packPlay("p_spot", 0.5, c.x, c.y); }
      else if (d > 520) spotHeard.delete(k);
    }
    // weapon crates
    if (playing && !me.dead) {
      for (const c of [...world.picks, ...world.bombs]) {
        if (grabbed.has(c.key) || c.age < (BOMB_CRATES[c.type] ? 0.01 : 0.05)) continue;
        if (Math.hypot(c.x - me.x, c.y - me.y) < 26 + 30 * sizeOf(me.lv) + magnet()) {
          grabbed.add(c.key); pushCapped(myGrabs, c.key, 40);
          const w = WEAPONS[c.type];
          if (c.type === "tele") {   // a tool, on its own key: it doesn't take a slot in the gun bar
            me.teleN = Math.max(me.teleN || 0, Math.min(6, (me.teleN || 0) + w.ammo)); renderTele();
            floaters.push({ x: c.x, y: c.y - 20, t: 0, txt: "TELEPORTER ×" + me.teleN + (COARSE ? "" : " · press T"), gold: true });
            for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 220; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.6, 2.2, w.col); }
            sfx("weapon_get", 0.8);
            continue;
          }
          const had = !!me.arsenal[c.type];   // a gun you already carry just gets more ammo; a new one joins the gun bar
          me.arsenal[c.type] = Math.min(w.ammo * 2, (me.arsenal[c.type] || 0) + w.ammo);
          renderWeapon();   // it goes into the gun bar; the gun in your hands stays until you switch
          const key = COARSE ? "" : " · press " + weaponKey(c.type);
          floaters.push({ x: c.x, y: c.y - 20, t: 0, txt: had ? "+AMMO " + w.name.toUpperCase() : w.name.toUpperCase() + key, gold: true });
          for (let k = 0; k < 30; k++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 220; puff(c.x, c.y, Math.cos(a) * v, Math.sin(a) * v, 0.6, 2.2, w.col); }
          if (!(c.type === "nuke" ? packPlay("p_ut_nuke_pick", .9) : sfx("weapon_get", 0.8))) [440, 660, 880].forEach((f, j) => setTimeout(() => blip(f, 0.1, "square"), j * 60));
        }
      }
    }
  }
  // particles, wreckage, fragments, flashes, rings, floating text
  function updateFx(dt, now) {
    // flying through smoke and sparks shoves them aside (faster = harder)
    const meSp = Math.hypot(me.vx, me.vy), pushR = 46 * sizeOf(me.lv), pushR2 = pushR * pushR, canPush = playing && !me.dead && meSp > 60;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt;
      if (canPush && p.k !== 1) {
        const dx = p.x - me.x, dy = p.y - me.y, d2 = dx * dx + dy * dy;
        if (d2 < pushR2 && d2 > 1) { const d = Math.sqrt(d2), v = meSp * 0.8 + 80; p.vx = dx / d * v + me.vx * 0.3; p.vy = dy / d * v + me.vy * 0.3; }
      }
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const damp = Math.pow(p.drag || (p.k === 2 ? 0.93 : 0.97), dt * 60);
      p.vx *= damp; p.vy *= damp;
      if (p.curl) { const c = Math.cos(p.curl * dt), s = Math.sin(p.curl * dt), vx = p.vx; p.vx = vx * c - p.vy * s; p.vy = vx * s + p.vy * c; }   // an arc
      if (p.k === 8 && Math.random() < (lowQ ? 25 : 60) * dt) {   // a burning chunk leaves fire and smoke behind it
        const f = p.life / p.max;
        if (Math.random() < 0.65 * f + 0.15) puff(p.x, p.y, p.vx * 0.15 + (Math.random() - 0.5) * 30, p.vy * 0.15 + (Math.random() - 0.5) * 30, 0.25 + Math.random() * 0.2, (5 + Math.random() * 4) * (0.5 + f), "fire", 4, 0, 0, 0.9, 0.2 + (1 - f) * 0.3);
        else puff(p.x, p.y, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.8 + Math.random() * 0.6, 3 + Math.random() * 3, SMOKE_COLS[1], 2, 0, 0, 0.94, 0.3);
      }
    }
    const partCap = lowQ ? MAX_PARTS / 3 : MAX_PARTS;
    if (parts.length > partCap) parts.splice(0, parts.length - partCap);
    updateMelts(dt);
    for (let i = hulks.length - 1; i >= 0; i--) {
      const h = hulks[i];
      h.life -= dt;
      if (h.life <= 0) { hulks.splice(i, 1); continue; }
      const drag = Math.exp(-0.015 * dt);   // space: practically no drag
      if (h.pin) {   // nailed to rock: it rides along with it
        if (h.pin.b && (h.pin.b.dead || !bodies.includes(h.pin.b))) h.pin = null;
        else if (h.pin.b) {
          [h.x, h.y] = toWorld(h.pin.b, h.pin.lx, h.pin.ly); h.a = h.pin.a + h.pin.b.a;
          h.nailA = h.pin.nailA + h.pin.b.a;
          const [tx, ty] = toWorld(h.pin.b, h.pin.tx, h.pin.ty);
          if (!solidAt(h.pin.b, tx, ty)) { h.vx = h.pin.b.vx || 0; h.vy = h.pin.b.vy || 0; h.pin = null; }
        }
        if (h.pin) h.vx = h.vy = 0;
      } else {
        const oldX = h.x, oldY = h.y;
        h.x += h.vx * dt; h.y += h.vy * dt; h.vx *= drag; h.vy *= drag; h.a += h.spin * dt;
        if (h.nailA !== undefined) {   // flying on along the nail: the first rock (or the fence) it meets, it is pinned to
          const tip = 30 * sizeOf(h.lv), dx = Math.cos(h.nailA) * tip, dy = Math.sin(h.nailA) * tip;
          const hit = shotBody({ px: oldX + dx, py: oldY + dy, x: h.x + dx, y: h.y + dy });
          if (hit) {
            const rb = hit.b; h.x = hit.x - dx; h.y = hit.y - dy;
            const [lx, ly] = toLocal(rb, h.x, h.y), [tx, ty] = toLocal(rb, hit.x, hit.y);
            h.pin = { b: rb, lx, ly, tx, ty, a: h.a - rb.a, nailA: h.nailA - rb.a }; h.vx = h.vy = 0;
            sparkShower(hit.x, hit.y, -Math.cos(h.nailA), -Math.sin(h.nailA), 1); packPlay("p_hit_nail", 0.8, hit.x, hit.y);
          }
          else if (h.x < 40 || h.x > W - 40 || h.y < 40 || h.y > H - 40) { h.x = clamp(h.x, 40, W - 40); h.y = clamp(h.y, 40, H - 40); h.pin = { b: null }; }
        } else bounceOff(h, 30 * sizeOf(h.lv), 0.8);
      }
      if (h.burn) {   // burning: flames lick up off it, then it crumbles to ash
        const bt = (now - h.burn) / 1000, sz1 = sizeOf(h.lv);
        if (bt >= 0 && bt < 3.2 && Math.random() < (lowQ ? 20 : 50) * dt) puff(h.x + (Math.random() - 0.5) * 50 * sz1, h.y + (Math.random() - 0.5) * 50 * sz1, (Math.random() - 0.5) * 40, -60 - Math.random() * 80, 0.5 + Math.random() * 0.4, 3 + Math.random() * 4, FIRE_COLS[(Math.random() * 4) | 0]);
        if (bt > 3.4 && !h.ashed) { h.ashed = true; for (let k = 0; k < (lowQ ? 20 : 50); k++) { const a = Math.random() * 6.28, v = 30 + Math.random() * 120; puff(h.x, h.y, Math.cos(a) * v, Math.sin(a) * v, 1.2 + Math.random(), 2 + Math.random() * 3, k % 2 ? "rgb(60,56,62)" : "rgb(120,112,110)", 2); } }
      }
      if (h.x < 40 || h.x > W - 40) { h.vx = -h.vx; h.x = clamp(h.x, 40, W - 40); }
      if (h.y < 40 || h.y > H - 40) { h.vy = -h.vy; h.y = clamp(h.y, 40, H - 40); }
      const sz = sizeOf(h.lv);
      const hAge = (now - h.born) / 1000;
      if (hAge < 15 && Math.random() < (lowQ ? 6 : 14) * dt) puff(h.x + (Math.random() - 0.5) * 40 * sz, h.y + (Math.random() - 0.5) * 40 * sz, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 1.6, 4 + Math.random() * 4, "rgb(52,46,64)", 2);
      if (h.zap && hAge < 2.8) {
        if (Math.random() < 10 * dt) { const a = Math.random() * 6.28, v = 150 + Math.random() * 300; puff(h.x, h.y, Math.cos(a) * v, Math.sin(a) * v, 0.25 + Math.random() * 0.3, 1 + Math.random(), Math.random() < 0.5 ? "#bfefff" : "#ffffff", 1, 0.05); }
        if (Math.random() < 3 * dt) { impact(h.x + (Math.random() - 0.5) * 40 * sz, h.y + (Math.random() - 0.5) * 40 * sz, "#9fe8ff", 0.5); sfx("laser", 0.25, 2 + Math.random(), h.x, h.y); }
      } else if (hAge < 6 && Math.random() < 2.5 * dt) impact(h.x + (Math.random() - 0.5) * 50 * sz, h.y + (Math.random() - 0.5) * 50 * sz, "#ff9a2e", 0.5);
      // it is solid: bump off it
      const dx = me.x - h.x, dy = me.y - h.y, d = Math.hypot(dx, dy);
      if (playing && !me.dead && d > 0.01 && d < 31 * (sizeOf(me.lv) + sz) && (!h.bump || now - h.bump > 300)) {
        h.bump = now;
        const push = Math.max(160, Math.hypot(me.vx, me.vy) * 0.8);
        me.vx += dx / d * 260; me.vy += dy / d * 260; h.vx -= dx / d * push; h.vy -= dy / d * push; h.spin += (Math.random() - 0.5) * 2;
        impact(me.x - dx / 2, me.y - dy / 2, "#d9c8ff", 1.2);
        if (push > 300) sparkShower(me.x - dx / 2, me.y - dy / 2, -dy, dx, 0.8);
        sfx("crash", 0.6) || blip(180, 0.15, "square");
      }
    }
    for (let i = frags.length - 1; i >= 0; i--) {
      const f = frags[i];
      f.life -= dt;
      if (f.life <= 0) { frags.splice(i, 1); continue; }
      const drag = Math.exp(-0.015 * dt);
      f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= drag; f.vy *= drag; f.a += f.spin * dt;
      // you can shove the pieces around
      const fdx = f.x - me.x, fdy = f.y - me.y, fd = Math.hypot(fdx, fdy), fr = 30 * sizeOf(me.lv) + f.s * 0.3;
      if (playing && !me.dead && fd < fr && fd > 0.01 && (!f.bump || now - f.bump > 250)) {
        f.bump = now;
        const push = Math.max(140, Math.hypot(me.vx, me.vy) * 0.9);
        f.vx += fdx / fd * push; f.vy += fdy / fd * push; f.spin += (Math.random() - 0.5) * 3;
        impact((f.x + me.x) / 2, (f.y + me.y) / 2, "#d9c8ff", 0.7);
      }
      bounceOff(f, f.s * 0.25, 0.8);
      if (f.x < 0 || f.x > W) { f.vx = -f.vx; f.x = clamp(f.x, 0, W); }
      if (f.y < 0 || f.y > H) { f.vy = -f.vy; f.y = clamp(f.y, 0, H); }
      if ((now - f.born) / 1000 < 4 && Math.random() < (lowQ ? 3 : 8) * dt) puff(f.x, f.y, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 1.4, 3 + Math.random() * 3, "rgb(60,54,72)", 2);
    }
    for (const s of shots) {
      if (s.life <= 0 || SHOTS[s.kind].inert || s.kind === K.MINE) continue;
      for (const o of hulks) if (segHit(s, o.x, o.y, 34 * sizeOf(o.lv)) && (!pierces(s) || railOnce(s, o))) { const pk = pierces(s) ? 0.03 : 0.08; o.vx += s.vx * pk; o.vy += s.vy * pk; o.spin += (Math.random() - 0.5); if (!pierces(s)) s.life = 0; impact(s.x, s.y, "#d9c8ff", 0.8); break; }
      if (s.life <= 0) continue;
      for (const o of frags) if (segHit(s, o.x, o.y, o.s * 0.3)) { o.vx += s.vx * 0.12; o.vy += s.vy * 0.12; o.spin += (Math.random() - 0.5) * 2; s.life = 0; impact(s.x, s.y, "#d9c8ff", 0.6); break; }
    }
    // wreckage drifts (almost no drag in space), spins, bounces off the fence, smoulders at first
    const drift = Math.exp(-0.015 * dt);
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life -= dt;
      if (d.life <= 0) { debris.splice(i, 1); continue; }
      d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= drift; d.vy *= drift; d.rot += d.vr * dt;
      bounceOff(d, 4, 0.8);
      if (d.x < 0 || d.x > W) { d.vx = -d.vx; d.x = clamp(d.x, 0, W); }
      if (d.y < 0 || d.y > H) { d.vy = -d.vy; d.y = clamp(d.y, 0, H); }
      const ddx = d.x - me.x, ddy = d.y - me.y, dd = Math.hypot(ddx, ddy);
      if (playing && !me.dead && dd < 34 * sizeOf(me.lv) && dd > 0.01) { const pv = Math.max(120, Math.hypot(me.vx, me.vy)); d.vx = ddx / dd * pv; d.vy = ddy / dd * pv; d.vr += (Math.random() - 0.5) * 4; }
      if ((now - d.born) / 1000 < 3 && Math.random() < (lowQ ? 1 : 3) * dt) puff(d.x, d.y, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 1.2, 2 + Math.random() * 2, "rgb(80,72,98)", 2);
    }
    for (let i = impacts.length - 1; i >= 0; i--) { impacts[i].t += dt; if (impacts[i].t > (impacts[i].dur || 0.22)) impacts.splice(i, 1); }
    for (let i = beams.length - 1; i >= 0; i--) { beams[i].t += dt; if (beams[i].t > (beams[i].duration || (beams[i].pistol ? .12 : BEAM_T))) beams.splice(i, 1); }
    for (let i = lasers.length - 1; i >= 0; i--) { lasers[i].t += dt; if (lasers[i].t > (lasers[i].shock ? 0.35 : LASER_T)) lasers.splice(i, 1); }
    for (let i = arcs.length - 1; i >= 0; i--) { arcs[i].t += dt; if (arcs[i].t > 0.3) arcs.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > (rings[i].dur || 0.6)) rings.splice(i, 1); }
    waveTick(dt);
    for (let i = booms.length - 1; i >= 0; i--) { booms[i].t += dt; if (booms[i].t > BOOM_LIFE) booms.splice(i, 1); }
    flash = Math.max(0, flash - dt * 1.4);
    for (let i = floaters.length - 1; i >= 0; i--) { floaters[i].t += dt; if (floaters[i].t > 1) floaters.splice(i, 1); }
  }
  // my state (and my bots') out to everyone, at the transport's rate; the scoreboard twice a second
  function netSend(dt, now) {
    const elapsed = Math.max(dt, Math.min(0.25, (now - lastNetTick) / 1000)); lastNetTick = now;
    sendAcc += elapsed; slowAcc += elapsed;
    if (playing && !serverRun && sendAcc >= 1 / net.hz) {   // on the server only my controls go out (12c-server.js)
      sendAcc %= 1 / net.hz;   // keep the remainder: frames don't divide the interval evenly, and dropping it sent 7.5 a second for 8
      const msg = {
        q: ++sendSeq, mc: matchReady ? [matchRound, matchStart, matchEnd] : undefined, rd: stats.round, hb: hitBy, ko: koBy, ts: Date.now(), x: Math.round(me.x), y: Math.round(me.y),
        vx: Math.round(me.vx), vy: Math.round(me.vy), a: +me.a.toFixed(2),
        t: me.thrust > 0.3 ? 1 : 0, b: me.boostFx, d: me.dead ? 1 : 0, i: now < me.inv ? 1 : 0, ds: me.dead ? me.ds : 0,
        dk: me.dead ? me.dk : 0, da: me.dead ? +me.da.toFixed(2) : 0, tm: me.tm ?? -1,   // the team rides every message: shots need it
        td: Number.isFinite(me.tdir) ? +me.tdir.toFixed(2) : undefined   // which way I push (the jets show it)
      };
      const slow = {
        tm: me.tm ?? -1, fc: me.fc ?? -1, cp: [stats.round, me.caps || 0], pg: Math.round(myPing / 10) * 10, bc: bots.length ? [bots.length, bots[0].level] : 0,
        tg: myTag, n: me.name, h: me.hue, ck: me.ck, s: me.score, l: Math.round(me.lives * 100) / 100, am: me.ampUntil > now ? 1 : 0, lv: me.lv, sh: Math.round(me.shield * 100) / 100, wp: WEAPON_KEYS.indexOf(me.weapon), g: myGrabs, hb: hitBy, ko: koBy,
        st: [stats.round, stats.kills, stats.deaths, stats.shots, stats.hits, stats.best],
        // Keep live deltas within the packet budget; rolling terrain snapshots repair older holes.
        cv: myCarves.filter(e => performance.now() - e.at < 4000).slice(-128).map(e => e.d),
        dr: myDrops.filter(d => Date.now() - d[4] < DROP_LIFE).slice(-3).map(d => d.slice(0, 4)),
        wd: myGunDrops.filter(d => Date.now() - d[5] < GUN_DROP_LIFE).slice(-3).map(d => d.slice(0, 5))
      };
      const sig = JSON.stringify(slow);
      if ((sig !== lastSlow && slowAcc >= 0.1) || slowAcc >= 1) { Object.assign(msg, slow); lastSlow = sig; slowAcc = 0; }
      // always send the list when shots ride in the state, even empty: the Claude room merges presence
      // field by field, so an omitted "f" would keep old shots there forever and they could come back as ghosts
      if (net.shotsInState) msg.f = myShotLog.slice(-24).map(e => e.d);
      if (guided || now < guideOutUntil) msg.gw = guideOut;   // my guided nuke's course (and where it blew)
      if (bots.length) {
        const bs = botStates(now);
        if (standalone) msg.bots = bs;   // the Claude room's presence is too small for bots: they stay local there
      }
      const terrain = nextTerrain();
      if (terrain) msg.terrain = terrain;
      msg.rk = nextRockMotion();
      net.send(msg);
    }
    boardAcc += dt;
    if (boardAcc > 0.5) { boardAcc = 0; renderBoard(); renderFeed(); }
  }
  // one simulation step. The order matters: controls, then the world moves, then shots resolve against where
  // everything is now, then the rest reacts, and last what happened goes out over the network
  function update(dt, now) {
    ampHud(now);
    metricTick(dt);
    const kd = Math.exp(-14 * dt); camKick.x *= kd; camKick.y *= kd;
    hurtFlash = Math.max(0, hurtFlash - dt * 2.2);
    const { im, boost } = steerAndShoot(dt, now);
    bodyTick(now, dt);
    flyMe(dt, now, im, boost);
    if (serverRun) { serverTrack(dt, now); sendControls(); }
    recordHitPose(me, now);
    updateShots(dt, now);
    if (playing) reconcileWeapons(now);
    updateJunk(dt, now);
    updateEvents(dt, now);
    updateBots(dt, now);
    continuousAudioTick(now);
    ctfTick(now);
    updateRemotes(dt, now);
    updatePickups(dt, now);
    updateFx(dt, now);
    audioTick(now);
    netSend(dt, now);
  }

  const boardEl = document.getElementById("board");
  // everyone's numbers for the current round (others' come from their latest state)
  function playerRows() {
    const rows = [{ name: me.name || "You", hue: me.hue, me: true, ping: myPing, score: me.score, kills: stats.kills, deaths: stats.deaths, shots: stats.shots, hits: stats.hits, best: stats.best, tm: me.tm, caps: me.caps || 0 }];
    for (const b of bots) rows.push({ name: b.name, hue: b.hue, ping: 0, score: b.st.kills * 5, ...b.st, tm: b.tm, caps: b.caps || 0 });
    for (const [id, r] of remotes) {
      if (botById.has(id)) continue;
      const st = r.st && r.st[0] === stats.round ? r.st : [0, 0, 0, 0, 0, 0];
      rows.push({ name: r.name, hue: r.hue, ping: r.ping, score: r.st && r.st[0] === stats.round ? r.score : 0, kills: st[1], deaths: st[2], shots: st[3], hits: st[4], best: st[5], tm: r.tm, caps: r.cpRound === stats.round ? r.caps || 0 : 0 });
    }
    return rows;
  }
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const acc = r => r.shots ? Math.min(100, Math.round(r.hits / r.shots * 100)) : 0;
  function teamWinLine() {
    if (!isTeams()) return "";
    const t = teamTotals(), flags = MODES[MODE].flags, sc = i => flags ? t.c[i] + " flags, " + t.k[i] + " kills" : t.k[i] + " kills";
    if (!t.lead) return "A draw · " + sc(0) + " each side";
    const w = t.lead > 0 ? 0 : 1;
    return `<span style="color:${TEAM_HEX[w]}">${TEAM_NAME[w]} team wins</span> · ${sc(w)} to ${sc(1 - w)}`;
  }
  const comparePlayers = (a, b) => (MODES[MODE].flags ? b.caps - a.caps : 0) || b.kills - a.kills || a.deaths - b.deaths;
  function showResults(roundNo) {
    const rows = playerRows().sort(comparePlayers);
    const top = rows[0], tied = rows.length > 1 && comparePlayers(rows[0], rows[1]) === 0;
    const shooters = rows.filter(r => r.shots >= 10);
    const pick = (list, f) => list.length ? list.reduce((a, b) => f(b) > f(a) ? b : a) : null;
    const awards = [
      ["Most kills", pick(rows, r => r.kills), r => r.kills + " kills"],
      ["Sharpshooter", pick(shooters, r => acc(r)), r => acc(r) + "% of shots hit"],
      ["Stormtrooper", shooters.length > 1 ? pick(shooters, r => -acc(r)) : null, r => "only " + acc(r) + "% hit"],
      ["Untouchable", rows.length > 1 ? pick(rows, r => -r.deaths) : null, r => r.deaths + " deaths"],
      ["Rampage", pick(rows, r => r.best), r => r.best + " kills in a row"],
      ["Kamikaze", rows.length > 1 ? pick(rows, r => r.deaths) : null, r => r.deaths + " deaths"]
    ].filter(([, who]) => who);
    const card = document.getElementById("resultsCard");
    card.innerHTML = `<h2>Round ${roundNo} over</h2>
      <div class="winner">${teamWinLine() || (top.kills ? tied ? "Draw · " + top.kills + " kills" : "Winner: " + esc(top.name) + " · " + top.kills + " kills" : "Nobody scored a kill")}</div>
      <table><thead><tr><th>Pilot</th><th>Kills</th><th>Deaths</th>${MODES[MODE].flags ? "<th>Flags</th>" : ""}<th>Points</th><th>Accuracy</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="${r.me ? "me" : ""}"><td${isTeams() && onTeam(r) ? ` style="color:${TEAM_HEX[r.tm]}"` : ""}>${esc(r.name)}${r.me ? " (you)" : ""}</td><td>${r.kills}</td><td>${r.deaths}</td>${MODES[MODE].flags ? `<td>${r.caps}</td>` : ""}<td>${r.score}</td><td>${r.shots ? acc(r) + "%" : "–"}</td></tr>`).join("")}
      </tbody></table>
      <div class="awards">${awards.map(([title, who, why]) => `<div class="award"><b>${title}</b><span>${esc(who.name)}</span><small>${why(who)}</small></div>`).join("")}</div>
      <div class="next" id="nextRound"></div>`;
    document.getElementById("results").hidden = false;
  }

  // round bookkeeping, run every frame
  let shownRound = -1, resultsFor = -1, resultsAt = 0, preparedFor = -1;
  // the round is over: the announcer tells you how it went (only when someone else took part)
  function roundEndVoice() {
    const rows = playerRows();
    if (rows.length < 2) return;
    rows.sort(comparePlayers);
    if (isTeams() ? teamTotals().lead === 0 : comparePlayers(rows[0], rows[1]) === 0) return;
    const top = rows[0];
    const won = isTeams() ? (teamTotals().lead || 0) * (me.tm === 0 ? 1 : -1) > 0 : top.me && stats.kills > 0;
    setTimeout(() => { const line = won ? (stats.deaths === 0 ? "v_flawless" : "v_win") : "v_lose"; packPlay(line, 1) || sfx(line, 1); }, 600);
  }
  let decidedRound = -1;
  // the best score in the lobby, in the unit the limit counts: kills, team kills, or flags
  function leaderScore() {
    if (isTeams()) { const t = teamTotals(); return MODES[MODE].flags ? Math.max(...t.c) : Math.max(...t.k); }
    return Math.max(0, ...playerRows().map(r => r.kills));
  }
  function roundTick(now) {
    const rd = roundAt(clockNow());
    if (!matchReady) { roundLive = false; document.getElementById("roundInfo").textContent = "Waiting for host…"; return; }
    if (rd.idx !== stats.round) {
      // a new round: everyone starts from scratch
      Object.assign(stats, { round: rd.idx, kills: 0, deaths: 0, shots: 0, hits: 0, streak: 0, best: 0 });
      if (shownRound !== -1 && playing) {
        me.score = 0; showScore(); me.xp = 0; me.lv = 1; renderLevel();
        baseArsenal(); me.ampUntil = 0; renderWeapon();
        me.dead = false; me.respawnAt = 0; me.lives = maxLivesOf(1); clearArmor(me); renderShield(); renderHearts(false); me.inv = now + 2000;
        floaters.push({ x: me.x, y: me.y - 90, t: 0, txt: "ROUND " + (rd.idx - (firstRoundIdx ?? rd.idx) + 1) + " · FIGHT!", gold: true });
        sfx("v_fight", 1);
      }
      for (const b of bots) resetCmds(b);
      for (const b of bots) Object.assign(b, { st: { kills: 0, deaths: 0, shots: 0, hits: 0, streak: 0, best: 0 }, lives: LIVES, shield: 0, beltArmor: 0, bodyArmor: 0, padsArmor: 0, lv: 1, xp: 0, vx: 0, vy: 0, ammo: 0, dead: false, ...spawnPoint(b.tm), inv: now + 2000, fc: -1, caps: 0, weapon: "fire" });
      for (const b of bots) if (b.input) pilotArm(b);
      me.fc = -1; me.caps = 0; me.heat = 0; me.overheat = false; railCharge = 0; charge = 0; cancelRocketLoad();
      energy = 100; energyRegenAt = 0; dashReadyAt = 0; lungeReady = 0;
      flagWas = ["", ""]; flagHeld.fill(null); flagCarrier.fill(null);
      grabbed.clear(); myGrabs.length = 0; drops.clear(); gunDrops.clear(); myDrops.length = 0; myGunDrops.length = 0;
      hulks.length = 0; frags.length = 0; debris.length = 0; melts.length = 0;
      if (shownRound !== -1) {
        myCarves.length = 0; seenCarves.clear(); buildPlanets(worldCode);
        // Respawn after rebuilding: a repaired planet must not enclose a pilot in its old tunnel.
        Object.assign(me, spawnPoint(me.tm), { vx: 0, vy: 0 });
        if (serverRun) srv.placed = false;   // on the server, the server says where (serverSelf)
        for (const b of bots) Object.assign(b, spawnPoint(b.tm), { nav: null, navAt: 0, patrol: null, dashReq: false });
      }
      firstBlood = false; streaks.clear(); multi = 0;
      me.hitHistory = []; for (const b of bots) b.hitHistory = [];
      credited.clear(); botCredited.clear(); killSeen.clear(); ufoHits.clear(); pendingHitFx.clear();
      rockMotion.clear();
      hitBy.length = 0; koBy.length = 0; myShotLog.length = 0; shots.length = 0; seenShots.clear();
      for (const b of bots) { b.hitBy.length = 0; b.koBy.length = 0; b.shotLog.length = 0; }
      slowAcc = 1; lastSlow = "";
      shownRound = rd.idx;
      document.getElementById("results").hidden = true;
    }
    // the score limit: once someone (or a team) reaches it, the round is decided; results show until the next one
    if (rd.live && SCORE_LIMIT && decidedRound !== rd.idx && leaderScore() >= SCORE_LIMIT) {
      decidedRound = rd.idx; matchEnd = clockNow(); rd.next = ROUND_BREAK;
      announce("ROUND DECIDED", "score limit " + SCORE_LIMIT + " reached", "#ffd36b", 2);
    }
    const live = rd.live && decidedRound !== rd.idx;
    if (roundLive && !live) { shots.length = 0; guided = null; }
    roundLive = live;
    const info = document.getElementById("roundInfo");
    if (live) {
      const remaining = Math.ceil(rd.left), m = Math.floor(remaining / 60), sec = remaining % 60;
      if (firstRoundIdx === null) firstRoundIdx = rd.idx;
      info.textContent = "Round " + (rd.idx - firstRoundIdx + 1) + " · " + m + ":" + String(sec).padStart(2, "0") + (SCORE_LIMIT ? " · first to " + SCORE_LIMIT : "");
      info.classList.toggle("last", rd.left < 30);
    } else {
      info.textContent = "Results · next round in " + Math.ceil(rd.next) + "s";
      if (playing && resultsFor !== rd.idx) roundEndVoice();
      if (playing && rd.next < 2.6 && preparedFor !== rd.idx) { preparedFor = rd.idx; sfx("v_prepare", 1); }
      // refresh once a second so late state updates from other pilots still land in the table
      if (playing && (resultsFor !== rd.idx || now - resultsAt > 1000)) { resultsFor = rd.idx; resultsAt = now; showResults(rd.idx - (firstRoundIdx ?? rd.idx) + 1); }
      const nx = document.getElementById("nextRound");
      if (nx) nx.textContent = "Next round in " + Math.ceil(rd.next) + " s";
    }
  }
  // team totals: kills, and flags captured
  function teamTotals() {
    const k = [0, 0], c = [0, 0];
    for (const r of playerRows()) if (onTeam(r)) { k[r.tm] += r.kills; c[r.tm] += r.caps; }
    return { k, c, lead: MODES[MODE].flags ? (c[0] - c[1] || k[0] - k[1]) : k[0] - k[1] };
  }
  function renderBoard() {
    const rows = playerRows();
    rows.sort(comparePlayers);
    const shown = rows;
    const team = [];
    if (isTeams()) {   // the two teams first: kills, or captures in CTF
      const t = teamTotals(), flags = MODES[MODE].flags;
      for (const i of [0, 1]) {
        const li = document.createElement("li"); li.className = "team";
        const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = TEAM_NAME[i] + " team"; nm.style.color = TEAM_HEX[i];
        const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = flags ? t.c[i] + " flags · " + t.k[i] : String(t.k[i]);
        li.append(nm, pts); team.push(li);
      }
    }
    boardEl.replaceChildren(...team, ...shown.map(r => {
      const li = document.createElement("li"); if (r.me) li.className = "me";
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = r.name; nm.style.color = isTeams() && onTeam(r) ? TEAM_HEX[r.tm] : `hsl(${r.hue} 90% 80%)`;
      const pts = document.createElement("span"); pts.className = "pts"; pts.textContent = (MODES[MODE].flags ? r.caps + " flags · " : "") + r.kills + " / " + r.deaths + " · " + r.score + " pts";
      if (r.ping) { const pg = document.createElement("small"); pg.className = "pg " + (r.ping < 90 ? "good" : r.ping < 180 ? "ok" : "bad"); pg.textContent = Math.round(r.ping) + "ms"; nm.append(" ", pg); }
      li.append(nm, pts); return li;
    }));
  }

