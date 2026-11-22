  function spawnPoint(tm) {
    if (stationMap()) {
      const cells = [];
      for (let y = 2; y < 19; y++) for (let x = 2; x < 19; x++) if (foundryOpen(x, y) && (tm !== 0 && tm !== 1 || (tm === 0 ? x < 7 : x > 13))) cells.push([x, y]);
      return foundryPoint(...cells[Math.floor(Math.random() * cells.length)]);
    }
    const half = bases && (tm === 0 || tm === 1), rx = () => half ? (tm ? W / 2 : 0) + rndIn(W / 2, 300) : rndIn(W, 300);
    let x = rx(), y = rndIn(H, 300);
    for (let k = 0; k < 30 && inBody(x, y, 160); k++) { x = rx(); y = rndIn(H, 300); }
    return { x, y };
  }
  // where a pilot comes back after dying: of a few spots on its side, the one furthest from any living enemy, so it is
  // not born into a fight (the same rule on every screen and the server)
  function safeSpawn(o) {
    const foes = [];
    if (o !== me && playing && !me.dead && !mates(me, o)) foes.push(me);
    for (const [id, r] of remotes) if (id !== o.id && !r.dead && !mates(r, o)) foes.push(r);
    let best = null, bestD = -1;
    for (let k = 0; k < 8; k++) {
      const p = spawnPoint(o.tm);
      let d = Infinity;
      for (const f of foes) d = Math.min(d, Math.hypot(f.x - p.x, f.y - p.y));
      if (d > bestD) { bestD = d; best = p; }
      if (!foes.length) break;
    }
    return best;
  }
