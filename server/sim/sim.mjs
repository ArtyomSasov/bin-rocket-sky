// A match simulated on the server: the game's own rules (see headless.mjs) stepped at a fixed rate, with
// everything that only shows or sounds switched off. Players are pilots driven by their input (addPilot in
// src/js/pilots/bot-update.js), judged by the same code as the bots.
import { loadGame } from "./headless.mjs";

// Runs inside the game's scope. Function declarations there are ordinary bindings, so the server replaces the
// purely visual and audio ones with no-ops; the rules that decide outcomes stay untouched.
// BRS_HITLOG=1 (a tool's switch, never on in a match): every check of a player's laser-pistol shot against a pilot
// near its line, as one "HITLOG {...}" line on stdout (tools/hits.mjs lines them up with what the screen showed)
const HITLOG = `
  { const th0 = targetHit;
    targetHit = (s, o) => { const r = th0(s, o);
      if (s.kind === K.PISTOL && botById.get(s.owner)?.input && o.id !== s.owner) {
        const p = hitPose(s, o), dx = s.x - s.px, dy = s.y - s.py, L = Math.hypot(dx, dy) || 1, perp = ((p.x - s.px) * dy - (p.y - s.py) * dx) / L, along = ((p.x - s.px) * dx + (p.y - s.py) * dy) / L;
        if (r || Math.abs(perp) < 90 && along > -90 && along < L + 90) console.log("HITLOG " + JSON.stringify({ t: Date.now(), id: s.id, r, perp: Math.round(perp), along: Math.round(along), L: Math.round(L),
          rad: Math.round(BIN_R + shotRadius(s)), rew: Math.round(performance.now() - (s.hitTime || performance.now())), hist: p !== o, dead: !!p.dead, life: +s.life.toFixed(3) }));
      }
      return r; };
  }
`;
const BRIDGE = `
  puff = sparkShower = smoke = impact = explode = swallowFx = dashBurst = afterburner = trailFrom = damageFx = deathFx =
    announce = audioCue = sfx = packPlay = packLoop = feedPush = wallMark = wallBreach = surfaceHit = scorchMark = pitMark = chunkOff = oilOnBody = oilSplash = rebuildSolidGrid = ejectCasing = railMelt = wreckBlows = jetBlast = swingStart = bakeDecal = emitPlume = bladeSwing = bladeClash = bladeHumSet = () => false;
  const pilotView = b => ({ id: b.id, name: b.name, human: !!b.input, x: b.x, y: b.y, vx: b.vx, vy: b.vy, a: b.a, dead: b.dead, lives: b.lives,
    weapon: botWeapon(b), kills: b.st.kills, deaths: b.st.deaths, shots: b.st.shots, repeats: b.cqRepeats || 0 });   // repeats: commands flown again for want of new ones
  let serverSeq = 0;
  globalThis.__simBot = id => botById.get(id);
  globalThis.__simBots = () => bots;   // every pilot, for tests and tools
  globalThis.__simWorld = () => world;   // the pick-ups as they lie now   // the live pilot object, for tests and tools
  globalThis.__simCleanChat = t => typeof t === "string" ? cleanChatText(t) : "";   // a chat line as every screen cleans it (ui/chat.js)
  globalThis.__simConst = { WEAPON_KEYS, K };   // protocol numbers, for tests and tools
  globalThis.__simShots = () => shots;   // the shots in flight, for tests and tools
  globalThis.__simTerrain = { rubble: () => rubble, det: () => det, carveAt, shove,   // for tests and tools
    empty() { bodies.length = 0; planets.length = 0; ROCKS = 0; world.rocks.length = 0; eventAt = () => ({ cyc: 0, ph: 0, et: 0, type: "meteors", active: false, warn: false }); } };   // an open field (tests of timing, where a passing moon must not be in the way)
  // where things lie on a station, for tests: the pick-up spots, the props, the cell size and which cells are floor
  globalThis.__simArena = () => ({ spots: [...arena.guns, ...arena.supplies, arena.amp].filter(Boolean).map(o => [o.x, o.y]),
    props: det.filter(b => b.prop).map(b => [b.x, b.y, Math.max(b.hw, b.hh)]), unit: W / FOUNDRY_N, open: stationMap() ? (x, y) => foundryOpen(x, y) : null });
  globalThis.__simQuad = () => world.amp;   // the Quad damage pick-up as it lies now (null while taken)
  globalThis.__simMove = { pilotMove, moveState, setMoveState };   // a player's command flight, for tests
  globalThis.__simDet = () => det.map(b => b.cells.join(""));   // every body's solid cells, to compare with a browser
  globalThis.__sim = {
    start(code, n, level) {
      worldCode = code; setMapSize(mapOf(code)); buildPlanets(code); setMode(modeOf(code)); setMatch(code);
      clockBase = clockOff = clockTarget = 0; startMatch(clockNow());
      bots.length = 0; botById.clear(); remotes.clear();
      addBots(n, level);
      for (const b of bots) Object.assign(b, spawnPoint(b.tm));
    },
    addPilot(name) { const b = addPilot(name); if (!b) return null; Object.assign(b, spawnPoint(b.tm)); return b.id; },
    removePilot(id) { removePilot(id); },
    // at: when it arrived (the server's clock). Older controls arriving after newer ones (the data channel keeps no
    // order) are dropped. The controls a step started with are kept, so the step can fly them
    // until that moment and the new ones after it, as the player's screen did (see the split in updateBots)
    input(id, i, at) {
      const b = botById.get(id); if (!b || !b.input) return;
      // flight commands queue up in their own order, each flown once: a repeat of one already had is skipped, and one
      // that comes late (the data channel keeps no order) still goes in its place
      if (i.c && i.c.length) {
        b.cq ||= [];
        for (const c of i.c) {
          c.at = Number.isFinite(at) ? at : 0;   // when it came in (the server's own clock: how long it then waits in the queue is its measure)
          // the moment it was made is the screen's word: believed only near the shared clock here (a rock is not dodged by a fib)
          if (!(c.ct > 0) || Math.abs(c.ct - clockNow()) > 400) c.ct = clockNow();   // (none said: the server's own clock; rocks are never skipped)
          if (c.s <= (b.cmdAck || 0) || b.cq.some(q => q.s === c.s)) continue;
          if (b.cqOwed > 0 && c.s === (b.cmdAck || 0) + 1) { b.cqOwed--; b.cmdAck = c.s; b.lastCmd = c; if (b.jkN !== undefined) b.jkN++; continue; }   // its time was flown already (the last command, again)
          let k = b.cq.length; while (k > 0 && b.cq[k - 1].s > c.s) k--;
          b.cq.splice(k, 0, c);
        }
        if (b.cq.length > 60) b.cq.splice(0, b.cq.length - 60);   // (a second's worth: more is a screen running fast, not lag)
      }
      delete i.c;
      if (i.s && i.s < b.input.s) return;
      if (!b.prevIn) b.prevIn = { ...b.input }; Object.assign(b.input, i); b.inAt = at;
    },
    // a player whose connection dropped: their controls let go (the last command, flown again while none come, no
    // longer steers, boosts or fires), until they come back or their pilot goes
    release(id) {
      const b = botById.get(id); if (!b || !b.input) return;
      Object.assign(b.input, { mx: 0, my: 0, fire: false, alt: false, boost: false, brake: false, gx: 0, gy: 0 });
      if (b.lastCmd) b.lastCmd = { ...b.lastCmd, mx: 0, my: 0, boost: false, brake: false, fire: false, alt: false };
    },
    rtt(id, ms) { const b = botById.get(id); if (b && b.input) b.rtt = ms; },
    // one fixed step: the shared-clock world and the simulation
    step(dt, now) {
      // a player's newest controls start to count with this step: from its start, so ak/ag say how long they have flown
      for (const b of bots) {
        b.split = 0;
        if (!b.input || b.cq || b.input.s === b.ackSeq) { b.prevIn = null; continue; }   // (a pilot flown by commands says its own ack)
        // the moment it arrived, within this step: flown from there, and counted from there (ag)
        const from = now - dt * 1000, at = Number.isFinite(b.inAt) ? Math.min(now, Math.max(from, b.inAt)) : from;
        b.ackSeq = b.input.s; b.ackAt = at; b.split = (at - from) / 1000;
      }
      worldTick(now);
      update(dt, now);
      for (const b of bots) b.prevIn = null;
      // what only the screen keeps: dropped here, since no frame ever draws it
      parts.length = 0; impacts.length = 0; rings.length = 0; floaters.length = 0; arcs.length = 0; beams.length = 0; lasers.length = 0;
      hulks.length = 0; frags.length = 0; debris.length = 0;
    },
    // what everyone receives, in the form a lobby host's state has always had (src/js/net/server-snapshots.js reads it): the
    // round clock, every pilot with its shots, hits and kills, and what changed in the world. Building it also
    // shows the pilots to each other (bots aim at what they see), so it is built at the send rate even unwatched
    packet(now) {
      return { q: ++serverSeq, rd: stats.round, ts: Date.now(), mc: matchReady ? [matchRound, matchStart, matchEnd] : undefined,
        bots: botStates(now), g: myGrabs.slice(),
        cv: myCarves.filter(e => performance.now() - e.at < 4000).slice(-128).map(e => e.d),
        terrain: nextTerrain() || undefined, rk: nextRockMotion(), rb: rubbleWire() || undefined,
        wd: myGunDrops.filter(d => Date.now() - d[5] < GUN_DROP_LIFE).slice(-3).map(d => d.slice(0, 5)) };
    },
    pilot: id => botById.has(id) ? pilotView(botById.get(id)) : null,
    get bots() { let n = 0; for (const b of bots) if (!b.input) n++; return n; },
    get pilots() { return bots.map(pilotView); },
    get info() {
      return { map: MAPS[mapThemeOf(worldCode)].name, mode: MODE, round: stats.round, live: roundLive, bodies: bodies.length, walls: bodies.filter(b => b.fixed).length, innerWalls: det.filter(b => b.wall && !b.dead && !b.free).length, props: det.filter(b => b.prop && !b.dead).length,
        solidCells: bodies.reduce((s, b) => s + b.mass, 0), shots: shots.length,
        kills: bots.reduce((s, b) => s + b.st.kills, 0), deaths: bots.reduce((s, b) => s + b.st.deaths, 0) };
    }
  };
`;

const unit = v => Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
// A player's input as the server accepts it: anything missing or out of range becomes neutral, never an error.
export function cleanInput(i = {}) {
  let mx = unit(i.mx), my = unit(i.my);
  const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
  const count = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
  return { mx, my, aim: Number.isFinite(i.aim) ? Math.atan2(Math.sin(i.aim), Math.cos(i.aim)) : 0, fire: i.fire === true, alt: i.alt === true,
    boost: i.boost === true, brake: i.brake === true, dash: count(i.dash), w: Number.isInteger(i.w) && i.w >= 0 && i.w < 64 ? i.w : -1,
    s: count(i.s),   // s: the controls' number, counted up by the player's screen with each message
    gx: unit(i.gx), gy: unit(i.gy), gb: count(i.gb),   // a guided nuke: the stick steering it, and the count of blow-ups
    // c: the newest flight commands, [number, stick x, stick y (thousandths), facing (thousandths of a radian),
    // boost 1 + brake 2, dash count] (pilotMove in src/js/pilots/commands.js); a few repeat in each message, for losses
    ...(Array.isArray(i.c) ? { c: i.c.slice(-16).filter(e => Array.isArray(e) && e.length >= 6 && e.length <= 8 && e.every(Number.isSafeInteger) && e[0] > 0).map(e => ({
      ct: e.length >= 7 && Number.isFinite(i.cb) ? i.cb - Math.max(0, Math.min(5000, e[6])) : 0,
      // va: the moment of the others their screen showed as it made this command (their 8th number: how long before vb,
      // in the snapshots' own time), here on this process's clock; only a bound on it is believed (pilotLag)
      va: e.length === 8 && Number.isFinite(i.vb) ? i.vb - Math.max(0, Math.min(5000, e[7])) - performance.timeOrigin : 0,
      s: e[0], mx: unit(e[1] / 1000), my: unit(e[2] / 1000), aim: Math.max(-4, Math.min(4, e[3] / 1000)), boost: !!(e[4] & 1), brake: !!(e[4] & 2), fire: !!(e[4] & 4), alt: !!(e[4] & 8), dash: Math.max(0, e[5]) })) } : {}),
    ld: Number.isFinite(i.ld) ? Math.max(0, Math.min(150, Math.round(i.ld))) : -1 };   // ld: how far back their screen shows the others (ms; -1: not said)
}

export function createMatch({ code = "m1d0c", bots = 0, level = "normal" } = {}) {
  const game = loadGame(BRIDGE + (process.env.BRS_HITLOG ? HITLOG : ""));
  const sim = game.__sim;
  sim.start(code, bots, level);
  return {
    step: (dt, now = performance.now()) => { game.__setNow(now); sim.step(dt, now); },
    // stamped with the moment the step stands for, not the moment the timer fired: the steps are evenly spaced in
    // simulated time, so a screen that places them on a timeline (interpolation) sees even motion
    packet: (now = performance.now()) => { game.__setNow(now); const p = sim.packet(now); p.ts = Math.round(performance.timeOrigin + now); return p; },
    addPilot: name => sim.addPilot(name),
    removePilot: id => sim.removePilot(id),
    input: (id, i, at = performance.now()) => sim.input(id, cleanInput(i), at),
    // the player's round trip (ms), measured by the server: how far back their shots are judged (at most 250 ms)
    release: id => sim.release(id),
    rtt: (id, ms) => sim.rtt(id, Math.max(0, Math.min(1000, Number(ms) || 0))),
    pilot: id => sim.pilot(id),
    cleanChat: t => game.__simCleanChat(t),   // (the game's own rule for a chat line)
    get pilots() { return sim.pilots; },
    get bots() { return sim.bots; },   // how many AI bots fly (a count, cheap)
    get info() { return sim.info; },
    dispose: () => game.__dispose(),   // stops the match's timers so it can be freed
    game
  };
}
