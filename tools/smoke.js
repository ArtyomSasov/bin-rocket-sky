// Smoke test for a built page. It needs debug hooks on window.__t (bodies, bots, shots, me, deathFx, hurt,
// flagCarrier, bases, MODE...), added by a test build, and a lobby code in window.__code, e.g. "M1C0SBASE"
// (CTF on the Solar map). Load it with a <script> tag, wait, then read window.__smoke.
(async () => {
  const errs = []; addEventListener("error", e => errs.push(String(e.message)));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const key = (c, d) => dispatchEvent(new KeyboardEvent(d ? "keydown" : "keyup", { code: c, key: c }));
  // play as the lobby's host (only the host brings bots): this browser "made" the code
  try { localStorage.setItem("binrocket.hosted", JSON.stringify([window.__code.toLowerCase()])); } catch {}
  [...document.querySelectorAll('#botCount button')].find(b => /6/.test(b.textContent)).click();
  document.getElementById("lobbyInput").value = window.__code; document.getElementById("lobbyInput").dispatchEvent(new Event("input"));
  document.querySelector("form").requestSubmit();
  await wait(1500);
  // need a live round with time left (shooting is off during the results break)
  const left = () => { const t = document.getElementById("roundInfo").textContent, mm = t.match(/(\d+):(\d\d)$/); return t.startsWith("Round") && mm ? +mm[1] * 60 + +mm[2] : 0; };
  while (left() < 75) await wait(1000);
  const T = __t, m = T.me; m.inv = 1e15;
  const out = { mode: T.mode, title: document.getElementById("boardTitle").textContent, bodies: T.bodies.length };
  const fired = {};
  const solo = { n: "nuke", r: "rail" }[T.mode];
  for (const w of solo ? [solo] : ["fire", "triple", "laser", "rocket", "scatter", "rail", "mine", "orb", "bolt", "shard", "nuke"]) {
    if (m.dead) await wait(3300);
    m.arsenal[w] = 30; m.weapon = w; await wait(1300);
    const before = new Set(T.myShotLog.map(e => e.d[0]));
    key("KeyF", 1); await wait(250); key("KeyF", 0);
    // A shot may already have hit a wall or expired; inspect emitted shots, not only survivors.
    fired[w] = [...new Set(T.myShotLog.filter(e => !before.has(e.d[0])).map(e => e.d[5]))].join(",");
  }
  out.fired = fired;
  if (!solo) {
    // A nearby nuke kills through invulnerability; wait for its flight and respawn before equipping.
    while (m.dead || T.shots.some(s => s.mine && s.kind === 3)) await wait(40);
    m.inv = 1e15;
    const alt = {};
    for (const w of ["rocket", "scatter", "triple", "mine"]) {
      m.arsenal[w] = 30; m.weapon = w; await wait(1800);
      const a0 = m.arsenal[w]; key("KeyC", 1); await wait(80); key("KeyC", 0); await wait(30); alt[w] = a0 - m.arsenal[w];
    }
    out.altCost = alt;
  }
  for (let i = 0; i < 4; i++) T.deathFx({ x: m.x + 200, y: m.y + i * 30, vx: 0, vy: 0, a: 0, lv: 3, ck: [0, 0, 0, 0, 0] }, 3, i, 0.4);
  const fr = []; let last = performance.now();
  await new Promise(res => { const loop = t => { fr.push(t - last); last = t; if (fr.length < 600) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
  fr.sort((a, b) => a - b); out.frame = fr[300].toFixed(1) + "/" + fr[570].toFixed(1);
  out.botKills = T.bots.reduce((s, b) => s + b.st.kills, 0); out.botWeapons = [...new Set(T.bots.map(b => b.weapon))].join(",");
  if (T.bases) {
    // Bots have already exercised combat; keep them from stealing a flag during the capture check.
    for (const b of T.bots) { b.dead = true; b.fc = -1; b.respawnAt = Infinity; }
    m.inv = 1e15;
    const ef = 1 - m.tm, B = T.bases;
    for (let i = 0; i < 60 && m.fc !== ef; i++) { m.dead = false; m.x = B[ef].x; m.y = B[ef].y; m.vx = m.vy = 0; await wait(40); }
    for (let i = 0; i < 120 && !m.caps; i++) { m.x = B[m.tm].x; m.y = B[m.tm].y; m.vx = m.vy = 0; await wait(40); }
    out.ctfCaps = m.caps;
  }
  out.errors = errs;
  window.__smoke = out;
})();
