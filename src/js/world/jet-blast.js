  // ---------- the engine's jet pushes what is behind a bin: smoke, sparks, drops, debris, chunks, cases, wrecks ----------
  // a cone along each main jet, as long as the flame (much longer on boost); the push fades with distance and falls
  // on light things hardest (a hulk barely moves)
  function jetBlast(dt) {
    const bins = [];
    if (playing && !me.dead) bins.push(me);
    for (const r of remotes.values()) if (!r.dead) bins.push(r);
    for (const b of bots) if (!b.dead && !remotes.has(b.id)) bins.push(b);
    for (const b of bins) {
      const boost = b === me ? me.boostFx > 0 : (b.boost || 0) > 0 || b.boosting, th = Math.max(boost ? 1 : 0, b.thrust || 0);
      if (th < 0.2 || Math.abs(b.x - cam.x) > vw || Math.abs(b.y - cam.y) > vh) continue;
      const j = exhaustJets(b, performance.now()).find(o => o.main) || null;
      if (!j) continue;
      const ux = Math.cos(j.a), uy = Math.sin(j.a), L = (boost ? 340 : 170), F = (boost ? 2600 : 900) * Math.min(1.2, th) * dt;
      const push = (o, w) => {
        const dx = o.x - j.x, dy = o.y - j.y, along = dx * ux + dy * uy;
        if (along < 0 || along > L) return;
        const side = Math.abs(-dx * uy + dy * ux);
        if (side > 18 + along * 0.35) return;   // (a cone, widening behind)
        const f = F * (1 - along / L) * w; o.vx += ux * f; o.vy += uy * f;
      };
      for (const p of parts) if (p.k === 2 || p.k === 4 || p.k === 1 || p.k === 5) push(p, p.k === 2 ? 0.8 : 0.5);
      for (const d of oilDrops) push(d, 0.6);
      for (const c of casings) push(c, 1);
      for (const d of debris) push(d, 0.8);
      for (const c of chunks) push(c, Math.min(1, 6 / Math.max(3, c.r)));
      for (const f of frags) push(f, 0.3);
      for (const h of hulks) push(h, 0.08);
    }
  }
