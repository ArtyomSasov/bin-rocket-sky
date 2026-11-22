  function drawBlackHole(now) { for (const bh of holesNow()) drawHole(bh, now); }
  function drawHole(bh, now) {
    const x = sx(bh.x), y = sy(bh.y), k = bh.k, t = now / 1000;
    const R = 360 * k;
    if (!onScreen(x, y, R)) { if (playing) drawEdgeArrow(x, y, "#c38bff"); return; }
    if (!lowQ && R > 30) {
      // copy what is already drawn around the hole, then repaint it in rings that are
      // magnified and twisted more and more toward the centre
      const sc = dpr * zoom, size = Math.ceil(2 * R * sc);
      if (lensCv.width !== size) { lensCv.width = lensCv.height = size; } else lctx.clearRect(0, 0, size, size);
      const px = Math.round((x - R) * sc), py = Math.round((y - R) * sc);
      const ax = Math.max(0, px), ay = Math.max(0, py), bx = Math.min(cv.width, px + size), by = Math.min(cv.height, py + size);
      if (bx > ax && by > ay) lctx.drawImage(cv, ax, ay, bx - ax, by - ay, ax - px, ay - py, bx - ax, by - ay);
      const N = 24;   // more rings = softer steps between them
      for (let i = N; i >= 1; i--) {
        const f = 1 - (i - 0.5) / N;
        const mag = 1 + f * f * 2.0 * k, rot = (f * f * 2.2 + Math.sin(t * 0.8) * 0.12 * f) * k;
        g.save(); g.beginPath(); g.arc(x, y, R * i / N, 0, 6.29); g.clip();
        g.translate(x, y); g.rotate(rot); g.scale(mag, mag);
        g.drawImage(lensCv, -R, -R, 2 * R, 2 * R);
        g.restore();
      }
    }
    // Interstellar-style look: a thin, almost edge-on hot disk crossing in front, the far side of the
    // disk bent up over the top and down under the bottom by gravity (the halo), a hair-thin photon
    // ring around a pure black shadow, and the approaching (left) side brighter than the receding one.
    const r0 = 58 * k;                     // shadow radius (= kill radius)
    const DISK_IN = 1.55, DISK_OUT = 3.6, FLAT = 0.11;
    // warm glow
    g.globalCompositeOperation = "lighter";
    const glow = g.createRadialGradient(x, y, r0, x, y, r0 * 4.2);
    glow.addColorStop(0, "rgba(255,200,130,0.32)"); glow.addColorStop(0.4, "rgba(255,150,80,0.12)"); glow.addColorStop(1, "rgba(255,120,60,0)");
    g.fillStyle = glow; g.beginPath(); g.arc(x, y, r0 * 4.2, 0, 6.29); g.fill();
    // lensed far side of the disk: one smooth glowing ring, a little taller than wide, brighter on the left
    g.save(); g.translate(x - r0 * 0.08, y); g.scale(1, 1.14);
    const hg = g.createRadialGradient(0, 0, r0 * 0.98, 0, 0, r0 * 2.05);
    hg.addColorStop(0, `rgba(255,250,235,${0.95 * k})`); hg.addColorStop(0.18, `rgba(255,225,165,${0.75 * k})`);
    hg.addColorStop(0.5, `rgba(255,170,90,${0.28 * k})`); hg.addColorStop(1, "rgba(255,130,60,0)");
    g.fillStyle = hg; g.beginPath(); g.arc(0, 0, r0 * 2.05, 0, 6.29); g.fill();
    g.restore();
    // disk bands; back half (upper) first
    // the disk itself: a flattened ring filled with a smooth hot gradient; the left half gets a second,
    // additive pass so the side moving toward us is brighter
    const band = (front) => {
      g.save(); g.beginPath();
      if (front) g.rect(x - r0 * 5, y, r0 * 10, r0 * 3); else g.rect(x - r0 * 5, y - r0 * 3, r0 * 10, r0 * 3);
      g.clip();
      g.translate(x, y); g.scale(1, FLAT);
      const dg = g.createRadialGradient(0, 0, r0 * DISK_IN * 0.92, 0, 0, r0 * DISK_OUT);
      dg.addColorStop(0, "rgba(255,240,210,0)"); dg.addColorStop(0.04, `rgba(255,252,240,${0.95 * k})`);
      dg.addColorStop(0.3, `rgba(255,220,160,${0.7 * k})`); dg.addColorStop(0.7, `rgba(255,160,80,${0.3 * k})`); dg.addColorStop(1, "rgba(255,120,50,0)");
      g.fillStyle = dg;
      g.beginPath(); g.arc(0, 0, r0 * DISK_OUT, 0, 6.29); g.arc(0, 0, r0 * DISK_IN * 0.92, 0, 6.29, true); g.fill("evenodd");
      g.beginPath(); g.rect(-r0 * DISK_OUT, -r0 * DISK_OUT, r0 * DISK_OUT, r0 * DISK_OUT * 2); g.clip();
      g.globalAlpha = 0.45 + 0.1 * Math.sin(t * 2);
      g.beginPath(); g.arc(0, 0, r0 * DISK_OUT, 0, 6.29); g.arc(0, 0, r0 * DISK_IN * 0.92, 0, 6.29, true); g.fill("evenodd");
      g.restore();
      g.globalAlpha = 1;
    };
    band(false);
    // hot clumps orbiting in the disk (back ones now, front ones after the shadow)
    const clumps = front => {
      const n = lowQ ? 14 : 34;
      for (let i = 0; i < n; i++) {
        const rr = r0 * (DISK_IN + (DISK_OUT - DISK_IN) * ((i * 0.618) % 1));
        const th = i * 2.4 + t * (2.4 / Math.sqrt(rr / r0));
        if ((Math.sin(th) > 0) !== front) continue;
        const px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr * FLAT;
        const dop = 0.5 + 0.5 * -Math.cos(th);   // left side brighter
        g.globalAlpha = (0.25 + 0.6 * dop) * k;
        g.fillStyle = "#fff4dc";
        g.beginPath(); g.ellipse(px, py, 3 + dop * 5, 1.1, 0, 0, 6.29); g.fill();
      }
    };
    clumps(false);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    // the shadow, with a soft edge
    const sh = g.createRadialGradient(x, y, r0 * 0.9, x, y, r0 * 1.08);
    sh.addColorStop(0, "#000000"); sh.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sh; g.beginPath(); g.arc(x, y, r0 * 1.08, 0, 6.29); g.fill();
    g.fillStyle = "#000000"; g.beginPath(); g.arc(x, y, r0 * 0.92, 0, 6.29); g.fill();
    // photon ring
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = `rgba(255,244,220,${0.85 * k})`; g.lineWidth = 1.6;
    g.beginPath(); g.arc(x, y, r0 * 1.02, 0, 6.29); g.stroke();
    // front half of the disk crosses in front of the shadow
    band(true);
    clumps(true);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }

