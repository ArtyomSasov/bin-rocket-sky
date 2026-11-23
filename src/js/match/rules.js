  // UT99 pickups: ordinary health caps at 100; super health at 199.
  const SUPPLIES = {
    med: { name: "Health Pack +20", col: "#ff5a6e", heal: HP(20), cap: HP(100), period: 20, icon: "cross" },
    vial: { name: "Health Vial +5", col: "#6ddcff", heal: HP(5), cap: HP(199), period: 30, icon: "cross" },
    bigmed: { name: "Big Keg +100", col: "#ff2d55", heal: HP(100), cap: HP(199), period: 100, icon: "cross", big: true },
    pads: { name: "Thigh Pads · 50", col: "#8fc6ff", armor: HP(50), layer: "padsArmor", period: 30, icon: "shield" },
    shield: { name: "Body Armor · 100", col: "#4fe39a", armor: HP(100), layer: "bodyArmor", period: 30, icon: "shield" },
    mega: { name: "Shield Belt · 150", col: "#ffd85e", armor: HP(150), layer: "beltArmor", period: 60, icon: "shield", big: true }
  };
  // game modes: picked with a new lobby and carried in its code ("<size>1<mode>...", e.g. M1CK7QX); a plain code is deathmatch
  // rules: teams (Red/Blue, no friendly fire); flags (capture the flag); only: the one gun everyone has (no crates,
  // nukes or Overdrive); cdMul: reload multiplier for players, botCd: for bots (x their usual pace); instagib: a hit
  // kills; noSupplies: no medkits or shields
  const MODES = {
    d: { name: "Deathmatch", label: "Deathmatch", hint: "everyone for themselves" },
    t: { name: "Team Deathmatch", label: "Team DM", hint: "Red against Blue", teams: true },
    c: { name: "Capture the Flag", label: "CTF", hint: "steal their flag", teams: true, flags: true, goal: "flags" },
    h: { name: "King of the Hill", label: "Hill", hint: "hold the hill alone", hill: true, goal: "holds" },
    l: { name: "Last Bin Standing", label: "Last Bin", hint: "no respawn until one is left", lastStanding: true, goal: "wins" },
    j: { name: "Juggernaut", label: "Juggernaut", hint: "hold the Quad while all hunt you", juggernaut: true, goal: "points" },
    n: { name: "Nukes only", label: "Nukes", hint: "unlimited nukes", only: "nuke", cdMul: 2.2, botCd: 6 },
    r: { name: "Railgun instagib", label: "Instagib", hint: "one rail hit kills", only: "rail", botCd: 3, instagib: true, noSupplies: true },
    // the test range: every gun at once with endless ammo (and the teleporter), to try them all out
    x: { name: "Test range", label: "Test range", hint: "every gun, endless ammo", sandbox: true }
  };
  // the guns the test range hands out (the retired ones stay out), in gun-bar order
  const SANDBOX_GUNS = ["fire", "minigun", "scatter", "shard", "gren", "rocket", "laser", "orb", "rail", "saw", "mine", "gamma", "nuke", "holy", "void"];   // (saw: the Blood Blade)
  const modeOf = code => MODES[codeOpts(code).mode] ? codeOpts(code).mode : "d";
  // match settings: round length (minutes) and a score that ends the round early (kills, or flags in CTF)
  const TIME_OPTS = { 2: 3, 3: 5, 4: 8, 5: 10, 6: 15 }, TIME_DEFAULT = "3";
  // a mode's own score (goal: what its pilots count besides kills, carried as their caps) and the limits it is played to
  const GOALS = { flags: [3, 5, 10], holds: [12, 24, 36], wins: [3, 5, 10], points: [12, 24, 36] };   // (a hold: 5 s alone on the hill; a win: the last one left; a point: 5 s as the Juggernaut)
  const SCORE_OPTS = { 2: 0, 3: 1, 4: 2 }, KILL_LIMITS = [10, 20, 30];
  const timeOf = code => TIME_OPTS[codeOpts(code).time] ? codeOpts(code).time : TIME_DEFAULT;
  const scoreOf = code => SCORE_OPTS[codeOpts(code).score] !== undefined ? codeOpts(code).score : "";
  const goalOf = m => MODES[m].goal || "";   // "" : kills
  const respawnDelay = () => MODES[MODE].lastStanding ? Infinity : RESPAWN_MS;   // (the heat's end brings it back: standingTick)
  const scoreLimit = code => { const s = scoreOf(code); return s ? (GOALS[goalOf(modeOf(code))] || KILL_LIMITS)[SCORE_OPTS[s]] : 0; };
  const limitText = (n, m) => n + " " + (goalOf(m) || "kills");
  let MODE = "d";
  const TEAM_NAME = ["Red", "Blue"], TEAM_HEX = ["#ff5a6e", "#4fa8ff"], TEAM_RGB = ["255,90,110", "79,168,255"];
  // the guns by their number on the wire (retired ones keep their place, so older pages still read the rest)
  const WEAPON_KEYS = ["fire", "triple", "laser", "rocket", "nuke", "scatter", "rail", "mine", "orb", "bolt", "shard", "holy", "saw", "gamma", "tele", "minigun", "gauss", "nail", "gren", "gauntlet", "void"];
  // rounds on the shared clock: ROUND_PLAY seconds of fighting (the lobby's time limit), then 15 seconds of results
  let ROUND_PLAY = 300, SCORE_LIMIT = 0;
  const ROUND_BREAK = 15;
  let ROUND_LEN = ROUND_PLAY + ROUND_BREAK;
  function setMatch(code) { ROUND_PLAY = TIME_OPTS[timeOf(code)] * 60; ROUND_LEN = ROUND_PLAY + ROUND_BREAK; SCORE_LIMIT = scoreLimit(code); }
  let matchStart = 0, matchRound = 0, matchEnd = 0, matchReady = false;
  function startMatch(ms) { matchStart = ms; matchRound = 0; matchEnd = 0; matchReady = true; }
  function roundAt(ms) {
    // Each lobby starts a full round when created, independent of the wall-clock minute.
    if (!matchReady) return { idx: -1, ph: 0, live: false, left: ROUND_PLAY, next: 0 };
    let end = matchEnd || matchStart + ROUND_PLAY * 1000;
    if (ms >= end + ROUND_BREAK * 1000) {
      matchStart = end + ROUND_BREAK * 1000; matchRound++; matchEnd = 0;
      const skipped = Math.floor(Math.max(0, ms - matchStart) / (ROUND_LEN * 1000));
      matchStart += skipped * ROUND_LEN * 1000; matchRound += skipped;
      end = matchStart + ROUND_PLAY * 1000;
    }
    return { idx: matchRound, ph: Math.max(0, ms - matchStart) / 1000, live: ms < end,
      left: Math.max(0, end - ms) / 1000, next: Math.max(0, end + ROUND_BREAK * 1000 - ms) / 1000 };
  }
  function receiveMatchClock(value) {
    if (!Array.isArray(value) || value.length !== 3) return;
    const [round, start, end] = value;
    if (!Number.isSafeInteger(round) || round < 0 || !Number.isFinite(start) || start <= 0 || Math.abs(start - clockNow()) > 86400000
      || !Number.isFinite(end) || (end !== 0 && (end < start || end > start + ROUND_PLAY * 1000))) return;
    if (!matchReady || round > matchRound) {
      matchRound = round; matchStart = start; matchEnd = end; matchReady = true;
    } else if (round === matchRound && Math.abs(start - matchStart) < 1 && end && (!matchEnd || end < matchEnd)) matchEnd = end;
  }
  // armour (in lives, like health): it takes only ARMOR_SOAK of each hit, the rest still hurts; at most MAX_SHIELD
  const MAX_SHIELD = 4.5, ARMOR_SOAK = 0.75; let SUPPLY_SLOTS = 0;
  // the big bombs: one huge blast each. Inside kill nothing survives; out to R the damage falls from 4 to 1.5 lives.
  // The holy bomb is thrown, bounces, sings a choir sing seconds before its fuse runs out, then outdoes the nuke
  const BOOM_LIFE = 4;
  // big-bomb crates, each on its own spot: once taken, it comes back at the start of its next cycle (s)
  const BOMB_CRATES = { nuke: { key: "N", period: 70 }, holy: { key: "H", period: 60 }, void: { key: "V", period: 80 } };
  // wave: [reach, seconds to get there, push at the centre] of the blast wave that flings everything outward
  // edge: past R, out to where its shock wave ends (wave[0]), the nuke still hurts, from this much down to nothing:
  // what is seen inside the blast is felt
  const BOMBS = { [K.VOID]: { R: 320, kill: 0, damage: HP(40), carve: 120, wave: [700, 0.6, -900], void: true }, [K.NUKE]: { R: 1100, kill: 0, damage: HP(1000), edge: HP(45), carve: 420, wave: [2800, 1.3, 4200] },
                  [K.HOLY]: { R: 2000, kill: 1300, carve: 700, wave: [3600, 1.5, 3000], sing: 2.55, holy: true, wipe: true } };   // sing: the holy bomb's sound (2.53 s) starts so it ends with the blast   // wipe: bodies inside kill are erased whole
  const bombReach = bm => bm.edge ? bm.wave[0] : bm.R;
  const bombDmg = (bm, d) => bm.damage ? (d <= bm.R ? Math.max(bm.damage * (1 - d / bm.R), bm.edge || 0) : bm.edge ? bm.edge * Math.max(0, 1 - (d - bm.R) / (bm.wave[0] - bm.R)) : 0)
    : d < bm.kill ? 99 : 1.5 + 2.5 * (1 - (d - bm.kill) / (bm.R - bm.kill));
