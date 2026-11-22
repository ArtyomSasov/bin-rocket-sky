  function heatLayers(b, h) {
    if (h.layers && (h.mass === b.mass || heatBudget <= 0)) return h.layers;
    heatBudget--;
    const R1 = h.r * 1.45, S = Math.min(1024, Math.ceil(R1 * 2));
    const reuse = h.layers || [heatPool.pop(), heatPool.pop()];
    h.layers = ["255,240,140", "255,70,20"].map((col, n) => {
      const c = reuse[n] || document.createElement("canvas");
      if (c.width !== S) c.width = c.height = S;
      const q = c.getContext("2d");
      q.globalCompositeOperation = "copy";
      const gr = q.createRadialGradient(R1, R1, h.r * 0.8, R1, R1, R1);
      gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.3, `rgba(${col},0.95)`); gr.addColorStop(1, `rgba(${col},0)`);
      q.fillStyle = gr; q.fillRect(0, 0, S, S);
      q.globalCompositeOperation = "destination-in";
      q.drawImage(b.cv, (h.lx - R1) * BODY_RES, (h.ly - R1) * BODY_RES, S * BODY_RES, S * BODY_RES, 0, 0, S, S);
      return c;
    });
    h.mass = b.mass; h.R1 = R1;
    return h.layers;
  }
  function drawBodies(now) {
    heatBudget = 4;
    for (const b of bodies) {
      const x = sx(b.x), y = sy(b.y), ring = b.ringB && !b.free;
      if (!onScreen(x, y, ring ? b.ringHalf : b.star ? b.rr * 2.4 : b.r)) continue;
      const mr = b.mass / b.mass0;
      if (b.planet && !b.bare) {   // the atmosphere thins out as the planet is chipped away
        const pal = PLANET_PAL[b.kind], ag = g.createRadialGradient(x, y, b.rr * 0.92, x, y, b.rr * 1.28);
        ag.addColorStop(0, `rgba(${pal.glow},${0.5 * mr})`); ag.addColorStop(1, `rgba(${pal.glow},0)`);
        g.fillStyle = ag; g.beginPath(); g.arc(x, y, b.rr * 1.28, 0, 6.29); g.fill();
      }
      if (ring) g.drawImage(b.ringB, x - b.ringHalf, y - b.ringHalf, b.ringHalf * 2, b.ringHalf * 2);
      g.save(); g.translate(x, y); g.rotate(b.a);
      g.drawImage(b.cv, -b.hw, -b.hh, b.hw * 2, b.hh * 2);
      if (b.heat && b.heat.length) {
        g.globalCompositeOperation = "lighter";
        for (let i = b.heat.length - 1; i >= 0; i--) {
          const h = b.heat[i], k = 1 - (now - h.t) / 2600;
          if (k <= 0) { const [h0] = b.heat.splice(i, 1); if (h0.layers && heatPool.length < 24) heatPool.push(...h0.layers); continue; }
          const [hot, cool] = heatLayers(b, h), R1 = h.R1, D = R1 * 2;
          g.globalAlpha = k * k * k; g.drawImage(hot, h.lx - R1 - b.hw, h.ly - R1 - b.hh, D, D);
          g.globalAlpha = k * k * (1 - k); g.drawImage(cool, h.lx - R1 - b.hw, h.ly - R1 - b.hh, D, D);
        }
        g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      }
      g.restore();
      if (ring) g.drawImage(b.ringF, x - b.ringHalf, y - b.ringHalf, b.ringHalf * 2, b.ringHalf * 2);
      if (b.star && b.planet) {   // the sun: a white-hot core and a wide pulsing corona over the lava ball
        const mr = b.mass / b.mass0, k = (0.85 + 0.15 * Math.sin(now / 900)) * mr;
        g.globalCompositeOperation = "lighter";
        const cg = g.createRadialGradient(x, y, b.rr * 0.3, x, y, b.rr * 2.4);
        cg.addColorStop(0, `rgba(255,250,220,${0.55 * k})`); cg.addColorStop(0.35, `rgba(255,200,90,${0.35 * k})`); cg.addColorStop(1, "rgba(255,120,40,0)");
        g.fillStyle = cg; g.beginPath(); g.arc(x, y, b.rr * 2.4, 0, 6.29); g.fill();
        g.globalCompositeOperation = "source-over";
      }
      if (b.kind === "lava" && b.planet && !b.bare) {
        g.globalCompositeOperation = "lighter";
        const lg = g.createRadialGradient(x, y, b.rr * 0.7, x, y, b.rr * 1.25);
        lg.addColorStop(0, "rgba(255,90,30,0)"); lg.addColorStop(0.75, `rgba(255,90,30,${(0.12 + 0.08 * Math.sin(now / 400)) * mr})`); lg.addColorStop(1, "rgba(255,90,30,0)");
        g.fillStyle = lg; g.beginPath(); g.arc(x, y, b.rr * 1.25, 0, 6.29); g.fill();
        g.globalCompositeOperation = "source-over";
      }
    }
  }

  buildPlanets("lobby");

