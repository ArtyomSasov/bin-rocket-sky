  // ---------- game modes ----------
  let bases = null;   // capture the flag: [red, blue] home pads
  const isTeams = () => !!MODES[MODE].teams;
  const onTeam = o => o.tm === 0 || o.tm === 1;   // tm is 0, 1 or undefined (outside team modes, or not heard yet)
  // a pilot's look as drawn: in team modes the body and lid take the team colour
  const teamCk = o => isTeams() && onTeam(o) ? Object.assign((o.ck || [0, 0, 0, 0, 0]).slice(), { team: o.tm }) : o.ck;
  const mates = (a, b) => isTeams() && onTeam(a) && a.tm === b.tm;
  function baseArsenal() {
    const o = MODES[MODE].only;
    me.arsenal = o ? { [o]: Infinity } : { fire: Infinity }; me.weapon = o || "fire";
    laserHeat = 0; overheated = false;   // a new life or round: the laser starts cold
  }
  function findBase(t) {
    const x = t ? W - Math.max(380, W * 0.1) : Math.max(380, W * 0.1);
    for (let k = 0; k < 40; k++) { const y = H / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 120; if (!inBody(x, y, 260)) return { x, y }; }
    return { x, y: H / 2 };
  }
  // join the smaller team (a tie keeps the given one); my bots fill in, starting with the other side
  function pickTeam(tie) {
    const n = [0, 0];
    for (const [id, r] of remotes) if (!botById.has(id) && onTeam(r)) n[r.tm]++;
    me.tm = n[0] < n[1] ? 0 : n[1] < n[0] ? 1 : tie;
    bots.forEach((b, i) => { b.tm = (me.tm + 1 + i) % 2; b.attacker = i % 4 < 2; });
  }
  // the lobby's teams are only known once the others' states arrive: re-check then, before the first fight
  function settleTeam() {
    if (!isTeams() || !playing || stats.kills || stats.deaths || performance.now() - joinedAt > 8000) return;   // only right after joining
    const was = me.tm;
    pickTeam(was);
    if (me.tm === was) return;
    if (bases) { Object.assign(me, spawnPoint(me.tm)); for (const b of bots) Object.assign(b, spawnPoint(b.tm)); }
    renderBoard();
  }
  let joinedAt = 0;
  function setMode(m) {
    MODE = MODES[m] ? m : "d"; joinedAt = performance.now();
    baseArsenal(); renderWeapon();
    if (isTeams()) pickTeam(Math.random() < 0.5 ? 0 : 1);
    else { me.tm = undefined; for (const b of bots) b.tm = undefined; }
    me.fc = -1; me.caps = 0;
    for (const b of bots) { b.fc = -1; b.caps = 0; }
    bases = MODES[MODE].flags ? [findBase(0), findBase(1)] : null;
  }
