// A match simulated on the server: the game's own rules (see headless.mjs) stepped at a fixed rate, with
// everything that only shows or sounds switched off. Players are pilots driven by their input (addPilot in
// src/js/15-bots.js), judged by the same code as the bots.
import { loadGame } from "./headless.mjs";

// Runs inside the game's scope. Function declarations there are ordinary bindings, so the server replaces the
// purely visual and audio ones with no-ops; the rules that decide outcomes stay untouched.
const BRIDGE = `
  puff = sparkShower = smoke = impact = explode = swallowFx = dashBurst = afterburner = trailFrom = damageFx = deathFx =
    announce = audioCue = sfx = packPlay = packLoop = blip = boomSound = choir = feedPush = () => false;
  const pilotView = b => ({ id: b.id, name: b.name, human: !!b.input, x: b.x, y: b.y, vx: b.vx, vy: b.vy, a: b.a, dead: b.dead, lives: b.lives,
    weapon: botWeapon(b), kills: b.st.kills, deaths: b.st.deaths, shots: b.st.shots });
  globalThis.__simBot = id => botById.get(id);   // the live pilot object, for tests and tools
  globalThis.__simDet = () => det.map(b => b.cells.join(""));   // every body's solid cells, to compare with a browser
  globalThis.__sim = {
    start(code, n, level) {
      worldCode = code; setMapSize(mapOf(code)); buildPlanets(code); setMode(modeOf(code)); setMatch(code);
      clockBase = clockOff = clockTarget = 0; startMatch(clockNow());
      bots.length = 0; botById.clear(); remotes.clear();
      addBots(n, level);
      for (const b of bots) Object.assign(b, spawnPoint(b.tm));
    },
    addPilot(name) { const b = addPilot(name); Object.assign(b, spawnPoint(b.tm)); return b.id; },
    removePilot(id) { removePilot(id); },
    input(id, i) { const b = botById.get(id); if (b && b.input) Object.assign(b.input, i); },
    // one fixed step: the shared-clock world, the simulation, then every pilot published to the others it sees
    step(dt, now) {
      worldTick(now);
      update(dt, now);
      botStates(now);
      // what only the screen keeps: dropped here, since no frame ever draws it
      parts.length = 0; impacts.length = 0; rings.length = 0; floaters.length = 0; arcs.length = 0; beams.length = 0; lasers.length = 0;
      hulks.length = 0; frags.length = 0; debris.length = 0;
    },
    pilot: id => botById.has(id) ? pilotView(botById.get(id)) : null,
    get pilots() { return bots.map(pilotView); },
    get info() {
      return { map: MAPS[mapThemeOf(worldCode)].name, mode: MODE, round: stats.round, live: roundLive, bodies: bodies.length,
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
  return { mx, my, aim: Number.isFinite(i.aim) ? Math.atan2(Math.sin(i.aim), Math.cos(i.aim)) : 0, fire: i.fire === true, boost: i.boost === true,
    dash: Number.isSafeInteger(i.dash) && i.dash >= 0 ? i.dash : 0 };
}

export function createMatch({ code = "m1d0c", bots = 0, level = "normal" } = {}) {
  const game = loadGame(BRIDGE);
  const sim = game.__sim;
  sim.start(code, bots, level);
  return {
    step: (dt, now = performance.now()) => { game.__setNow(now); sim.step(dt, now); },
    addPilot: name => sim.addPilot(name),
    removePilot: id => sim.removePilot(id),
    input: (id, i) => sim.input(id, cleanInput(i)),
    pilot: id => sim.pilot(id),
    get pilots() { return sim.pilots; },
    get info() { return sim.info; },
    dispose: () => game.__dispose(),   // stops the match's timers so it can be freed
    game
  };
}
