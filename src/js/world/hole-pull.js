  // a black hole on my bin: pulled in ~ 1/d^2, and swallowed at the horizon
  function holeOnMe(bh, dt, now) {
      const dx = bh.x - me.x, dy = bh.y - me.y, d = Math.hypot(dx, dy) || 1;
      // pull ~ 1/d^2: drifting is fine far out, under ~200 px only a boost gets you out, under ~140 px nothing does
      if (d < holeReach(bh)) {
        const acc = holeAcc(bh, d);
        me.vx += dx / d * acc * dt; me.vy += dy / d * acc * dt;
      }
      if (bh.s && !serverRun) {   // a void bomb's hole burns me as it drags me in (on the server, the server deals it)
        me.voidBurn = (me.voidBurn || 0) + voidBurn(bh, d, dt);
        if (me.voidBurn >= VOID_BURN.bite) { const n = me.voidBurn; me.voidBurn = 0; hurtMe(bh.s, now, n, K.VOID); if (me.dead) return; }
      }
      if (d < 60 * bh.k) {
        floaters.push({ x: me.x, y: me.y - 60, t: 0, txt: "Swallowed!", gold: false });
        for (let k = 0; k < 60; k++) { const b = Math.random() * 6.28; puff(me.x, me.y, Math.cos(b) * 300, Math.sin(b) * 300, 0.9, 2.6, k % 2 ? "#c38bff" : "#ffffff"); }
        if (bh.s && !serverRun) { hurtMe(bh.s, now, 99 / (bh.s.mine ? SELF_DMG : 1), K.VOID, 0, true); return; }   // (its thrower's kill)
        hurt(now, 99, true);   // the horizon ignores dash invulnerability
        feedPush(`<span class="v">${esc(me.name || "You")}</span> was swallowed by the black hole`, true);
      }
  }
