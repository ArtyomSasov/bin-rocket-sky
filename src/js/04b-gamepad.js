  // ---------- gamepad ----------
  // A standard pad (Xbox / PlayStation layout): the left stick flies, the right stick aims (the nose keeps its last
  // aim for a moment after the stick is let go, then follows the flight again), the right trigger fires, the left
  // trigger is the second mode, A (cross) boosts when held and dashes when tapped, B (circle) brakes, the bumpers
  // switch guns, and Start opens the settings. Picking it up hides the mouse aim until the mouse moves again
  const PAD_DEAD = 0.18, PAD_AIM = 0.35;
  const pad = { on: false, x: 0, y: 0, aim: 0, aimUntil: 0, fire: false, alt: false, braking: false, prev: [] };
  const padAxis = v => Math.abs(v) < PAD_DEAD ? 0 : (v - Math.sign(v) * PAD_DEAD) / (1 - PAD_DEAD);
  function padPoll(now) {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected && g.mapping === "standard") || [...navigator.getGamepads()].find(g => g && g.connected) : null;
    if (!gp) { if (pad.on) { pad.on = pad.fire = pad.alt = false; pad.x = pad.y = 0; if (pad.braking) { keys.delete("KeyX"); pad.braking = false; } if (boostBtnDown && pad.boosting) { boostBtnDown = false; pad.boosting = false; } } return; }
    const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.3)), was = i => !!pad.prev[i], pressed = i => b(i) && !was(i);
    const lx = padAxis(gp.axes[0] || 0), ly = padAxis(gp.axes[1] || 0), rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
    const any = lx || ly || Math.hypot(rx, ry) > PAD_AIM || gp.buttons.some(x => x && x.pressed);
    if (any && !pad.on) { pad.on = true; ptr.moved = false; }   // (the pad took over: no mouse aim till the mouse moves)
    if (!pad.on) return;
    pad.x = lx; pad.y = ly;
    if (Math.hypot(rx, ry) > PAD_AIM) { pad.aim = Math.atan2(ry, rx); pad.aimUntil = now + 900; }
    pad.fire = b(7); pad.alt = b(6);
    if (pressed(0)) { boostBtnDown = true; pad.boosting = true; boostDownAt = now; dash(now); }   // A: tap to dash, hold to boost
    else if (!b(0) && pad.boosting) { boostBtnDown = false; pad.boosting = false; }
    if (b(1) && !pad.braking) { keys.add("KeyX"); pad.braking = true; } else if (!b(1) && pad.braking) { keys.delete("KeyX"); pad.braking = false; }
    if (playing && pressed(5)) cycleWeapon(1);
    if (playing && pressed(4)) cycleWeapon(-1);
    if (playing && pressed(9)) document.getElementById("gearBtn")?.click();
    pad.prev = gp.buttons.map(x => !!(x && (x.pressed || x.value > 0.3)));
  }
