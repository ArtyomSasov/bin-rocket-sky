  // ---------- deep-space backdrop: bright stars everywhere, plus landmarks (see buildSky) ----------
  const seamless = (size, paint) => {   // paint(ctx, x, y) is called for each wrap copy so the tile repeats cleanly
    const c = document.createElement("canvas"); c.width = c.height = size;
    const x = c.getContext("2d");
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) paint(x, ox, oy);
    return c;
  };
  const STAR_TILE = 1200;
  const brightStars = seamless(STAR_TILE, (n, ox, oy) => {
    const cols = ["#ffffff", "#cfe3ff", "#ffe9c4", "#ffd0f0", "#c9fff6"];
    for (let i = 0; i < 34; i++) {
      const x = hash(i, 7, 62) * STAR_TILE + ox, y = hash(i, 8, 62) * STAR_TILE + oy, r = 0.9 + hash(i, 9, 62) * 1.6;
      if (x < -20 || x > STAR_TILE + 20 || y < -20 || y > STAR_TILE + 20) continue;
      const col = cols[i % cols.length];
      const gl = n.createRadialGradient(x, y, 0, x, y, r * 5);
      gl.addColorStop(0, col); gl.addColorStop(0.25, col + "66"); gl.addColorStop(1, col + "00");
      n.fillStyle = gl; n.beginPath(); n.arc(x, y, r * 5, 0, 6.29); n.fill();
      if (i % 5 === 0) {   // a few with diffraction spikes
        n.strokeStyle = col + "aa"; n.lineWidth = 0.8;
        n.beginPath(); n.moveTo(x - r * 9, y); n.lineTo(x + r * 9, y); n.moveTo(x, y - r * 9); n.lineTo(x, y + r * 9); n.stroke();
      }
    }
  });
  const galaxyCv = (() => {
    const S = 420, c = document.createElement("canvas"); c.width = c.height = S;
    const x = c.getContext("2d");
    x.translate(S / 2, S / 2); x.rotate(0.5); x.scale(1, 0.42);
    for (let i = 0; i < 900; i++) {   // two spiral arms of faint dots
      const t = i / 900 * 9, arm = i % 2 ? Math.PI : 0, rr = 8 + t * 20;
      const a = t + arm + (hash(i, 1, 63) - 0.5) * 0.6;
      x.fillStyle = `rgba(${i % 3 ? "220,200,255" : "255,220,240"},${0.25 * (1 - t / 9) + 0.05})`;
      x.fillRect(Math.cos(a) * rr + (hash(i, 2, 63) - 0.5) * 14, Math.sin(a) * rr + (hash(i, 3, 63) - 0.5) * 14, 2, 2);
    }
    const core = x.createRadialGradient(0, 0, 0, 0, 0, 60);
    core.addColorStop(0, "rgba(255,240,230,0.8)"); core.addColorStop(1, "rgba(255,200,240,0)");
    x.fillStyle = core; x.beginPath(); x.arc(0, 0, 60, 0, 6.29); x.fill();
    return c;
  })();

  // the Milky Way: a long glowing band of packed stars with dark dust lanes, fading out at both ends
  const milkyCv = (() => {
    const Wd = 1800, Hd = 560, c = document.createElement("canvas"); c.width = Wd; c.height = Hd;
    const x = c.getContext("2d"), mid = Hd / 2;
    const band = x.createLinearGradient(0, 0, 0, Hd);
    band.addColorStop(0, "rgba(160,150,255,0)"); band.addColorStop(0.5, "rgba(190,175,255,0.14)"); band.addColorStop(1, "rgba(160,150,255,0)");
    x.fillStyle = band; x.fillRect(0, 0, Wd, Hd);
    for (let i = 0; i < 46; i++) {   // brighter star clouds along it
      const cx = hash(i, 1, 71) * Wd, cy = mid + (hash(i, 2, 71) - 0.5) * Hd * 0.3, r = 50 + hash(i, 3, 71) * 150;
      const col = ["255,220,200", "200,190,255", "255,200,235", "190,225,255"][i % 4], gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, `rgba(${col},${0.06 + hash(i, 4, 71) * 0.07})`); gr.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, 6.29); x.fill();
    }
    for (let i = 0; i < 5200; i++) {   // packed stars, thickest along the middle
      const sx2 = hash(i, 5, 71) * Wd, sy2 = mid + (hash(i, 6, 71) + hash(i, 7, 71) + hash(i, 8, 71) - 1.5) * Hd * 0.32, b = hash(i, 9, 71);
      x.fillStyle = `rgba(${b < 0.15 ? "255,225,200" : b < 0.3 ? "200,215,255" : "245,240,255"},${0.25 + b * 0.6})`;
      const s = b > 0.97 ? 2 : b > 0.8 ? 1.4 : 1; x.fillRect(sx2, sy2, s, s);
    }
    x.globalCompositeOperation = "destination-out";   // dark dust lanes winding through the middle
    for (let i = 0; i < 70; i++) {
      const cx = i / 70 * Wd, cy = mid + Math.sin(i * 0.37) * 28 + (hash(i, 10, 71) - 0.5) * 30, r = 26 + hash(i, 11, 71) * 46;
      const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, 6.29); x.fill();
    }
    x.globalCompositeOperation = "destination-in";
    const ends = x.createLinearGradient(0, 0, Wd, 0);
    ends.addColorStop(0, "rgba(0,0,0,0)"); ends.addColorStop(0.25, "rgba(0,0,0,1)"); ends.addColorStop(0.75, "rgba(0,0,0,1)"); ends.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = ends; x.fillRect(0, 0, Wd, Hd);
    return c;
  })();
  // a nebula: a lumpy cloud of glowing gas in a few colours with stars inside, soft at the edges
  const nebCloud = (seed, cols) => {
    const S = 900, c = document.createElement("canvas"); c.width = c.height = S / 2;   // soft: built at half size, drawn twice as big
    const x = c.getContext("2d");
    x.scale(0.5, 0.5);
    for (let i = 0; i < 46; i++) {
      const a = hash(i, 1, seed) * 6.283, d = (hash(i, 2, seed) + hash(i, 3, seed)) * 0.5 * S * 0.32;
      const cx = S / 2 + Math.cos(a) * d * 1.3, cy = S / 2 + Math.sin(a) * d * 0.8, r = 70 + hash(i, 4, seed) * 170, col = cols[i % cols.length];
      const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r), al = 0.05 + hash(i, 5, seed) * 0.09;
      gr.addColorStop(0, `rgba(${col},${al})`); gr.addColorStop(0.5, `rgba(${col},${al * 0.45})`); gr.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, 6.29); x.fill();
    }
    for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(255,255,255,${0.3 + hash(i, 6, seed) * 0.6})`; x.fillRect(S / 2 + (hash(i, 7, seed) - 0.5) * S * 0.6, S / 2 + (hash(i, 8, seed) - 0.5) * S * 0.45, 1.3, 1.3); }
    x.globalCompositeOperation = "destination-in";
    const fade = x.createRadialGradient(S / 2, S / 2, S * 0.15, S / 2, S / 2, S / 2);
    fade.addColorStop(0, "rgba(0,0,0,1)"); fade.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = fade; x.fillRect(0, 0, S, S);
    return c;
  };
  const NEB_ART = [
    nebCloud(61, ["255,80,200", "130,90,255", "255,130,170"]),
    nebCloud(64, ["60,200,255", "70,230,190", "110,140,255"]),
    nebCloud(67, ["255,140,80", "255,80,110", "255,200,120"])
  ];
  // a far gas giant (lit from one side, with a thin ring)
  const farPlanet = (base, band) => {
    const S = 360, R = 110, c = document.createElement("canvas"); c.width = c.height = S;
    const x = c.getContext("2d"), m = S / 2;
    x.save(); x.beginPath(); x.arc(m, m, R, 0, 6.29); x.clip();
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    for (let k = 0; k < 9; k++) { x.fillStyle = k % 2 ? band : "rgba(255,255,255,0.06)"; x.fillRect(0, m - R + k * R * 0.23 + Math.sin(k) * 6, S, R * 0.1 + (k % 3) * 4); }
    const sh = x.createRadialGradient(m - R * 0.45, m - R * 0.4, R * 0.2, m, m, R * 1.25);
    sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(0.6, "rgba(2,3,12,0.55)"); sh.addColorStop(1, "rgba(2,3,12,0.97)");
    x.fillStyle = sh; x.fillRect(0, 0, S, S);
    x.restore();
    x.strokeStyle = "rgba(220,210,255,0.35)"; x.lineWidth = 5;
    x.beginPath(); x.ellipse(m, m, R * 1.6, R * 0.32, -0.25, 0, 6.29); x.stroke();
    x.strokeStyle = "rgba(220,210,255,0.15)"; x.lineWidth = 12;
    x.beginPath(); x.ellipse(m, m, R * 1.85, R * 0.4, -0.25, 0, 6.29); x.stroke();
    return c;
  };
  const FAR_PLANETS = [farPlanet("#6a4a8a", "rgba(255,190,220,0.18)"), farPlanet("#3a6a7a", "rgba(180,240,255,0.18)"), farPlanet("#8a5a3a", "rgba(255,210,150,0.2)")];
  // the landmarks of this lobby's sky: placed on the map (same for everyone), drawn with parallax: the lower par,
  // the farther away it is and the slower it slides past
  let sky = [];
  function buildSky(seed) {
    const r = k => hash(seed, k, 909), big = Math.max(1, W / 4200);
    sky = [{ img: milkyCv, x: r(1) * W, y: r(2) * H, par: 0.22, rot: r(3) * 3.14, sc: 1.5 * big, a: 0.95, glow: true }];
    for (let i = 0; i < Math.round(2 * big); i++)
      sky.push({ img: galaxyCv, x: r(10 + i) * W, y: r(20 + i) * H, par: 0.28 + r(30 + i) * 0.06, rot: r(40 + i) * 6.28, sc: 0.8 + r(50 + i) * 0.9, a: 0.85, glow: true, spin: 0.01 });
    for (let i = 0; i < Math.round(4 * big); i++)
      sky.push({ img: NEB_ART[i % 3], x: r(60 + i) * W, y: r(70 + i) * H, par: 0.35 + r(80 + i) * 0.15, rot: r(90 + i) * 6.28, sc: 2 * (1.1 + r(100 + i) * 0.9), a: 0.9, glow: true });
    for (let i = 0; i < Math.round(1.5 * big); i++)
      sky.push({ img: FAR_PLANETS[i % 3], x: r(110 + i) * W, y: r(120 + i) * H, par: 0.5 + r(130 + i) * 0.1, rot: 0, sc: 0.28 + r(140 + i) * 0.22, a: 0.6 });   // small and dim: never mistaken for a real planet
    sky.sort((p, q) => p.par - q.par);
  }
  const DUST = [[0.25, 700, 60, 1, 0.5], [0.8, 900, 50, 1.6, 0.8]].map(([par, tile, count, size, alpha]) => {
    const c = document.createElement("canvas"); c.width = c.height = tile;
    const x = c.getContext("2d"); x.fillStyle = `rgba(255,240,255,${alpha})`;
    for (let i = 0; i < count; i++) x.fillRect(hash(i, tile, 11) * tile, hash(i, tile, 12) * tile, size, size);
    return { par, tile, c };
  });

