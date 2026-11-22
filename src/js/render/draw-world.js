  function drawEdgeArrow(x, y, col) {
    const cx = vw / 2, cy = vh / 2, dx = x - cx, dy = y - cy;
    const m = 40, t = Math.min((cx - m) / Math.abs(dx || 1e-6), (cy - m) / Math.abs(dy || 1e-6));
    g.save(); g.translate(cx + dx * t, cy + dy * t); g.rotate(Math.atan2(dy, dx));
    g.fillStyle = col; g.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 150);
    g.beginPath(); g.moveTo(16, 0); g.lineTo(-10, -11); g.lineTo(-4, 0); g.lineTo(-10, 11); g.closePath(); g.fill();
    g.restore(); g.globalAlpha = 1;
  }

  // space junk (behind the planets)
  function drawJunk(now) {
    for (let i = 0; i < ROCKS; i++) {
      const k = world.rocks[i];
      if (grabbed.has(k.key)) continue;
      const x = sx(k.x), y = sy(k.y);
      if (onScreen(x, y, 50)) drawRock(k, x, y);
    }
  }
  // spilled stars, weapon crates, medkits and shields, Overdrive, the nuke, sparks
  function drawPad(c, col, icon, now) {
    const x = sx(c.x), y = sy(c.y), taken = grabbed.has(c.key);
    if (!onScreen(x, y, 60)) return;
    g.save();
    g.globalAlpha = taken ? 0.6 : 0.3; g.strokeStyle = col; g.lineWidth = 2;
    g.setLineDash([5, 7]); g.beginPath(); g.arc(x, y, 34, 0, 6.29); g.stroke(); g.setLineDash([]);
    if (taken) {
      g.lineWidth = 4; g.beginPath(); g.arc(x, y, 34, -Math.PI / 2, -Math.PI / 2 + 6.283 * (1 - c.wait / c.P)); g.stroke();
      g.globalAlpha = 0.4; g.fillStyle = col;
      g.save(); g.translate(x - 10, y - 12); g.scale(20 / 24, 20 / 24); g.fill(ICON_PATHS[icon], "evenodd"); g.restore();
      g.globalAlpha = 0.85; g.font = `700 ${12 * TS}px ` + DISPLAY_FONT; g.textAlign = "center"; g.fillText(Math.ceil(c.wait) + "s", x, y + 50);
    }
    g.restore();
  }
  function drawPickups(now) {
    for (const p of arena.pads) {   // boost pads: a glowing ring with chevrons running its way
      const x = sx(p.x), y = sy(p.y);
      if (!onScreen(x, y, 120)) continue;
      g.save(); g.translate(x, y); g.rotate(p.a);
      const pg = g.createRadialGradient(0, 0, 10, 0, 0, PAD_R + 20);
      pg.addColorStop(0, "rgba(125,255,216,0.35)"); pg.addColorStop(1, "rgba(125,255,216,0)");
      g.fillStyle = pg; g.beginPath(); g.arc(0, 0, PAD_R + 20, 0, 6.29); g.fill();
      g.strokeStyle = "rgba(125,255,216,0.8)"; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, PAD_R, 0, 6.29); g.stroke();
      g.lineWidth = 5; g.lineCap = "round"; g.lineJoin = "round";
      for (let k = 0; k < 3; k++) {
        const ph = ((now / 600 + k / 3) % 1), cx = -40 + ph * 80;
        g.strokeStyle = `rgba(220,255,245,${Math.sin(ph * Math.PI) * 0.95})`;
        g.beginPath(); g.moveTo(cx - 12, -18); g.lineTo(cx + 6, 0); g.lineTo(cx - 12, 18); g.stroke();
      }
      g.restore();
    }
    // the spots: a faint pad marks each one; a taken one shows what comes back there and when
    for (const c of world.picks) drawPad(c, WEAPONS[c.type].col, c.type, now);
    for (const c of world.supplies) drawPad(c, SUPPLIES[c.type].col, SUPPLIES[c.type].heal ? "cross" : "shield", now);
    if (world.amp) drawPad(world.amp, "#5b9bff", "amp", now);
    for (const c of world.bombs) drawPad(c, WEAPONS[c.type].col, c.type, now);
    for (const [id, d] of gunDrops) {   // trophies: the crate with a gold ring that blinks as time runs out
      if (grabbed.has("W" + id)) continue;
      const x = sx(d.x), y = sy(d.y) + Math.sin(now / 300 + d.x) * 5, left = GUN_DROP_LIFE - (now - d.born);
      if (!onScreen(x, y, 60) || (left < 3000 && Math.floor(now / 150) % 2)) continue;
      g.strokeStyle = `rgba(255,211,107,${0.6 + 0.3 * Math.sin(now / 120)})`; g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, 30, 0, 6.29); g.stroke();
      drawCrate({ type: d.type, x: d.x, age: 1 }, x, y, now);
    }
    for (let i = 0; i < world.picks.length; i++) {
      const c = world.picks[i];
      if (grabbed.has(c.key)) continue;
      const x = sx(c.x), y = sy(c.y) + Math.sin(now / 400 + i) * 6;
      if (onScreen(x, y, 50)) drawCrate(c, x, y, now);
    }
    for (const c of world.supplies) {
      if (grabbed.has(c.key)) continue;
      const x = sx(c.x), y = sy(c.y) + Math.sin(now / 450 + c.x) * 5;
      if (onScreen(x, y, 60)) drawSupply(c, x, y, now);
    }
    if (world.amp && !grabbed.has(world.amp.key)) {
      const x = sx(world.amp.x), y = sy(world.amp.y);
      if (onScreen(x, y, 80)) drawAmpCrate(world.amp, x, y, now); else if (playing) drawEdgeArrow(x, y, "#5b9bff");
    }
    for (const c of world.bombs) {
      if (grabbed.has(c.key)) continue;
      const x = sx(c.x), y = sy(c.y);
      if (onScreen(x, y, 90)) drawNukeCrate(c, x, y, now); else if (playing) drawEdgeArrow(x, y, WEAPONS[c.type].col);
    }
    // sparks
    for (let i = 0; i < SLOTS; i++) {
      const s = world.sparks[i];
      if (grabbed.has(s.key)) continue;
      const x = sx(s.x), y = sy(s.y);
      if (onScreen(x, y, 40)) drawSpark(x, y, s.gold ? 15 : 9, s.gold, now, s.age);
    }
  }
  // dead bins: hulks, fragments, melting bins, debris
  function drawWreckage(now) {
    for (const h of hulks) {
      const x = sx(h.x), y = sy(h.y), s = BOT;
      if (!onScreen(x, y, s)) continue;
      const char = h.burn ? clamp((now - h.burn) / 2600, 0, 1) : 0;   // burning: it chars black, then crumbles (fades)
      g.globalAlpha = Math.min(1, h.life / 2) * (h.burn ? Math.min(1, Math.max(0, (4200 - (now - h.burn)) / 800)) : 1);
      g.save(); g.translate(x, y); g.rotate(h.a + Math.PI / 2 - SPRITE_TILT);
      if (body) g.drawImage(darkBody(h.ck || [0, 0, 0, 0, 0], h.zap ? 0.8 : 0.58 - 0.45 * char), -s / 2, -s / 2, s, s);
      if (h.burn && now >= h.burn && char < 1) {   // the embers glowing through
        g.globalCompositeOperation = "lighter"; g.globalAlpha *= 0.5 * (1 - char * 0.6) * (0.7 + 0.3 * Math.sin(now / 60));
        g.drawImage(dotSprite("#ff6a1f"), -s * 0.5, -s * 0.5, s, s); g.globalCompositeOperation = "source-over";
      }
      drawDamage(1, s, now, h.x);
      const zk = h.zap ? 1 - (now - h.born) / 2800 : 0;
      if (zk > 0) {   // fried: blue arcs crawl over the shell and it flickers
        g.globalCompositeOperation = "lighter";
        if (Math.random() < 0.5) { g.globalAlpha = 0.35 * zk; g.drawImage(dotSprite("#7fd8ff"), -s * 0.6, -s * 0.6, s * 1.2, s * 1.2); }
        g.lineJoin = "round"; g.lineCap = "round";
        for (let k = 0; k < 3; k++) {
          let a = Math.random() * 6.28, r = s * (0.15 + Math.random() * 0.3), px = Math.cos(a) * r, py = Math.sin(a) * r;
          const pts = [[px, py]];
          for (let n = 0; n < 5; n++) { a += (Math.random() - 0.5) * 1.6; r = clamp(r + (Math.random() - 0.5) * s * 0.2, s * 0.08, s * 0.48); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
          for (const [w, c] of [[6, "rgba(120,200,255,0.35)"], [2, "rgba(200,240,255,0.95)"]]) {
            g.globalAlpha = zk; g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([x2, y2], i) => i ? g.lineTo(x2, y2) : g.moveTo(x2, y2)); g.stroke();
          }
        }
        g.globalCompositeOperation = "source-over";
      }
      g.restore();
      g.globalAlpha = 1;
    }
    for (const f of frags) {
      const x = sx(f.x), y = sy(f.y), s = f.s;
      if (!onScreen(x, y, s)) continue;
      const fade = 1, hot = 1 - (now - f.born) / 5000;
      g.save(); g.translate(x, y); g.rotate(f.a);
      g.translate(-(f.cx / 320 - 0.5) * s, -(f.cy / 320 - 0.5) * s);   // the piece turns around its own middle
      g.globalAlpha = fade; g.drawImage(f.img, -s / 2, -s / 2, s, s);
      if (hot > 0) { g.globalAlpha = fade * hot; g.drawImage(f.glow, -s / 2, -s / 2, s, s); }
      g.restore();
      g.globalAlpha = 1;
    }
    drawMelts(now);
    // wreckage: jagged pieces in the bin's colours with a scorched edge, fading out at the end
    for (const d of debris) {
      const x = sx(d.x), y = sy(d.y);
      if (!onScreen(x, y, 30)) continue;
      g.globalAlpha = Math.min(1, d.life / 2);
      g.save(); g.translate(x, y); g.rotate(d.rot);
      g.beginPath();
      d.shape.forEach((f, j) => { const a = j / d.shape.length * 6.283; g.lineTo(Math.cos(a) * d.size * f * 1.3, Math.sin(a) * d.size * f); });
      g.closePath();
      g.fillStyle = d.col; g.fill();
      g.strokeStyle = "rgba(25,18,32,0.7)"; g.lineWidth = 1.5; g.stroke();
      const dAge = (now - d.born) / 1000;
      if (dAge < 2.5) {   // still glowing hot
        g.strokeStyle = `rgba(255,150,60,${0.8 * (1 - dAge / 2.5)})`; g.lineWidth = 1.2; g.stroke();
      }
      g.restore();
    }
  }
  // additive layer: glowing particles and spark streaks, then the shots
  function drawGlow(now) {
    // glow dots and spark streaks (additive)
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (const p of parts) {
      if (p.k === 2 || p.k === 4 || p.k === 6) continue;   // smoke and fire (clouds, tongues) go over the bins (drawBlastFx)
      if (p.k === 8) {   // a burning chunk: a white-hot core in an orange glow (its trail is fire clouds, updateFx)
        const f = p.life / p.max, d = p.size * 5, x = sx(p.x), y = sy(p.y);
        if (!onScreen(x, y, d)) continue;
        g.globalAlpha = Math.min(1, f * 3); g.drawImage(dotSprite("#ff9a3c"), x - d, y - d, d * 2, d * 2); g.drawImage(dotSprite("#fff3c4"), x - d / 3, y - d / 3, d * 2 / 3, d * 2 / 3);
        continue;
      }
      const x = sx(p.x), y = sy(p.y);
      if (!onScreen(x, y, 30)) continue;
      g.globalAlpha = Math.max(0, p.life / p.max) * 0.9;
      if (p.k === 5) {   // an ember: a tiny hot point that flickers and cools from yellow to dull red
        const f = p.life / p.max, d = p.size * 3.4;
        g.globalAlpha = Math.min(1, f * 2.5) * (0.7 + 0.3 * Math.sin(now / 37 + p.rot * 9));
        g.drawImage(dotSprite(rampOf(p.col)[Math.min(7, 2 + ((1 - f) * 5.5) | 0)]), x - d / 2, y - d / 2, d, d);
      } else if (p.k === 1) {
        g.strokeStyle = p.col; g.lineWidth = p.size;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - p.vx * p.len, y - p.vy * p.len); g.stroke();
      } else {
        const f = p.life / p.max, hot = p.k === 3;
        const d = p.size * (hot ? 3.5 + (1 - f) * 5 : 2.6);
        const col = hot ? (f > 0.8 ? "#fff1c2" : f > 0.5 ? "#ffc34e" : f > 0.25 ? "#ff7724" : "#a83b23") : p.col;
        g.drawImage(dotSprite(col), x - d / 2, y - d / 2, d, d);
      }
    }
    g.globalAlpha = 1;
    for (const s of shots) {
      const x = sx(s.x), y = sy(s.y);
      if (!(s.traced && (s.kind === K.BULLET || s.kind === K.PELLET)) && onScreen(x, y, s.kind === K.GAMMA ? 120 : 60)) drawShot(s, x, y, now);
    }
    for (const m of maws) {   // a demonic orb drinking everything in: it swells and its heart races before it bursts
      const x = sx(m.x), y = sy(m.y), k = Math.min(1, m.t / GAMMA_SUCK.t);
      if (onScreen(x, y, 120)) drawDemonicOrb(x, y, 30 + 30 * k * k + Math.sin(now / 30) * 3 * k, now * (1 + 3 * k));
    }
    g.globalCompositeOperation = "source-over";
  }
  // the other pilots, then me
  function drawPilots(now) {
    // bots
    for (const r of remotes.values()) {
      if (r.dead) continue;
      const x = sx(r.x), y = sy(r.y);
      if (onScreen(x, y, BOT * 2)) drawBot(r, x, y, now, false, { blink: r.inv });
      else drawPointer(r, x, y);
    }
    if (serverRun && !srv.placed) {}   // (not placed by the server yet: a moment)
    else if (!me.dead) drawBot(me, sx(me.x + srv.vox), sy(me.y + srv.voy), now, true, { name: playing && !COMPACT.matches ? me.name : "", blink: now < me.inv });   // (vox: a correction still fading, drawn only)   // on a small screen your own label goes
    else {
      g.textAlign = "center"; g.fillStyle = "#ffffff";
      g.font = `700 ${30 * TS}px ` + DISPLAY_FONT;
      g.fillText((killer ? "Killed by " + killer + " · " : "Boom! ") + "back in " + Math.max(1, Math.ceil((me.respawnAt - now) / 1000)) + "…", vw / 2, vh / 2);
    }
  }
