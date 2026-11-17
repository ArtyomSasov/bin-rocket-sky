  // Stable controls are independent of inventory and mode; protocol IDs stay in WEAPON_KEYS.
  const WEAPON_SLOTS = ["fire", "gauntlet", "minigun", "scatter", "rocket", "gren", "laser", "orb", "rail", "nail", "shard", "saw", "mine", "gamma", "nuke", "holy"];
  const weaponKey = k => { const i = WEAPON_SLOTS.indexOf(k); return i < 0 ? "Q/E" : (i >= 10 ? "Alt+" : "") + ((i % 10 + 1) % 10); };
  const controlledKind = k => ({ gamma: K.GAMMA, mine: K.MINE })[k];
  const controlledShots = k => shots.filter(s => (s.mine || mySrvShot(s)) && s.life > 0 && !s.boom && s.kind === controlledKind(k));
  const hasWeapon = k => !WEAPONS[k]?.disabled && (!!me.arsenal[k] || controlledShots(k).length > 0);
  let rejectAt = -Infinity, lastWeaponStatus = "", wasLungeReady = true;
  function rejectFire(reason, now) {
    if (now - rejectAt < 700) return;
    rejectAt = now; audioCue("refuse");
    floaters.push({ x: me.x, y: me.y - 65, t: 0, txt: reason, gold: false });
  }
  function reconcileWeapons(now) {
    let changed = false;
    for (const k of ["gamma", "mine"]) if (me.arsenal[k] === 0 && !controlledShots(k).length) { delete me.arsenal[k]; changed = true; }
    if (!hasWeapon(me.weapon)) { me.weapon = "fire"; changed = true; }
    if (changed) renderWeapon();
    const status = chipText();
    if (status !== lastWeaponStatus) { lastWeaponStatus = status; renderAmmo(me.weapon); }
    const ready = now >= lungeReady;
    if (ready && !wasLungeReady && me.weapon === "gauntlet" && !me.dead) audioCue("ready");
    wasLungeReady = ready;
  }
  // Slab intersection against permanent station walls only. Destructible terrain
  // retains its established blast behaviour. Touching a wall on the source side is allowed.
  function fixedCover(x, y, tx, ty) {
    for (const b of bodies) if (b.fixed && !b.dead) {
      let near = 0, far = 1;
      for (const [p, d, lo, hi] of [[x, tx - x, b.x - b.hw, b.x + b.hw], [y, ty - y, b.y - b.hh, b.y + b.hh]]) {
        if (Math.abs(d) < 1e-9) { if (p <= lo || p >= hi) { far = -1; break; } }
        else { const a = (lo - p) / d, z = (hi - p) / d; near = Math.max(near, Math.min(a, z)); far = Math.min(far, Math.max(a, z)); }
      }
      if (far - near > 1e-6 && far > 1e-6 && near < 1 - 1e-6) return true;
    }
    return false;
  }
  function clearAim(x, y, tx, ty) {
    if (fixedCover(x, y, tx, ty)) return false;
    const d = Math.hypot(tx - x, ty - y), steps = Math.ceil(d / 4);
    for (let i = 1; i < steps; i++) if (solidAny(x + (tx - x) * i / steps, y + (ty - y) * i / steps)) return false;
    return true;
  }

  const ALT_HINTS = {
    fire: "Enforcer: instant accurate shots; alternate fire is faster with wider spread. Unlimited starting ammo.",
    rocket: "Hold alternate fire to load one rocket every 0.45 s, up to three. Release for a straight salvo; ammo cost equals rockets loaded.",
    minigun: "Primary: 14 HP hitscan bullets, 10/s. Alternate: large 38 HP Stinger shards, one every 0.28 s; primary costs 1 ammo, alternate costs 2.",
    scatter: "Slug: longer range and a stronger push than the close-range pellet fan; 2 ammo.",
    shard: "Flak shell: a lofted shell explodes for up to 70 HP and releases five shards on impact or landing; 1 ammo.",
    gren: "Volley: three bouncing grenades to cover several routes; 3 ammo.",
    gauntlet: "Lunge: free, forward-only melee approach; 1.2 s recharge and 0.2 s protection. Dash uses movement direction and costs energy.",
    nail: "Spike: a fast, precise round that passes through multiple bins; 2 ammo. Walls still stop it.",
    saw: "Ripper: primary discs ricochet; alternate discs explode on contact; 1 ammo.",
    mine: "Detonate works with zero ammo while your mines are active.",
    gamma: "One slow orb controls a 280 px zone: green pulses drain nearby enemies. ALT detonates for up to 80 HP, including after the last ammo. Walls block damage.",
    laser: "Pulse Gun: rapid green plasma bolts; hold alternate fire for a short green beam, 1 ammo per tick. Cover blocks both modes.",
    rail: "Precision shot: 80 HP, 1.8 s between shots. Primary fire only. Armor absorbs damage; permanent walls block the beam."
  };
  const weaponHint = k => WEAPONS[k].name + " · " + weaponKey(k) + ". " + (ALT_HINTS[k] || "Q/E cycles carried weapons. Right click or C uses alternate fire when available.");
